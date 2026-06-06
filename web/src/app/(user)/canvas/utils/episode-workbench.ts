import type { AssetBreakdownItem } from "./asset-breakdown.ts";
import { buildShotGroupGenerationTableRows, orderedShotGroups, orderedStoryboardTableShots, validateShotGroupSelection, type ShotGroup, type StoryboardTableShot } from "./storyboard-management.ts";
import type { CanvasNodeData } from "../types.ts";

export type EpisodeWorkbenchCanvas = {
    id: string;
    title: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptId?: string;
    scriptSnapshot?: string;
};

export type EpisodeWorkbenchMode = "script_driven" | "free_canvas" | "asset_reuse";

export type EpisodeWorkbenchStats = {
    hasScript: boolean;
    scriptStatus: "unbound" | "ready";
    assetBreakdownCount: number;
    assetBreakdownReady: boolean;
    tableShotCount: number;
    shotGroupCount: number;
    generatedVideoCount: number;
    failedCount: number;
    generatingCount: number;
    hasShotGroupsInCanvas: boolean;
};

export type EpisodeProductionStatus = "unbound" | "script_ready" | "assets_ready" | "storyboard_ready" | "shot_groups_ready" | "generating" | "failed";

export type ShotGroupGenerationSummary = {
    group: ShotGroup;
    shots: StoryboardTableShot[];
    shotRangeLabel: string;
    status: "not_in_canvas" | "in_canvas" | "generating" | "succeeded" | "failed" | "retry_needed";
    nodeId?: string;
    taskId?: string;
    aiTaskId?: string;
    aiTaskStatus?: string;
    credits?: number;
    errorMessage?: string;
    resultAssetIds: string[];
    primaryAssetId?: string;
    isFreeCanvas: boolean;
};

export function buildEpisodeWorkbenchStats({
    canvas,
    tableShots,
    shotGroups,
    assetBreakdownItems,
    nodes,
}: {
    canvas?: EpisodeWorkbenchCanvas | null;
    tableShots: StoryboardTableShot[];
    shotGroups: ShotGroup[];
    assetBreakdownItems: AssetBreakdownItem[];
    nodes: CanvasNodeData[];
}): EpisodeWorkbenchStats {
    const hasScript = Boolean(canvas?.episodeId && canvas.scriptSnapshot?.trim());
    const episodeId = canvas?.episodeId || "";
    const scopedTableShots = episodeId ? tableShots.filter((shot) => shot.canvasId === canvas?.id && shot.episodeId === episodeId) : [];
    const scopedShotGroups = episodeId ? shotGroups.filter((group) => group.canvasId === canvas?.id && group.episodeId === episodeId) : [];
    const scopedAssets = episodeId ? assetBreakdownItems.filter((item) => item.episodeId === episodeId && (!canvas?.id || item.canvasId === canvas.id)) : [];
    const generatedVideoCount = nodes.filter((node) => node.type === "video" && node.metadata?.status === "success" && (node.metadata.episodeId === episodeId || node.metadata.shotGroupId)).length;
    const failedCount =
        nodes.filter((node) => node.type === "video" && node.metadata?.status === "error" && (node.metadata.episodeId === episodeId || node.metadata.shotGroupId)).length + scopedShotGroups.filter((group) => group.status === "error").length;
    const generatingCount =
        nodes.filter((node) => node.type === "video" && node.metadata?.status === "loading" && (node.metadata.episodeId === episodeId || node.metadata.shotGroupId)).length + scopedShotGroups.filter((group) => group.status === "generating").length;
    return {
        hasScript,
        scriptStatus: hasScript ? "ready" : "unbound",
        assetBreakdownCount: scopedAssets.length,
        assetBreakdownReady: scopedAssets.length > 0,
        tableShotCount: scopedTableShots.length,
        shotGroupCount: scopedShotGroups.length,
        generatedVideoCount,
        failedCount,
        generatingCount,
        hasShotGroupsInCanvas: scopedShotGroups.some((group) => group.status !== "draft" && group.status !== "prompt_ready"),
    };
}

export function deriveEpisodeProductionStatus(stats: EpisodeWorkbenchStats): EpisodeProductionStatus {
    if (stats.failedCount > 0) return "failed";
    if (stats.generatingCount > 0) return "generating";
    if (stats.shotGroupCount > 0) return "shot_groups_ready";
    if (stats.tableShotCount > 0) return "storyboard_ready";
    if (stats.assetBreakdownReady) return "assets_ready";
    if (stats.hasScript) return "script_ready";
    return "unbound";
}

