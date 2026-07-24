import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, Position } from "../types";
import type { CanvasPromptDocument } from "./canvas-prompt-document";

export type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type CanvasClipboardIdFactory = {
    nodeId: (node: CanvasNodeData, index: number) => string;
    connectionId: (connection: CanvasConnection, index: number) => string;
};

const defaultIdFactory: CanvasClipboardIdFactory = {
    nodeId: (node, index) => `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    connectionId: (_connection, index) => `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
};

export function copySelectedCanvasItems(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedIds: Set<string>): CanvasClipboard | null {
    if (!selectedIds.size) return null;

    const copiedNodes = nodes
        .filter((node) => selectedIds.has(node.id))
        .map((node) => ({
            ...node,
            position: { ...node.position },
            metadata: node.metadata ? { ...node.metadata } : undefined,
        }));

    if (!copiedNodes.length) return null;

    const nodeIds = new Set(nodes.map((node) => node.id));
    const connectionKeys = new Set<string>();
    const copiedConnections = connections.filter((connection) => {
        if (!selectedIds.has(connection.toNodeId) || !nodeIds.has(connection.fromNodeId)) return false;
        const key = `${connection.fromNodeId}:${connection.toNodeId}:${connection.fromHandle || ""}:${connection.toHandle || ""}`;
        if (connectionKeys.has(key)) return false;
        connectionKeys.add(key);
        return true;
    });

    return {
        nodes: copiedNodes,
        connections: copiedConnections.map((connection) => ({ ...connection })),
    };
}

export function pasteCanvasClipboard(clipboard: CanvasClipboard | null, center: Position, idFactory: CanvasClipboardIdFactory = defaultIdFactory, occupiedNodes: CanvasNodeData[] = []) {
    if (!clipboard?.nodes.length) return null;

    const bounds = clipboard.nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    let dx = center.x - (bounds.left + bounds.right) / 2;
    let dy = center.y - (bounds.top + bounds.bottom) / 2;
    while (
        clipboard.nodes.some((node) =>
            occupiedNodes.some((occupied) => Math.abs(occupied.position.x - (node.position.x + dx)) < 1 && Math.abs(occupied.position.y - (node.position.y + dy)) < 1),
        )
    ) {
        dx += 32;
        dy += 32;
    }
    const idMap = new Map(clipboard.nodes.map((node, index) => [node.id, idFactory.nodeId(node, index)]));
    const nodes = clipboard.nodes.map((node) => {
        const id = idMap.get(node.id)!;
        return {
            ...node,
            id,
            title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
            position: {
                x: node.position.x + dx,
                y: node.position.y + dy,
            },
            metadata: duplicateCanvasNodeMetadata(node, idMap),
        };
    });

    const connections = clipboard.connections.flatMap((connection, index) => {
        const fromNodeId = idMap.get(connection.fromNodeId) || connection.fromNodeId;
        const toNodeId = idMap.get(connection.toNodeId);
        if (!fromNodeId || !toNodeId) return [];
        return [
            {
                ...connection,
                id: idFactory.connectionId(connection, index),
                fromNodeId,
                toNodeId,
            },
        ];
    });

    return { nodes, connections };
}

const DUPLICATED_MEDIA_RESULT_KEYS = [
    "content",
    "videoUrl",
    "cacheUrl",
    "cachePath",
    "cacheFilename",
    "lastFrameUrl",
    "lastFrameStorageKey",
    "storageKey",
    "mimeType",
    "bytes",
    "naturalWidth",
    "naturalHeight",
    "volcengineAsset",
    "aiTaskCredits",
    "creditLogId",
    "creditsRefunded",
    "refundedAt",
    "taskDuration",
    "executionExpiresAfter",
    "videoUrlExpiresAt",
    "localStoredAt",
    "sourceAssetId",
    "assetVersion",
    "assetReferenceMode",
    "assetNodeNumber",
    "canvasSource",
    "variantOfNodeId",
    "continuationOfNodeId",
    "sourceVideoNodeId",
    "capturedFrameSourceVideoNodeId",
    "capturedFrameTime",
    "capturedFrameAt",
    "capturedFrameSource",
    "videoReferences",
    "audioReferences",
    "references",
    "isBatchRoot",
    "batchRootId",
    "batchChildIds",
    "batchUsesReferenceImages",
    "primaryImageId",
    "imageBatchExpanded",
    "productionVideoVersionId",
    "productionVideoVersionNumber",
    "productionVideoVersionCreatedAt",
    "productionVideoVersionNote",
    "productionVideoVersionHidden",
    "isCurrentProductionVersion",
] as const satisfies readonly (keyof CanvasNodeMetadata)[];

function duplicateCanvasNodeMetadata(node: CanvasNodeData, idMap: ReadonlyMap<string, string>): CanvasNodeMetadata | undefined {
    if (!node.metadata) return undefined;
    const metadata: CanvasNodeMetadata = {
        ...node.metadata,
        prompt: node.metadata.promptDraft ?? node.metadata.prompt,
        promptDocument: remapPromptDocument(node.metadata.promptDraftDocument ?? node.metadata.promptDocument, idMap),
        promptDraft: undefined,
        promptDraftDocument: undefined,
        pendingMediaVersion: undefined,
        mediaVersions: undefined,
        currentMediaVersionId: undefined,
        errorDetails: undefined,
        taskId: undefined,
        taskStatus: undefined,
        rawTaskStatus: undefined,
        aiTaskId: undefined,
        upstreamTaskId: undefined,
        aiTaskStatus: undefined,
        generationStartedAt: undefined,
        taskCreatedAt: undefined,
        taskUpdatedAt: undefined,
        finishedAt: undefined,
        inputOrder: node.metadata.inputOrder?.map((id) => idMap.get(id) || id),
        referenceOrder: node.metadata.referenceOrder?.map((item) => ({ ...item, nodeId: item.nodeId ? idMap.get(item.nodeId) || item.nodeId : undefined })),
        referenceRoles: node.metadata.referenceRoles?.map((item) => ({ ...item, nodeId: idMap.get(item.nodeId) || item.nodeId })),
    };

    if (node.type === "image" || node.type === "video") {
        DUPLICATED_MEDIA_RESULT_KEYS.forEach((key) => Reflect.deleteProperty(metadata, key));
        metadata.status = "idle";
    } else if (node.type === "config") {
        metadata.status = "idle";
    }
    return metadata;
}

function remapPromptDocument(document: CanvasPromptDocument | undefined, idMap: ReadonlyMap<string, string>): CanvasPromptDocument | undefined {
    if (!document) return undefined;
    return {
        ...document,
        blocks: document.blocks.map((block) => (block.type === "reference" ? { ...block, nodeId: idMap.get(block.nodeId) || block.nodeId } : { ...block })),
    };
}
