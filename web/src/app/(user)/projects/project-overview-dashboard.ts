import type { Asset } from "@/stores/use-asset-store";
import { assetGenerationRecords, readString } from "../assets/asset-generation.ts";
import { assetInProjectLibrary } from "../assets/asset-project-library.ts";
import type { GenerationQueueItem } from "../canvas/utils/generation-queue.ts";
import type { ProductionBibleItem } from "../canvas/utils/production-bible.ts";
import type { ScriptEpisode, ScriptProject, ScriptScene } from "../canvas/utils/script-management.ts";
import type { StoryboardGroup, StoryboardShot } from "../canvas/utils/storyboard-management.ts";
import type { AgentTask } from "./agent-workbench.ts";
import type { ProjectAssetReferenceSummary } from "./project-asset-references.ts";

export type ProjectOverviewActionTarget =
    | { type: "tab"; tab: "canvas" | "workflow" | "asset-references" }
    | { type: "asset-references"; versionStatus?: "outdated"; missingOnly?: boolean }
    | { type: "assets-page" }
    | { type: "storyboard"; groupId?: string }
    | { type: "production-bible" }
    | { type: "agent" }
    | { type: "primary-canvas" };

export type ProjectOverviewSuggestion = {
    id: string;
    title: string;
    description: string;
    actionLabel: string;
    priority: number;
    target: ProjectOverviewActionTarget;
};

export type ProjectOverviewDashboard = {
    stats: {
        canvasCount: number;
        scriptProjectCount: number;
        episodeCount: number;
        sceneCount: number;
        storyboardGroupCount: number;
        storyboardShotCount: number;
        generationQueueCount: number;
        generatedVideoCount: number;
        failedGenerationCount: number;
        missingMaterialCount: number;
        outdatedReferenceCount: number;
        projectLibraryAssetCount: number;
        recentAgentTaskCount: number;
    };
    suggestions: ProjectOverviewSuggestion[];
    recentAgentTasks: AgentTask[];
    exportableStoryboardGroups: StoryboardGroup[];
};

export function buildProjectOverviewDashboard(input: {
    projectId: string;
    canvasCount: number;
    scripts: ScriptProject[];
    episodes: ScriptEpisode[];
    scenes: ScriptScene[];
    storyboardGroups: StoryboardGroup[];
    storyboardShots: StoryboardShot[];
    productionBibleItems: ProductionBibleItem[];
    generationQueueItems: GenerationQueueItem[];
    assets: Asset[];
    assetReferenceRows: ProjectAssetReferenceSummary[];
    agentTasks?: AgentTask[];
}): ProjectOverviewDashboard {
    const projectScripts = input.scripts.filter((item) => item.projectId === input.projectId);
    const projectEpisodes = input.episodes.filter((item) => item.projectId === input.projectId);
    const episodeIds = new Set(projectEpisodes.map((episode) => episode.id));
    const projectScenes = input.scenes.filter((item) => episodeIds.has(item.episodeId));
    const projectGroups = input.storyboardGroups.filter((item) => item.projectId === input.projectId);
    const groupIds = new Set(projectGroups.map((group) => group.id));
    const projectShots = input.storyboardShots.filter((item) => groupIds.has(item.groupId));
    const projectBibleItems = input.productionBibleItems.filter((item) => item.projectId === input.projectId);
    const projectQueueItems = input.generationQueueItems.filter((item) => item.projectId === input.projectId);
    const projectLibraryAssetCount = input.assets.filter((asset) => assetInProjectLibrary(asset, input.projectId)).length;
    const generatedVideoCount = input.assets.filter((asset) => asset.kind === "video" && assetBelongsToProject(asset, input.projectId, groupIds)).length;
    const missingMaterialCount = projectBibleItems.filter((item) => !item.assetRefs.length).length + projectShots.filter((shot) => !shot.assetRefs.length).length + input.assetReferenceRows.filter((row) => row.hasMissingLocalFile).length;
    const outdatedReferenceCount = input.assetReferenceRows.reduce((sum, row) => sum + row.references.filter((reference) => reference.hasOutdatedVersion).length, 0);
    const failedGenerationCount = projectQueueItems.filter((item) => item.status === "failed").length + projectShots.filter((shot) => shot.status === "error").length;
    const exportableStoryboardGroups = projectGroups.filter((group) => projectShots.some((shot) => shot.groupId === group.id && Boolean(shot.primaryAssetId)));
    const recentAgentTasks = (input.agentTasks || [])
        .filter((task) => task.projectId === input.projectId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3);
    const stats = {
        canvasCount: input.canvasCount,
        scriptProjectCount: projectScripts.length,
        episodeCount: projectEpisodes.length,
        sceneCount: projectScenes.length,
        storyboardGroupCount: projectGroups.length,
        storyboardShotCount: projectShots.length,
        generationQueueCount: projectQueueItems.length,
        generatedVideoCount,
        failedGenerationCount,
        missingMaterialCount,
        outdatedReferenceCount,
        projectLibraryAssetCount,
        recentAgentTaskCount: recentAgentTasks.length,
    };
    return {
        stats,
        suggestions: buildProjectOverviewSuggestions(stats, exportableStoryboardGroups),
        recentAgentTasks,
        exportableStoryboardGroups,
    };
}

