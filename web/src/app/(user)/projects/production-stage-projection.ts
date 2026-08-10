import type { RemoteWorkflowStageStatus } from "../../../services/api/workflow-runs-contract";

export const productionStageKeys = ["script", "asset-extraction", "asset-production", "storyboard", "prompt", "video"] as const;

export const productionStageDefinitions = [
    { key: "script", label: "剧本确认", description: "确认不可变剧本快照", remoteStageId: "script-adaptation" },
    { key: "asset-extraction", label: "资产解析", description: "识别并校正资产槽位", remoteStageId: "asset-extraction" },
    { key: "asset-production", label: "资产生产", description: "生成、上传、绑定或保留文字占位", remoteStageId: "asset-image-prompt" },
    { key: "storyboard", label: "结构化分镜", description: "编排镜头、节奏与连续性", remoteStageId: "shot-breakdown" },
    { key: "prompt", label: "最终提示词", description: "生成并批准模型执行稿", remoteStageId: "shot-prompt" },
    { key: "video", label: "视频生成与预览", description: "手动启动并检查每个镜头", remoteStageId: null },
] as const;

export type ProductionStageKey = (typeof productionStageKeys)[number];
export type ProductionStageStatus = RemoteWorkflowStageStatus | "idle" | "complete" | "warning";
export type ProductionStageView = {
    key: ProductionStageKey;
    label: string;
    description: string;
    status: ProductionStageStatus;
    count?: string;
    blockingReason?: string;
    warningCount?: number;
};

type RemoteStageSummary = { attempt?: number; stageId: string; status: ProductionStageStatus };
export type ProductionStageProjectionInput = {
    generatedCount?: number;
    missingAssetCount?: number;
    packageCount?: number;
    remoteStages?: RemoteStageSummary[];
    scriptReady: boolean;
    warningCount?: number;
    workerReady?: boolean;
};

export function projectProductionStages(input: ProductionStageProjectionInput): ProductionStageView[] {
    const latest = latestRemoteStages(input.remoteStages || []);
    const workerReady = input.workerReady !== false;
    const scriptRemote = latest.get("script-adaptation")?.status;
    const script = scriptRemote || (input.scriptReady ? "ready" : "blocked");
    const scriptGateReady = input.scriptReady && (!scriptRemote || productionStageComplete(script) || script === "ready");
    const extraction = remoteStatus(latest.get("asset-extraction")?.status, workerReady, scriptGateReady);
    const productionRemote = latest.get("asset-image-prompt")?.status;
    let production = remoteStatus(productionRemote, workerReady, productionStageComplete(extraction));
    if (input.warningCount && productionStageComplete(extraction) && (!productionRemote || productionStageComplete(production))) production = "warning";
    const storyboard = remoteStatus(latest.get("shot-breakdown")?.status, workerReady, productionStageComplete(extraction));
    const prompt = remoteStatus(latest.get("shot-prompt")?.status, workerReady, productionStageComplete(storyboard));
    const packageCount = input.packageCount || 0;
    const generatedCount = input.generatedCount || 0;
    const video = productionStageComplete(prompt) ? packageCount > 0 && generatedCount >= packageCount ? "complete" : "ready" : "blocked";
    const statuses: ProductionStageStatus[] = [script, extraction, production, storyboard, prompt, video];
    const blockingReasons = [
        input.scriptReady ? undefined : "本集还没有可确认的剧本",
        stageBlockingReason(workerReady, scriptGateReady, "请先批准剧本快照"),
        stageBlockingReason(workerReady, productionStageComplete(extraction), "请先批准资产槽位"),
        stageBlockingReason(workerReady, productionStageComplete(extraction), "请先批准资产槽位；图片可以稍后补齐"),
        stageBlockingReason(workerReady, productionStageComplete(storyboard), "请先批准结构化分镜"),
        !workerReady ? "工作流执行器暂不可用，已有内容仍可查看和编辑" : stageBlockingReason(true, productionStageComplete(prompt), "请先批准最终提示词"),
    ];

    return productionStageDefinitions.map((definition, index) => ({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        status: statuses[index],
        blockingReason: statuses[index] === "blocked" ? blockingReasons[index] : undefined,
        count: definition.key === "asset-production" && input.missingAssetCount ? `${input.missingAssetCount} 个占位` : definition.key === "storyboard" || definition.key === "prompt" ? packageCount ? `${packageCount} 镜` : undefined : definition.key === "video" && packageCount ? `${generatedCount}/${packageCount}` : undefined,
        warningCount: definition.key === "asset-production" && production === "warning" ? input.warningCount : undefined,
    }));
}

export function productionStageComplete(status: ProductionStageStatus) {
    return ["approved", "applied", "complete", "warning"].includes(status);
}

function latestRemoteStages(stages: RemoteStageSummary[]) {
    const latest = new Map<string, RemoteStageSummary>();
    for (const stage of stages) {
        const current = latest.get(stage.stageId);
        if (!current || (stage.attempt || 0) > (current.attempt || 0)) latest.set(stage.stageId, stage);
    }
    return latest;
}

function remoteStatus(status: ProductionStageStatus | undefined, workerReady: boolean, dependencyReady: boolean): ProductionStageStatus {
    if (status === "blocked" && dependencyReady && workerReady) return "ready";
    if (status && status !== "idle") return status;
    return dependencyReady && workerReady ? "ready" : "blocked";
}

function stageBlockingReason(workerReady: boolean, dependencyReady: boolean, dependencyReason: string) {
    if (!dependencyReady) return dependencyReason;
    if (!workerReady) return "工作流执行器暂不可用，已有内容仍可查看和编辑";
    return undefined;
}
