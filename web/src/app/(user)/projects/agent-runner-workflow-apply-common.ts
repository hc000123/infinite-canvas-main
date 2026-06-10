import type { CanvasNodeData } from "../canvas/types.ts";
import type { ProductionBibleWriteInput } from "../canvas/utils/production-bible.ts";
import type { StoryboardTableShotWriteInput } from "../canvas/utils/storyboard-management.ts";
import type { AgentWorkflowMappingPreview } from "./agent-runner-types.ts";

export type WorkflowMappingPreviewApplyResult = {
    appliedWrites: Array<{ previewItemId: string; input: ProductionBibleWriteInput }>;
    appliedPreviewItemIds: string[];
    skippedPreviewItemIds: string[];
    warnings: string[];
};

export type WorkflowStoryboardMappingPreviewApplyResult = {
    appliedWrites: Array<{ previewItemId: string; input: StoryboardTableShotWriteInput }>;
    appliedPreviewItemIds: string[];
    skippedPreviewItemIds: string[];
    warnings: string[];
};

export type WorkflowVideoNodeMappingPreviewApplyResult = {
    appliedNodes: Array<{ previewItemId: string; node: CanvasNodeData }>;
    appliedPreviewItemIds: string[];
    skippedPreviewItemIds: string[];
    warnings: string[];
    focusNodeIds: string[];
    nextNodes: CanvasNodeData[];
};

export function workflowMappingPreviewItemKey(preview: AgentWorkflowMappingPreview, previewItemId: string) {
    return `${preview.previewId}:${previewItemId}`;
}
