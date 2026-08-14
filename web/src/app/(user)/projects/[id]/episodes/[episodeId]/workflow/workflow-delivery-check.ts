import { productionSnapshotVersion, readAssetProductionTrace, resolveProductionOutputAsset, type ProductionTraceAssetLike } from "../../../../../canvas/utils/media-production-trace.ts";

export type DeliveryPackageLike = {
    assetStatus: string;
    generation?: {
        aiTaskCredits?: number;
        aiTaskId?: string;
        assetId?: string;
        status?: string;
        taskId?: string;
        updatedAt?: string;
    };
    id: string;
    prompt?: string;
    promptStatus: string;
    sourceScript?: string;
};

export function buildDeliveryReport<T extends DeliveryPackageLike>(packages: T[], assets?: ProductionTraceAssetLike[]) {
    const assetList = assets || [];
    const assetsById = new Map(assetList.map((asset) => [asset.id, asset]));
    const items = packages.map((item) => {
        const issues: string[] = [];
        if (item.promptStatus !== "已确认") issues.push("提示词尚未确认");
        if (item.assetStatus !== "完整") issues.push("参考资产仍有缺口");
        if (["checking", "creating", "queued", "running"].includes(item.generation?.status || "")) issues.push("视频任务仍在运行");
        if (item.generation?.status === "failed" || item.generation?.status === "cancelled") issues.push("视频任务失败或已停止");
        if (item.generation?.status !== "succeeded") issues.push("缺少成功视频版本");
        else if (!item.generation.assetId) issues.push("成功版本尚未归档到资产");
        else if (assets && !assetsById.has(item.generation.assetId)) issues.push("成功版本资产不存在");
        const selectedAsset = resolveProductionOutputAsset(item.generation?.assetId, assetList) || (item.generation?.assetId ? assetsById.get(item.generation.assetId) : undefined);
        const trace = readAssetProductionTrace(selectedAsset, assetList);
        trace?.postProcessing.forEach((task) => {
            if (task.status === "succeeded") return;
            const label = task.type === "video_upscale" ? "视频超分" : "字幕擦除";
            issues.push(task.status === "failed" ? `${label}失败` : `${label}仍在处理`);
        });
        return { id: item.id, issues, ready: issues.length === 0 };
    });
    const blockingCount = items.filter((item) => !item.ready).length;
    return { blockingCount, completedCount: items.length - blockingCount, items, ready: packages.length > 0 && blockingCount === 0, total: packages.length };
}

export function buildProductionAcceptanceManifest({ assets, episodeId, exportedAt = new Date().toISOString(), packages, projectId, scriptSnapshot, workflowRunId }: {
    assets: ProductionTraceAssetLike[];
    episodeId: string;
    exportedAt?: string;
    packages: DeliveryPackageLike[];
    projectId: string;
    scriptSnapshot: string;
    workflowRunId?: string;
}) {
    const report = buildDeliveryReport(packages, assets);
    const reportById = new Map(report.items.map((item) => [item.id, item]));
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const scriptReady = Boolean(scriptSnapshot.trim());
    const shots = packages.map((item) => {
        const delivery = reportById.get(item.id)!;
        const selectedAsset = resolveProductionOutputAsset(item.generation?.assetId, assets) || (item.generation?.assetId ? assetsById.get(item.generation.assetId) : undefined);
        const assetTrace = readAssetProductionTrace(selectedAsset, assets);
        const issues = scriptReady ? delivery.issues : [...delivery.issues, "剧本快照缺失"];
        return {
            productionPackageId: item.id,
            sourceScript: item.sourceScript,
            prompt: { status: item.promptStatus, text: item.prompt || "" },
            generation: {
                status: item.generation?.status,
                taskId: item.generation?.taskId || assetTrace?.generation.taskId,
                aiTaskId: item.generation?.aiTaskId || assetTrace?.generation.aiTaskId,
                assetId: item.generation?.assetId,
                updatedAt: item.generation?.updatedAt,
            },
            postProcessing: assetTrace?.postProcessing || [],
            costSnapshot: {
                generationCredits: item.generation?.aiTaskCredits ?? assetTrace?.costSnapshot.generationCredits,
                postProcessingCny: assetTrace?.costSnapshot.postProcessingCny || 0,
            },
            selectedOutput: assetTrace?.selectedOutput,
            ready: issues.length === 0,
            issues,
            nextAction: issues.length === 0 ? "export_clip_package" : nextShotAction(item, issues),
        };
    });
    const completedCount = shots.filter((shot) => shot.ready).length;
    const ready = shots.length > 0 && completedCount === shots.length;
    return {
        app: "infinite-canvas" as const,
        version: 1 as const,
        kind: "production-acceptance" as const,
        exportedAt,
        projectId,
        episodeId,
        workflowRunId,
        script: { snapshot: scriptSnapshot, version: scriptReady ? productionSnapshotVersion(scriptSnapshot) : undefined },
        ready,
        summary: { total: shots.length, completedCount, blockingCount: shots.length - completedCount },
        shots,
        nextAction: ready ? "export_clip_package" : "resolve_blockers",
    };
}

function nextShotAction(item: DeliveryPackageLike, issues: string[]) {
    if (item.promptStatus !== "已确认") return "confirm_prompt";
    if (item.assetStatus !== "完整") return "complete_reference_assets";
    if (item.generation?.status !== "succeeded") return "complete_video_generation";
    if (!item.generation.assetId) return "archive_output";
    if (issues.some((issue) => /超分|字幕擦除/.test(issue))) return "finish_post_processing";
    return "resolve_blockers";
}
