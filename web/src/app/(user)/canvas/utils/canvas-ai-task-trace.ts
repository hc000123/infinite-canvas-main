import type { AiTaskLedger, AiTaskTrace, FrontendArtifactTrace } from "@/services/api/ai-task-trace";

import type { CanvasNodeData, CanvasNodeMetadata } from "../types.ts";

export function buildCanvasAiTaskTrace({ projectId, canvasId, nodeId, metadata, source = "canvas" }: { projectId: string; canvasId: string; nodeId: string; metadata?: CanvasNodeMetadata; source?: string }): AiTaskTrace {
    return {
        source,
        projectId,
        canvasId,
        nodeId,
        storyboardGroupId: metadata?.storyboardGroupId,
        storyboardShotId: metadata?.storyboardShotId,
        shotGroupId: metadata?.shotGroupId,
        shotIds: metadata?.shotIds,
    };
}

export function buildCanvasAiTaskTraceFromNode({ projectId, canvasId, node, source = "canvas" }: { projectId: string; canvasId: string; node: CanvasNodeData; source?: string }): AiTaskTrace {
    return buildCanvasAiTaskTrace({ projectId, canvasId, nodeId: node.id, metadata: node.metadata, source });
}

export function aiTaskLedgerNodeMetadata(ledger?: AiTaskLedger): CanvasNodeMetadata {
    if (!ledger?.aiTaskId) return {};
    return {
        aiTaskId: ledger.aiTaskId,
        upstreamTaskId: ledger.upstreamTaskId,
        aiTaskStatus: ledger.aiTaskStatus,
        aiTaskCredits: ledger.aiTaskCredits,
        creditLogId: ledger.creditLogId,
        creditsRefunded: ledger.creditsRefunded,
        refundedAt: ledger.refundedAt,
        finishedAt: ledger.finishedAt,
    };
}

export function buildFrontendArtifactTrace({
    assetId,
    kind,
    generation,
    canvasId,
    fallbackProjectId,
    createdAt,
}: {
    assetId: string;
    kind: string;
    generation?: Record<string, unknown>;
    canvasId: string;
    fallbackProjectId: string;
    createdAt: string;
}): FrontendArtifactTrace | null {
    const aiTaskId = readString(generation?.aiTaskId);
    if (!aiTaskId) return null;
    return {
        assetId,
        kind,
        createdAt,
        projectId: readString(generation?.projectId) || fallbackProjectId,
        canvasId,
        nodeId: readString(generation?.nodeId),
        storyboardGroupId: readString(generation?.storyboardGroupId),
        storyboardShotId: readString(generation?.storyboardShotId),
        shotGroupId: readString(generation?.shotGroupId),
        shotIds: readStringArray(generation?.shotIds),
    };
}

export function aiTaskIdFromGeneration(generation?: Record<string, unknown>) {
    return readString(generation?.aiTaskId);
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : undefined;
}
