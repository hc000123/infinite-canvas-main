import type { WorkflowStageView, WorkflowViewStatus } from "./workflow-view-types";

type RemoteStageSummary = { attempt?: number; stageId: string; status: WorkflowViewStatus };
export type WorkflowStageSummaryInput = { generatedCount?: number; missingAssetCount?: number; packageCount?: number; remoteStages?: RemoteStageSummary[]; scriptReady: boolean; workerReady: boolean };

const definitions: Array<Pick<WorkflowStageView, "description" | "key" | "label">> = [
    { key: "script", label: "剧本确认", description: "锁定本集生产原文" },
    { key: "assets", label: "资产设计", description: "提取资产、设计提示词并绑定图片" },
    { key: "video", label: "镜头生产", description: "拆分、修改、生成提示词与视频" },
    { key: "delivery", label: "审核交付", description: "检查结果、连续性与导出" },
];

export function summarizeWorkflowStages(input: WorkflowStageSummaryInput): WorkflowStageView[] {
    const latest = new Map<string, RemoteStageSummary>();
    for (const stage of input.remoteStages || []) {
        const current = latest.get(stage.stageId);
        if (!current || (stage.attempt || 0) > (current.attempt || 0)) latest.set(stage.stageId, stage);
    }
    const status = (id: string) => latest.get(id)?.status;
    const extraction = remoteStatus(status("asset-extraction"), input.workerReady, input.scriptReady);
    const imagePrompt = remoteStatus(status("asset-image-prompt"), input.workerReady, done(extraction));
    const assetsReady = imagePrompt === "applied";
    const breakdown = remoteStatus(status("shot-breakdown"), input.workerReady, assetsReady);
    const shotPrompt = status("shot-prompt");
    const packages = input.packageCount || 0;
    const generated = input.generatedCount || 0;

    return definitions.map((stage): WorkflowStageView => {
        if (stage.key === "script") return { ...stage, status: input.scriptReady ? "complete" : "blocked", blockingReason: input.scriptReady ? undefined : "本集还没有可用的确认稿" };
        if (stage.key === "assets") {
            const visible = done(extraction) ? imagePrompt : extraction;
            return { ...stage, status: visible, count: input.missingAssetCount ? `${input.missingAssetCount} 个待补图` : undefined, blockingReason: visible === "blocked" ? workerReason(input.workerReady, input.scriptReady) : undefined };
        }
        if (stage.key === "video") {
            const active = !done(breakdown) ? breakdown : shotPrompt && ["queued", "running", "cancel_requested", "needs_review", "failed", "rejected"].includes(shotPrompt) ? shotPrompt : packages ? (generated === packages ? "complete" : "ready") : breakdown;
            return { ...stage, status: active, count: packages ? `${generated}/${packages}` : undefined, blockingReason: active === "blocked" ? !assetsReady ? "请先生成并绑定全部资产草图" : workerReason(input.workerReady, true) : undefined };
        }
        return { ...stage, status: packages && generated === packages ? "complete" : packages ? "ready" : "idle", count: packages ? `${generated}/${packages}` : undefined };
    });
}

function done(status: WorkflowViewStatus) { return ["approved", "applied", "complete"].includes(status); }
function remoteStatus(status: WorkflowViewStatus | undefined, workerReady: boolean, dependencyReady: boolean): WorkflowViewStatus {
    if (status === "blocked" && dependencyReady && workerReady) return "ready";
    if (status && status !== "idle") return status;
    return dependencyReady && workerReady ? "ready" : "blocked";
}
function workerReason(workerReady: boolean, dependencyReady: boolean) { return !dependencyReady ? "请先完成上一阶段" : !workerReady ? "工作流执行器暂不可用，已有内容仍可查看和编辑" : undefined; }
