"use client";

import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { CanvasConnection } from "../types";

export function useCanvasDeleteActions({ deleteNodes, selectedConnectionId, selectedNodeIdsRef, setConnections, setSelectedConnectionId }: { deleteNodes: (nodeIds: Set<string>) => void; selectedConnectionId: string | null; selectedNodeIdsRef: RefObject<Set<string>>; setConnections: Dispatch<SetStateAction<CanvasConnection[]>>; setSelectedConnectionId: Dispatch<SetStateAction<string | null>> }) {
    const deleteConnection = useCallback(
        (connectionId: string) => {
            setConnections((prev) => prev.filter((connection) => connection.id !== connectionId));
            setSelectedConnectionId((selectedId) => (selectedId === connectionId ? null : selectedId));
        },
        [setConnections, setSelectedConnectionId],
    );
    const deleteSelection = useCallback(() => {
        if (selectedNodeIdsRef.current.size) {
            deleteNodes(new Set(selectedNodeIdsRef.current));
            return;
        }
        if (selectedConnectionId) deleteConnection(selectedConnectionId);
    }, [deleteConnection, deleteNodes, selectedConnectionId, selectedNodeIdsRef]);

    return { deleteConnection, deleteSelection };
}
