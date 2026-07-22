import type { WorkflowStageView, WorkflowViewStatus } from "./workflow-view-types";

type RemoteStageSummary = { attempt?: number; stageId: string; status: WorkflowViewStatus };

export type WorkflowStageSummaryInput = {
    generatedCount?: number;
    missingAssetCount?: number;
    packageCount?: number;
    remoteStages?: RemoteStageSummary[];
    scriptReady: boolean;
    workerReady: boolean;
};

const stageDefinitions: Array<Pick<WorkflowStageView, "description" | "key" | "label">> = [
    { key: "script", label: "剧本确认", description: "确认本集生产稿" },
    { key: "art", label: "导演与美术", description: "生成并审核视觉设定" },
    { key: "assets", label: "资产准备", description: "匹配角色、场景与道具" },
    { key: "storyboard", label: "分镜提示词", description: "生成并确认生产包" },
    { key: "video", label: "视频生成", description: "逐条生成与同步版本" },
    { key: "delivery", label: "审核交付", description: "完成全集问题检查" },
];

export function summarizeWorkflowStages(input: WorkflowStageSummaryInput): WorkflowStageView[] {
    const latest = new Map<string, RemoteStageSummary>();
    for (const stage of input.remoteStages || []) {
        const current = latest.get(stage.stageId);
        if (!current || (stage.attempt || 0) > (current.attempt || 0)) latest.set(stage.stageId, stage);
    }
    const remote = new Map(Array.from(latest, ([stageId, stage]) => [stageId, stage.status]));
    const packageCount = input.packageCount || 0;
    const generatedCount = input.generatedCount || 0;
    const missingAssetCount = input.missingAssetCount || 0;
    const artStatus = remoteStatus(remote.get("art-design"), input.workerReady, input.scriptReady);
    const assetStatus = remoteStatus(remote.get("asset-generation"), input.workerReady, artStatus === "approved" || artStatus === "applied");
    const storyboardStatus = remoteStatus(remote.get("seedance-storyboard"), input.workerReady, assetStatus === "approved" || assetStatus === "applied");

    return stageDefinitions.map((stage): WorkflowStageView => {
        if (stage.key === "script") return { ...stage, status: input.scriptReady ? "complete" : "blocked", blockingReason: input.scriptReady ? undefined : "本集还没有可用的确认稿" };
        if (stage.key === "art") return { ...stage, status: artStatus, blockingReason: artStatus === "blocked" ? workerReason(input.workerReady, input.scriptReady) : undefined };
        if (stage.key === "assets") {
            return {
                ...stage,
                status: assetStatus,
                count: missingAssetCount ? `${missingAssetCount} 个缺口` : undefined,
                blockingReason: assetStatus === "blocked" ? workerReason(input.workerReady, artStatus === "approved" || artStatus === "applied") : missingAssetCount ? "仍有参考资产需要补齐或接受文本生成风险" : undefined,
            };
        }
        if (stage.key === "storyboard") return { ...stage, status: storyboardStatus, count: packageCount ? `${packageCount} 条` : undefined, blockingReason: storyboardStatus === "blocked" ? workerReason(input.workerReady, true) : undefined };
        if (stage.key === "video") return { ...stage, status: packageCount ? (generatedCount === packageCount ? "complete" : "ready") : "idle", count: packageCount ? `${generatedCount}/${packageCount}` : undefined };
        return { ...stage, status: packageCount && generatedCount === packageCount ? "complete" : packageCount ? "ready" : "idle", count: packageCount ? `${generatedCount}/${packageCount}` : undefined };
    });
}

function remoteStatus(status: WorkflowViewStatus | undefined, workerReady: boolean, dependencyReady: boolean): WorkflowViewStatus {
    if (status === "blocked" && dependencyReady && workerReady) return "ready";
    if (status && status !== "idle") return status;
    if (!dependencyReady || !workerReady) return "blocked";
    return "ready";
}

function workerReason(workerReady: boolean, dependencyReady: boolean) {
    if (!dependencyReady) return "请先完成上一阶段";
    if (!workerReady) return "云端执行器暂不可用，已有内容仍可查看和编辑";
    return undefined;
}
