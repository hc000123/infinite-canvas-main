"use client";

import { useEffect, useLayoutEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

type Props = {
    connections: CanvasConnection[];
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    dialogNodeId: string | null;
    nodes: CanvasNodeData[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    selectedNodeIds: Set<string>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    selectedVideoNode?: CanvasNodeData | null;
    setLastSelectedVideoNodeId: Dispatch<SetStateAction<string>>;
    setNodeImageSettingsOpen: Dispatch<SetStateAction<boolean>>;
    viewport: ViewportTransform;
    viewportRef: MutableRefObject<ViewportTransform>;
};

export function useCanvasPageRuntimeEffects({
    connections,
    connectionsRef,
    dialogNodeId,
    nodes,
    nodesRef,
    selectedNodeIds,
    selectedNodeIdsRef,
    selectedVideoNode,
    setLastSelectedVideoNodeId,
    setNodeImageSettingsOpen,
    viewport,
    viewportRef,
}: Props) {
    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId, setNodeImageSettingsOpen]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
    }, [connections, connectionsRef, nodes, nodesRef, selectedNodeIds, selectedNodeIdsRef, viewport, viewportRef]);

    useEffect(() => {
        if (selectedVideoNode) setLastSelectedVideoNodeId(selectedVideoNode.id);
    }, [selectedVideoNode, setLastSelectedVideoNodeId]);
}
