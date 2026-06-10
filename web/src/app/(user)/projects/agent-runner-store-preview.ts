import { useConfigStore } from "@/stores/use-config-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useProductionBibleStore } from "../canvas/stores/use-production-bible-store";
import { useStoryboardStore } from "../canvas/stores/use-storyboard-store";
import type { CanvasNodeData, Position } from "../canvas/types";
import { buildCanvasVideoModePatch } from "../canvas/utils/canvas-video-config";
import {
    canApplyWorkflowMappingPreviewToProductionBible,
    applyWorkflowMappingPreviewToProductionBible,
} from "./agent-runner-workflow-apply-production-bible";
import {
    canApplyWorkflowMappingPreviewToStoryboardTable,
    applyWorkflowMappingPreviewToStoryboardTable,
} from "./agent-runner-workflow-apply-storyboard";
import {
    canApplyWorkflowMappingPreviewToVideoNodes,
    applyWorkflowMappingPreviewToVideoNodes,
} from "./agent-runner-workflow-apply-video";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner-types";

type AgentRunnerPreviewState = {
    workflowRuns: AgentWorkflowRunRecord[];
    workflowOutputs: AgentWorkflowStageOutput[];
    workflowMappingPreviews: AgentWorkflowMappingPreview[];
    workflowAppliedPreviewItemIds: string[];
};

type PreviewApplyResult = {
    ok: boolean;
    reason?: string;
    appliedCount?: number;
    skippedCount?: number;
    warnings: string[];
    appliedPreviewItemIds?: string[];
};

export function nextAppliedPreviewItemIds(currentIds: string[], appliedIds: string[] = []) {
    return Array.from(new Set([...currentIds, ...appliedIds]));
}

export function applyProductionBiblePreviewToStores(state: AgentRunnerPreviewState, previewId: string, selectedItemIds?: string[]): PreviewApplyResult {
    const { output, preview, workflowRun } = findPreviewContext(state, previewId);
    const eligibility = canApplyWorkflowMappingPreviewToProductionBible({ workflowRun, preview, output });
    if (!eligibility.allowed) return { ok: false, reason: eligibility.reason, warnings: [eligibility.reason] };
    const result = applyWorkflowMappingPreviewToProductionBible({
        preview: preview!,
        workflowRun: workflowRun!,
        output: output!,
        selectedItemIds,
        existingItems: useProductionBibleStore.getState().items,
    });
    if (!result.appliedWrites.length) return { ok: false, reason: result.warnings[0] || "没有可写入的设定库条目", warnings: result.warnings, appliedCount: 0, skippedCount: result.skippedPreviewItemIds.length };
    const addBibleItem = useProductionBibleStore.getState().addItem;
    for (const write of result.appliedWrites) addBibleItem(write.input);
    return {
        ok: true,
        appliedCount: result.appliedWrites.length,
        skippedCount: result.skippedPreviewItemIds.length,
        warnings: result.warnings,
        appliedPreviewItemIds: result.appliedPreviewItemIds,
    };
}

export function applyStoryboardPreviewToStores(state: AgentRunnerPreviewState, previewId: string, selectedItemIds?: string[]): PreviewApplyResult {
    const { output, preview, workflowRun } = findPreviewContext(state, previewId);
    const eligibility = canApplyWorkflowMappingPreviewToStoryboardTable({
        workflowRun,
        preview,
        output,
        canvasId: workflowRun?.canvasId,
        episodeId: workflowRun?.episodeId,
    });
    if (!eligibility.allowed) return { ok: false, reason: eligibility.reason, warnings: [eligibility.reason] };
    const result = applyWorkflowMappingPreviewToStoryboardTable({
        preview: preview!,
        workflowRun: workflowRun!,
        output: output!,
        canvasId: workflowRun!.canvasId!,
        episodeId: workflowRun!.episodeId!,
        selectedItemIds,
        existingShots: useStoryboardStore.getState().tableShots,
    });
    if (!result.appliedWrites.length) return { ok: false, reason: result.warnings[0] || "没有可写入的分镜头表条目", warnings: result.warnings, appliedCount: 0, skippedCount: result.skippedPreviewItemIds.length };
    const count = useStoryboardStore.getState().applyAgentTableShots({
        projectId: preview!.projectId,
        canvasId: workflowRun!.canvasId!,
        episodeId: workflowRun!.episodeId!,
        shots: result.appliedWrites.map((item) => item.input),
        mode: "append",
    });
    return {
        ok: true,
        appliedCount: count,
        skippedCount: result.skippedPreviewItemIds.length,
        warnings: result.warnings,
        appliedPreviewItemIds: result.appliedPreviewItemIds,
    };
}

export function applyVideoNodePreviewToStores(
    state: AgentRunnerPreviewState,
    previewId: string,
    options?: { selectedItemIds?: string[]; existingNodes?: CanvasNodeData[]; placement?: Position },
): PreviewApplyResult & { nextNodes?: CanvasNodeData[]; focusNodeIds?: string[] } {
    const { output, preview, workflowRun } = findPreviewContext(state, previewId);
    const eligibility = canApplyWorkflowMappingPreviewToVideoNodes({
        workflowRun,
        preview,
        output,
        canvasId: workflowRun?.canvasId,
    });
    if (!eligibility.allowed) return { ok: false, reason: eligibility.reason, warnings: [eligibility.reason] };
    const canvasStore = useCanvasStore.getState();
    const project = workflowRun?.canvasId ? canvasStore.openProject(workflowRun.canvasId) : null;
    const result = applyWorkflowMappingPreviewToVideoNodes({
        preview: preview!,
        workflowRun: workflowRun!,
        output: output!,
        canvasId: workflowRun!.canvasId!,
        episodeId: workflowRun!.episodeId,
        selectedItemIds: options?.selectedItemIds,
        existingNodes: options?.existingNodes || project?.nodes || [],
        placement: options?.placement,
        defaultMetadata: buildCanvasVideoModePatch(useConfigStore.getState().config),
    });
    if (!result.appliedNodes.length) {
        return {
            ok: false,
            reason: result.warnings[0] || "没有可创建的视频配置节点",
            warnings: result.warnings,
            appliedCount: 0,
            skippedCount: result.skippedPreviewItemIds.length,
            nextNodes: result.nextNodes,
            focusNodeIds: result.focusNodeIds,
        };
    }
    canvasStore.updateProject(workflowRun!.canvasId!, { nodes: result.nextNodes });
    return {
        ok: true,
        appliedCount: result.appliedNodes.length,
        skippedCount: result.skippedPreviewItemIds.length,
        warnings: result.warnings,
        nextNodes: result.nextNodes,
        focusNodeIds: result.focusNodeIds,
        appliedPreviewItemIds: result.appliedPreviewItemIds,
    };
}

function findPreviewContext(state: AgentRunnerPreviewState, previewId: string) {
    const preview = state.workflowMappingPreviews.find((item) => item.previewId === previewId);
    const workflowRun = preview ? state.workflowRuns.find((item) => item.id === preview.workflowRunId) : undefined;
    const output = preview ? state.workflowOutputs.find((item) => item.outputId === preview.sourceOutputId) : undefined;
    return { output, preview, workflowRun };
}
