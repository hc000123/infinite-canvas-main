import { useMemo, type RefObject } from "react";

import type { Asset } from "@/stores/use-asset-store";
import { buildFrameReferencesByVideoId } from "../utils/canvas-page-helpers";
import { isHiddenBatchChild } from "../utils/canvas-batch-nodes";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "../types";

export function useCanvasDerivedState({
    assets,
    collapsingBatchIds,
    connections,
    containerRef,
    hoveredNodeId,
    lastSelectedVideoNodeId,
    nodeById,
    nodes,
    selectedNodeIds,
    size,
    viewport,
}: {
    assets: Asset[];
    collapsingBatchIds: Set<string>;
    connections: CanvasConnection[];
    containerRef: RefObject<HTMLDivElement | null>;
    hoveredNodeId: string | null;
    lastSelectedVideoNodeId: string;
    nodeById: Map<string, CanvasNodeData>;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    size: { width: number; height: number };
    viewport: ViewportTransform;
}) {
    const visibleNodes = useMemo(() => {
        const padding = 280;
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + width / viewport.k + padding * 2;
        const viewBottom = viewTop + height / viewport.k + padding * 2;

        return nodes.filter((node) => !isHiddenBatchChild(node, nodes, collapsingBatchIds) && node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
    }, [collapsingBatchIds, containerRef, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const frameReferencesByVideoId = useMemo(() => buildFrameReferencesByVideoId(nodes, connections), [connections, nodes]);
    const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const assetTitleById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset.title])), [assets]);
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : "";
    const selectedInspectorNode = selectedNodeId ? nodeById.get(selectedNodeId) || null : null;
    const selectedVideoNode = selectedInspectorNode?.type === CanvasNodeType.Video && selectedInspectorNode.metadata?.content ? selectedInspectorNode : null;
    const packageSlotVideoNode = selectedVideoNode || (lastSelectedVideoNodeId ? nodeById.get(lastSelectedVideoNodeId) || null : null);
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || selectedNodeId || null;

    return {
        activeNodeId,
        assetById,
        assetTitleById,
        frameReferencesByVideoId,
        hasMultipleSelectedNodes,
        packageSlotVideoNode,
        selectedInspectorNode,
        selectedVideoNode,
        visibleNodes,
    };
}
