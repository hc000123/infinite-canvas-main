import type { CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import type { NodeGenerationInput } from "./canvas-generation-inputs.ts";
import { beginPendingCanvasMediaVersion, canvasPromptEditorDocument, canvasPromptEditorValue, completePendingCanvasMediaVersion, rollbackPendingCanvasMediaVersion } from "./canvas-media-versions.ts";
import { serializePromptDocument } from "./canvas-prompt-document.ts";
import { buildReferenceMentionOptions } from "./canvas-reference-mentions.ts";

export function canvasNodeRetryPrompt(node: CanvasNodeData, sourceNode?: CanvasNodeData, inputs: NodeGenerationInput[] = []) {
    const document = canvasPromptEditorDocument(node) || (sourceNode ? canvasPromptEditorDocument(sourceNode) : undefined);
    if (document) return serializePromptDocument(document, buildReferenceMentionOptions(inputs)).trim();
    return (canvasPromptEditorValue(node) || (sourceNode ? canvasPromptEditorValue(sourceNode) : "")).trim();
}

export function startCanvasNodeRetry(node: CanvasNodeData, prompt: string, startedAt: number) {
    const hasCompletedMedia = (node.type === "image" || node.type === "video") && Boolean(node.metadata?.content);
    const retryNode = hasCompletedMedia
        ? beginPendingCanvasMediaVersion(
              { ...node, metadata: { ...node.metadata, status: "success", errorDetails: undefined } },
              prompt,
              new Date(startedAt).toISOString(),
              node.metadata?.promptDraftDocument,
          )
        : node;
    return {
        ...retryNode,
        metadata: {
            ...retryNode.metadata,
            ...retryingVideoTaskMetadata(retryNode.type),
            status: "loading" as const,
            errorDetails: undefined,
            ...(retryNode.type === "video" ? { generationStartedAt: startedAt } : {}),
        },
    };
}

export function completeCanvasNodeRetry(node: CanvasNodeData, completed: CanvasNodeData, createdAt?: string) {
    return completePendingCanvasMediaVersion(node, completed, createdAt);
}

export function failCanvasNodeRetry(node: CanvasNodeData, errorDetails: string, failedAt: number) {
    const restored = node.metadata?.pendingMediaVersion ? rollbackPendingCanvasMediaVersion(node, errorDetails) : node;
    return {
        ...restored,
        metadata: {
            ...restored.metadata,
            status: "error" as const,
            errorDetails,
            ...(restored.type === "video" ? { taskUpdatedAt: failedAt } : {}),
        },
    };
}

function retryingVideoTaskMetadata(nodeType: CanvasNodeData["type"]): CanvasNodeMetadata {
    if (nodeType !== "video") return {};
    return {
        taskId: undefined,
        taskStatus: undefined,
        rawTaskStatus: undefined,
        taskCreatedAt: undefined,
        taskUpdatedAt: undefined,
        taskDuration: undefined,
        executionExpiresAfter: undefined,
        videoUrlExpiresAt: undefined,
        videoUrl: undefined,
        lastFrameUrl: undefined,
        lastFrameStorageKey: undefined,
        aiTaskId: undefined,
        upstreamTaskId: undefined,
        aiTaskStatus: undefined,
        aiTaskCredits: undefined,
        creditLogId: undefined,
        creditsRefunded: undefined,
        refundedAt: undefined,
        finishedAt: undefined,
    };
}
