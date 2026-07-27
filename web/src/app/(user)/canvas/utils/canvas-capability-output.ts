import type { ArtifactEnvelope } from "../../../../services/api/invocations-contract.ts";
import { preferredCapabilityOutputText } from "../../../../components/capability-runtime/capability-run-model.ts";
import type { CapabilityConsumeTrace } from "../../../../components/capability-runtime/use-capability-run.ts";
import type { CanvasConnection, CanvasNodeData } from "../types.ts";

type PlanCanvasCapabilityOutputInput = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    sourceNode: CanvasNodeData;
    artifacts: ArtifactEnvelope[];
    trace: CapabilityConsumeTrace;
    nodeId?: (artifact: ArtifactEnvelope, index: number) => string;
    connectionId?: (artifact: ArtifactEnvelope, index: number) => string;
};

type PlanCanvasAgentOutputInput = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    sourceNodeIds: string[];
    sourceMessageId: string;
    agentPlanId: string;
    artifacts: ArtifactEnvelope[];
    trace: CapabilityConsumeTrace;
    nodeId?: (artifact: ArtifactEnvelope, index: number) => string;
    connectionId?: (artifact: ArtifactEnvelope, index: number) => string;
};

const outputWidth = 340;
const outputHeight = 180;
const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function canvasCapabilitySourceText(node: CanvasNodeData) {
    const semanticText = cleanText(node.metadata?.finalPrompt) || cleanText(node.metadata?.promptDraft) || cleanText(node.metadata?.prompt);
    if (semanticText) return semanticText;
    return node.type === "text" || node.type === "config" ? cleanText(node.metadata?.content) : "";
}

export function planCanvasCapabilityOutput({ nodes, connections, sourceNode, artifacts, trace, nodeId = (artifact) => `capability-node-${artifact.artifact.id}`, connectionId = (artifact) => `capability-connection-${sourceNode.id}-${artifact.artifact.id}` }: PlanCanvasCapabilityOutputInput) {
    const pending = artifacts.flatMap((artifact, index) =>
        nodes.some((node) => node.metadata?.capabilityArtifact?.invocationId === trace.invocationId && node.metadata.capabilityArtifact.artifactId === artifact.artifact.id) ? [] : [{ artifact, index }],
    );
    const createdNodes = pending.map(({ artifact, index }): CanvasNodeData => ({
        id: nodeId(artifact, index),
        type: "text" as CanvasNodeData["type"],
        title: `Skill · ${artifact.artifact.artifactType}`,
        position: { x: sourceNode.position.x + sourceNode.width + 80, y: sourceNode.position.y + index * (outputHeight + 24) },
        width: outputWidth,
        height: outputHeight,
        metadata: {
            content: preferredCapabilityOutputText(artifact),
            status: "success",
            fontSize: 14,
            capabilityArtifact: {
                source: "canvas_chat",
                sourceNodeId: sourceNode.id,
                invocationId: trace.invocationId,
                artifactId: artifact.artifact.id,
                artifactType: artifact.artifact.artifactType,
                artifactHash: artifact.artifact.contentHash,
                artifactIds: trace.artifactIds,
                skillVersionId: trace.skillVersionId,
                appliedAt: trace.appliedAt,
            },
        },
    }));
    const createdConnections = pending.map(({ artifact, index }, createdIndex): CanvasConnection => ({ id: connectionId(artifact, index), fromNodeId: sourceNode.id, toNodeId: createdNodes[createdIndex].id }));
    return { nodes: [...nodes, ...createdNodes], connections: [...connections, ...createdConnections], createdNodeIds: createdNodes.map((node) => node.id) };
}

export function planCanvasAgentOutput({ nodes, connections, sourceNodeIds, sourceMessageId, agentPlanId, artifacts, trace, nodeId = (artifact) => `agent-node-${agentPlanId}-${artifact.artifact.id}`, connectionId = (artifact) => `agent-connection-${agentPlanId}-${artifact.artifact.id}` }: PlanCanvasAgentOutputInput) {
    const sourceNode = sourceNodeIds.flatMap((id) => nodes.find((node) => node.id === id) || []).at(0);
    const anchor = sourceNode
        ? { x: sourceNode.position.x + sourceNode.width + 80, y: sourceNode.position.y }
        : { x: Math.max(0, ...nodes.map((node) => node.position.x + node.width)) + 80, y: nodes[0]?.position.y || 0 };
    const pending = artifacts.flatMap((artifact, index) =>
        nodes.some((node) => node.metadata?.agentArtifact?.agentPlanId === agentPlanId && node.metadata.agentArtifact.invocationId === trace.invocationId && node.metadata.agentArtifact.artifactId === artifact.artifact.id) ? [] : [{ artifact, index }],
    );
    const createdNodes = pending.map(({ artifact, index }): CanvasNodeData => ({
        id: nodeId(artifact, index),
        type: "text" as CanvasNodeData["type"],
        title: `Agent · ${artifact.artifact.artifactType}`,
        position: { x: anchor.x, y: anchor.y + index * (outputHeight + 24) },
        width: outputWidth,
        height: outputHeight,
        metadata: {
            content: preferredCapabilityOutputText(artifact),
            status: "success",
            fontSize: 14,
            agentArtifact: {
                source: "canvas_chat",
                agentPlanId,
                sourceMessageId,
                sourceNodeIds,
                invocationId: trace.invocationId,
                artifactId: artifact.artifact.id,
                artifactType: artifact.artifact.artifactType,
                artifactHash: artifact.artifact.contentHash,
                artifactIds: trace.artifactIds,
                skillVersionId: trace.skillVersionId,
                appliedAt: trace.appliedAt,
            },
        },
    }));
    const createdConnections = sourceNode
        ? pending.map(({ artifact, index }, createdIndex): CanvasConnection => ({ id: connectionId(artifact, index), fromNodeId: sourceNode.id, toNodeId: createdNodes[createdIndex].id }))
        : [];
    return { nodes: [...nodes, ...createdNodes], connections: [...connections, ...createdConnections], createdNodeIds: createdNodes.map((node) => node.id) };
}
