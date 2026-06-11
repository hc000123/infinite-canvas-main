import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode, ScriptScene } from "../../../../../canvas/utils/script-management";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowSceneRunState, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import type { EpisodeModuleConfig, EpisodeModuleRow } from "./components/episode-module-panel";
import type { EpisodeModuleKey } from "./episode-workbench-display";
import { buildAssetsModuleConfig } from "./episode-assets-module-config";
import { buildCanvasModuleConfig } from "./episode-canvas-module-config";
import { buildDirectorModuleConfig } from "./episode-director-module-config";
import { buildScriptModuleConfig } from "./episode-script-module-config";
import { buildStoryboardModuleConfig } from "./episode-storyboard-module-config";
import type { EpisodeSceneOption } from "./use-episode-workbench-state";

export type DirectorReviewState = "confirmed" | "adopted";

export function buildEpisodeModuleConfig(input: {
    activeModule: EpisodeModuleKey;
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    boundCanvas?: CanvasProject;
    currentScene?: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    directorReviewStates: Record<string, DirectorReviewState>;
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenCanvas: () => void;
    onApproveStageReview: (stageId: string, note: string) => void;
    onUpdateDirectorReviewState: (rowId: string, state: DirectorReviewState) => void;
    onCancelStage: (stageId: string) => void;
    onOptimizeScript: () => void;
    onRunStage: (stageId: string) => void;
    onRunStoryboardScene: () => void;
    onSaveScript: () => void;
    previews: AgentWorkflowMappingPreview[];
    runningStageIds: Record<string, boolean>;
    scriptOptimizing: boolean;
    sceneOptions: EpisodeSceneOption[];
    scriptDraft: string;
    scriptSnapshot: string;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    stageSceneRows: ScriptScene[];
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    if (input.activeModule === "script") return buildScriptModuleConfig(input);
    if (input.activeModule === "director") return buildDirectorModuleConfig(input);
    if (input.activeModule === "assets") return buildAssetsModuleConfig(input);
    if (input.activeModule === "storyboard") return buildStoryboardModuleConfig(input);
    return buildCanvasModuleConfig(input);
}

export function filterEpisodeRows(rows: EpisodeModuleRow[], filter: string) {
    if (filter === "全部") return rows;
    return rows.filter((row) => row.status === filter || row.status.includes(filter) || (filter === "已完成" && (row.status === "完整" || row.status.startsWith("已"))));
}
