"use client";

import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { ArtifactEnvelope } from "@/services/api/invocations";
import type { CapabilityConsumeTrace } from "@/components/capability-runtime/use-capability-run";
import type { CanvasConnection, CanvasNodeData } from "../types";
import { canvasCapabilitySourceText, planCanvasCapabilityOutput } from "../utils/canvas-capability-output";

export function useCanvasCapabilityActions({ nodes, nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId }: {
    nodes: CanvasNodeData[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
}) {
    const [activeNodeId, setActiveNodeId] = useState("");
    const activeNode = nodes.find((node) => node.id === activeNodeId) || null;
    const consume = useCallback(async (artifacts: ArtifactEnvelope[], trace: CapabilityConsumeTrace) => {
        const sourceNode = nodesRef.current.find((node) => node.id === activeNodeId);
        if (!sourceNode) throw new Error("当前 Skill 来源节点已不存在");
        const result = planCanvasCapabilityOutput({ nodes: nodesRef.current, connections: connectionsRef.current, sourceNode, artifacts, trace });
        if (!result.createdNodeIds.length) return;
        nodesRef.current = result.nodes;
        connectionsRef.current = result.connections;
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(new Set(result.createdNodeIds));
        setSelectedConnectionId(null);
    }, [activeNodeId, connectionsRef, nodesRef, setConnections, setNodes, setSelectedConnectionId, setSelectedNodeIds]);

    return {
        activeNode,
        sourceText: activeNode ? canvasCapabilitySourceText(activeNode) : "",
        openNodeCapability: (node: CanvasNodeData) => setActiveNodeId(node.id),
        close: () => setActiveNodeId(""),
        consume,
    };
}