export function buildProjectOverviewSuggestions(stats: ProjectOverviewDashboard["stats"], exportableStoryboardGroups: StoryboardGroup[] = []): ProjectOverviewSuggestion[] {
    const suggestions: ProjectOverviewSuggestion[] = [];
    if (!stats.scriptProjectCount && !stats.episodeCount) {
        suggestions.push({
            id: "script",
            title: "先建立剧本",
            description: "当前项目还没有剧本或分集，建议先导入本集剧本或创建故事大纲。",
            actionLabel: "进入剧本入口",
            priority: 10,
            target: { type: "primary-canvas" },
        });
    }
    if (!stats.projectLibraryAssetCount && !stats.missingMaterialCount) {
        suggestions.push({
            id: "production-bible",
            title: "创建角色 / 场景 / 道具",
            description: "项目库还没有沉淀资产，建议先在设定库绑定关键角色、场景和道具。",
            actionLabel: "打开设定库",
            priority: 20,
            target: { type: "production-bible" },
        });
    }
    if (!stats.storyboardGroupCount && !stats.storyboardShotCount) {
        suggestions.push({
            id: "storyboard",
            title: "创建分镜",
            description: "当前项目还没有分镜组，可从剧本场次生成分镜草案或手动创建分镜。",
            actionLabel: "打开分镜",
            priority: 30,
            target: { type: "storyboard" },
        });
    }
    if (stats.missingMaterialCount > 0) {
        suggestions.push({
            id: "missing-materials",
            title: "补齐缺素材",
            description: `发现 ${stats.missingMaterialCount} 处素材缺口或本地文件缺失，建议进入素材引用总览定位。`,
            actionLabel: "查看缺素材",
            priority: 40,
            target: { type: "asset-references", missingOnly: true },
        });
    }
    if (stats.outdatedReferenceCount > 0) {
        suggestions.push({
            id: "outdated-references",
            title: "处理过期引用",
            description: `发现 ${stats.outdatedReferenceCount} 处旧版本引用，建议进入素材引用总览筛选过期引用。`,
            actionLabel: "查看过期引用",
            priority: 50,
            target: { type: "asset-references", versionStatus: "outdated" },
        });
    }
    if (stats.failedGenerationCount > 0) {
        suggestions.push({
            id: "failed-generation",
            title: "检查失败生成",
            description: `当前项目有 ${stats.failedGenerationCount} 个失败生成或失败分镜，建议进入队列或分镜查看错误。`,
            actionLabel: "查看失败项",
            priority: 60,
            target: { type: "storyboard" },
        });
    }
    if (exportableStoryboardGroups.length > 0) {
        suggestions.push({
            id: "clip-export",
            title: "导出剪辑包",
            description: `已有 ${exportableStoryboardGroups.length} 个分镜组包含主版本素材，可进入分镜导出剪辑包。`,
            actionLabel: "进入分镜导出",
            priority: 70,
            target: { type: "storyboard", groupId: exportableStoryboardGroups[0]?.id },
        });
    }
    return suggestions.sort((a, b) => a.priority - b.priority);
}

export function projectOverviewActionHref(projectId: string, target: ProjectOverviewActionTarget) {
    if (target.type === "assets-page") return `/assets?projectId=${projectId}`;
    if (target.type === "agent") return `/projects/${projectId}/agent`;
    return "";
}

function assetBelongsToProject(asset: Asset, projectId: string, storyboardGroupIds: Set<string>) {
    return assetGenerationRecords(asset).some((generation) => readString(generation.projectId) === projectId || storyboardGroupIds.has(readString(generation.storyboardGroupId)));
}
