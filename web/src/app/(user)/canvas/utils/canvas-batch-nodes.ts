import type { CanvasNodeData } from "../types.ts";

export function collectBatchAwareDeletedNodeIds(nodes: CanvasNodeData[], ids: Set<string>) {
    const deletedIds = new Set(ids);
    nodes.forEach((node) => {
        if (ids.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => deletedIds.add(childId));
    });
    return deletedIds;
}

export function removeDeletedNodesFromBatches(nodes: CanvasNodeData[], deletedIds: Set<string>) {
    const next = nodes.filter((node) => !deletedIds.has(node.id));
    return next.map((node) => {
        const childIds = node.metadata?.batchChildIds?.filter((childId) => !deletedIds.has(childId));
        if (!node.metadata?.isBatchRoot || childIds?.length === node.metadata.batchChildIds?.length) return node;
        const primaryImageId = childIds?.includes(node.metadata.primaryImageId || "") ? node.metadata.primaryImageId : childIds?.[0];
        const primaryNode = next.find((item) => item.id === primaryImageId);
        return {
            ...node,
            metadata: {
                ...node.metadata,
                batchChildIds: childIds,
                primaryImageId,
                content: primaryNode?.metadata?.content || node.metadata.content,
                naturalWidth: primaryNode?.metadata?.naturalWidth || node.metadata.naturalWidth,
                naturalHeight: primaryNode?.metadata?.naturalHeight || node.metadata.naturalHeight,
            },
        };
    });
}

export function toggleBatchExpandedInNodes(nodes: CanvasNodeData[], nodeId: string) {
    return nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } } : node));
}

export function setBatchPrimaryInNodes(nodes: CanvasNodeData[], child: CanvasNodeData) {
    const rootId = child.metadata?.batchRootId;
    if (!rootId || !child.metadata?.content) return nodes;
    return nodes.map((node) =>
        node.id === rootId
            ? {
                  ...node,
                  width: child.width,
                  height: child.height,
                  metadata: {
                      ...node.metadata,
                      content: child.metadata?.content,
                      primaryImageId: child.id,
                      naturalWidth: child.metadata?.naturalWidth,
                      naturalHeight: child.metadata?.naturalHeight,
                      freeResize: child.metadata?.freeResize,
                  },
              }
            : node,
    );
}

export function isHiddenBatchChild(node: CanvasNodeData, nodes: CanvasNodeData[], collapsingBatchIds?: Set<string>) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = nodes.find((item) => item.id === rootId);
    if (root && collapsingBatchIds?.has(rootId)) return false;
    return Boolean(root && !root.metadata?.imageBatchExpanded);
}

export function isHiddenBatchConnectionEndpoint(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = nodes.find((item) => item.id === rootId);
    return Boolean(root && !root.metadata?.imageBatchExpanded);
}
