import { useCallback, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { setBatchPrimaryInNodes, toggleBatchExpandedInNodes } from "../utils/canvas-batch-nodes";
import type { CanvasNodeData } from "../types";

export function useCanvasBatchNodeUi({
    nodes,
    nodesRef,
    setNodes,
}: {
    nodes: CanvasNodeData[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
}) {
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const batchChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (node.metadata?.isBatchRoot) map.set(node.id, node.metadata.batchChildIds?.length || 0);
        });
        return map;
    }, [nodes]);
    const batchMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const rootId = node.metadata?.batchRootId;
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);

    const toggleBatchExpanded = useCallback(
        (nodeId: string) => {
            const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
            if (isExpanded) {
                setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
                window.setTimeout(() => {
                    setCollapsingBatchIds((prev) => {
                        const next = new Set(prev);
                        next.delete(nodeId);
                        return next;
                    });
                }, 320);
            } else {
                setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
                window.setTimeout(() => {
                    setOpeningBatchIds((prev) => {
                        const next = new Set(prev);
                        next.delete(nodeId);
                        return next;
                    });
                }, 260);
            }
            setNodes((prev) => toggleBatchExpandedInNodes(prev, nodeId));
        },
        [nodesRef, setCollapsingBatchIds, setNodes, setOpeningBatchIds],
    );

    const setBatchPrimary = useCallback(
        (child: CanvasNodeData) => {
            setNodes((prev) => setBatchPrimaryInNodes(prev, child));
        },
        [setNodes],
    );

    return { batchChildCountById, batchMotionById, collapsingBatchIds, nodeById, openingBatchIds, setBatchPrimary, toggleBatchExpanded };
}
