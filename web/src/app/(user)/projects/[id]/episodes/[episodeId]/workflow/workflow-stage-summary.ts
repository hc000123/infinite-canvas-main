import type { WorkflowStageView, WorkflowViewStatus } from "./workflow-view-types";

type RemoteStageSummary = { attempt?: number; stageId: string; status: WorkflowViewStatus };
export type WorkflowStageSummaryInput = { generatedCount?: number; missingAssetCount?: number; packageCount?: number; remoteStages?: RemoteStageSummary[]; scriptReady: boolean; workerReady: boolean };

const definitions: Array<Pick<WorkflowStageView, "description" | "key" | "label">> = [
    { key: "script", label: "剧本确认", description: "锁定本集生产原文" },
    { key: "asset-extraction", label: "资产解析", description: "识别、增减并校正资产槽位" },
    { key: "asset-production", label: "资产生产", description: "生成、上传、绑定或保留文字占位" },
    { key: "storyboard", label: "结构化分镜", description: "拆分并确认镜头、节奏与连续性" },
    { key: "prompt", label: "最终提示词", description: "结合分镜和参考图生成模型执行稿" },
    { key: "video", label: "视频生成与预览", description: "人工确认计费参数并启动视频" },
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
    const assetCatalogReady = done(extraction);
    const breakdown = remoteStatus(status("shot-breakdown"), input.workerReady, assetCatalogReady);
    const shotPrompt = status("shot-prompt");
    const packages = input.packageCount || 0;
    const generated = input.generatedCount || 0;

    return definitions.map((stage): WorkflowStageView => {
        if (stage.key === "script") return { ...stage, status: input.scriptReady ? "complete" : "blocked", blockingReason: input.scriptReady ? undefined : "本集还没有可用的确认稿" };
        if (stage.key === "asset-extraction") return { ...stage, status: extraction, blockingReason: extraction === "blocked" ? workerReason(input.workerReady, input.scriptReady) : undefined };
        if (stage.key === "asset-production") return { ...stage, status: imagePrompt, count: input.missingAssetCount ? `${input.missingAssetCount} 个占位` : undefined, blockingReason: imagePrompt === "blocked" ? "请先批准资产槽位" : undefined };
        if (stage.key === "storyboard") return { ...stage, status: breakdown, count: packages ? `${packages} 镜` : undefined, blockingReason: breakdown === "blocked" ? !input.workerReady ? workerReason(false, true) : "请先批准资产槽位；图片可稍后补齐" : undefined };
        if (stage.key === "prompt") {
            const prompt = remoteStatus(shotPrompt, input.workerReady, done(breakdown));
            return { ...stage, status: prompt, count: packages ? `${packages} 镜` : undefined, blockingReason: prompt === "blocked" ? "请先批准结构化分镜" : undefined };
        }
        const prompt = remoteStatus(shotPrompt, input.workerReady, done(breakdown));
        const video = done(prompt) ? packages && generated === packages ? "complete" : "ready" : "blocked";
        return { ...stage, status: video, count: packages ? `${generated}/${packages}` : undefined, blockingReason: video === "blocked" ? !input.workerReady ? workerReason(false, true) : "请先批准最终提示词" : undefined };
    });
}

function done(status: WorkflowViewStatus) { return ["approved", "applied", "complete"].includes(status); }
function remoteStatus(status: WorkflowViewStatus | undefined, workerReady: boolean, dependencyReady: boolean): WorkflowViewStatus {
    if (status === "blocked" && dependencyReady && workerReady) return "ready";
    if (status && status !== "idle") return status;
    return dependencyReady && workerReady ? "ready" : "blocked";
}
function workerReason(workerReady: boolean, dependencyReady: boolean) { return !dependencyReady ? "请先完成上一阶段" : !workerReady ? "工作流执行器暂不可用，已有内容仍可查看和编辑" : undefined; }