export function productionStatusLabel(status: EpisodeProductionStatus) {
    const labels: Record<EpisodeProductionStatus, string> = {
        unbound: "未绑定剧本",
        script_ready: "已有剧本",
        assets_ready: "已拆资产",
        storyboard_ready: "已拆分镜",
        shot_groups_ready: "已有生成组",
        generating: "生成中",
        failed: "待处理失败",
    };
    return labels[status];
}

export function workbenchModes(stats: EpisodeWorkbenchStats): Array<{ key: EpisodeWorkbenchMode; title: string; active: boolean; description: string }> {
    return [
        { key: "script_driven", title: "剧本驱动生产", active: stats.hasScript, description: stats.hasScript ? "从本集剧本拆资产、拆分镜并组合生成镜头组。" : "先绑定或导入本集剧本后启用。" },
        { key: "free_canvas", title: "自由画布制作", active: true, description: "保留自由节点编排，可把补充、修改、实验镜头手动归档到本集。" },
        { key: "asset_reuse", title: "资产生产与复用", active: stats.assetBreakdownReady || stats.generatedVideoCount > 0, description: "复用资产拆解、设定库、Brief 和素材库中的角色图、场景图、道具图、氛围图。" },
    ];
}

export function groupedTableShotsByScene(shots: StoryboardTableShot[]) {
    const groups: Array<{ sceneName: string; shots: StoryboardTableShot[]; totalDuration: number }> = [];
    for (const shot of shots) {
        const sceneName = shot.sceneName || "未命名场次";
        let group = groups.find((item) => item.sceneName === sceneName);
        if (!group) {
            group = { sceneName, shots: [], totalDuration: 0 };
            groups.push(group);
        }
        group.shots.push(shot);
        group.totalDuration += shot.estimatedDuration || 0;
    }
    return groups.map((group) => ({ ...group, shots: [...group.shots].sort((a, b) => a.order - b.order) }));
}

export function validateEpisodeShotGroupSelection(shots: StoryboardTableShot[], shotIds: string[]) {
    return validateShotGroupSelection(shots, shotIds);
}

export function buildShotGroupGenerationSummaries({ shotGroups, tableShots, nodes }: { shotGroups: ShotGroup[]; tableShots: StoryboardTableShot[]; nodes: CanvasNodeData[] }): ShotGroupGenerationSummary[] {
    const rows = buildShotGroupGenerationTableRows(shotGroups, tableShots);
    return rows.map((row) => {
        const relatedNodes = nodes.filter((node) => node.metadata?.shotGroupId === row.group.id || node.metadata?.storyboardShotGroupId === row.group.id);
        const videoNode = relatedNodes.find((node) => node.type === "video") || relatedNodes.find((node) => node.type === "config");
        const status = deriveShotGroupRuntimeStatus(row.group, videoNode);
        return {
            group: row.group,
            shots: row.shots,
            shotRangeLabel: row.shotRangeLabel,
            status,
            nodeId: videoNode?.id,
            taskId: videoNode?.metadata?.taskId || row.group.taskId,
            aiTaskId: videoNode?.metadata?.aiTaskId,
            aiTaskStatus: videoNode?.metadata?.aiTaskStatus,
            credits: videoNode?.metadata?.aiTaskCredits,
            errorMessage: videoNode?.metadata?.errorDetails || row.group.errorMessage,
            resultAssetIds: row.group.resultAssetIds,
            primaryAssetId: row.group.primaryAssetId,
            isFreeCanvas: row.group.shotIds.length === 0 || row.shots.length === 0,
        };
    });
}

export function deriveShotGroupRuntimeStatus(group: ShotGroup, node?: CanvasNodeData): ShotGroupGenerationSummary["status"] {
    if (node?.metadata?.status === "loading" || group.status === "generating") return "generating";
    if (node?.metadata?.status === "success" || group.status === "done") return "succeeded";
    if (node?.metadata?.status === "error" || group.status === "error") return group.taskId || node?.metadata?.taskId ? "retry_needed" : "failed";
    if (node || group.status === "in_canvas") return "in_canvas";
    return "not_in_canvas";
}

export function buildEpisodeWorkbenchHref(projectId: string, canvasId?: string) {
    if (canvasId) return `/canvas/${canvasId}?panel=episode-workbench`;
    return `/projects/${projectId}?panel=episode-workbench`;
}

export function activeEpisodeTableShots(tableShots: StoryboardTableShot[], canvas?: EpisodeWorkbenchCanvas | null) {
    if (!canvas?.episodeId) return [];
    return orderedStoryboardTableShots(tableShots, canvas.id, canvas.episodeId);
}

export function activeEpisodeShotGroups(shotGroups: ShotGroup[], canvas?: EpisodeWorkbenchCanvas | null) {
    if (!canvas?.episodeId) return [];
    return orderedShotGroups(shotGroups, canvas.id, canvas.episodeId);
}
