import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { readImageMeta } from "@/lib/image-utils";
import { uploadImage } from "@/services/image-storage";
import { applyAssistantCanvasActions, type AssistantCanvasAction } from "../utils/canvas-assistant-actions";
import { canvasAssetReferenceMetadata } from "../utils/canvas-asset-reference";
import type { InsertAssetPayload } from "../utils/asset-insert-payload";
import { buildInsertedMediaAssetNode } from "../utils/canvas-inserted-media-node";
import { fitNodeSize } from "../utils/canvas-node-size";
import { NODE_STATUS_SUCCESS, createCanvasNode, imageMetadata } from "../utils/canvas-page-helpers";
import { placeCanvasNodeAwayFromNodes } from "../utils/canvas-node-placement";
import { CanvasNodeType, type CanvasAssistantImage, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../types";

type CanvasAssistantWriteMessage = {
    success: (text: string) => void;
    warning: (text: string) => void;
};

export function useCanvasAssistantWriteActions({
    connectionsRef,
    getCanvasCenter,
    message,
    nodesRef,
    setConnections,
    setDialogNodeId,
    setAssetPickerOpen,
    setNodes,
    setSelectedConnectionId,
    setSelectedNodeIds,
}: {
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    getCanvasCenter: () => Position;
    message: CanvasAssistantWriteMessage;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
}) {
    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = getCanvasCenter();
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = placeCanvasNodeAwayFromNodes(
                {
                    id,
                    type: CanvasNodeType.Image,
                    title: image.prompt.slice(0, 32) || "Generated Image",
                    position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                    width: config.width,
                    height: config.height,
                    metadata: {
                        ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }),
                        prompt: image.prompt,
                        ...canvasAssetReferenceMetadata(image),
                        volcengineAsset: image.volcengineAsset,
                    },
                },
                nodesRef.current,
            );

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [getCanvasCenter, nodesRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const insertAssistantText = useCallback(
        (text: string, metadata: Partial<CanvasNodeMetadata> = {}) => {
            const center = getCanvasCenter();
            const node = placeCanvasNodeAwayFromNodes(
                {
                    ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS, ...metadata }),
                    title: text.slice(0, 32) || "Assistant Text",
                },
                nodesRef.current,
            );

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [getCanvasCenter, nodesRef, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const applyAssistantActions = useCallback(
        (actions: AssistantCanvasAction[]) => {
            const result = applyAssistantCanvasActions({ nodes: nodesRef.current, connections: connectionsRef.current, actions });
            const changed = result.nodes.length !== nodesRef.current.length || result.connections.length !== connectionsRef.current.length;
            if (!changed) {
                message.warning("动作预览未通过或没有可应用内容");
                return false;
            }
            nodesRef.current = result.nodes;
            connectionsRef.current = result.connections;
            setNodes(result.nodes);
            setConnections(result.connections);
            const createdNodeIds = actions.flatMap((action) => (action.kind === "write" ? action.preview?.createdNodes?.map((node) => node.id) || [] : [])).filter((id) => result.nodes.some((node) => node.id === id));
            if (createdNodeIds.length) setSelectedNodeIds(new Set(createdNodeIds));
            setSelectedConnectionId(null);
            message.success("已应用助手动作");
            return true;
        },
        [connectionsRef, message, nodesRef, setConnections, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content, canvasAssetReferenceMetadata(payload));
            } else if (payload.kind === "video" || payload.kind === "audio") {
                const center = getCanvasCenter();
                const id = `${payload.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                setNodes((prev) => [...prev, placeCanvasNodeAwayFromNodes(buildInsertedMediaAssetNode(payload, id, center), prev)]);
                setSelectedNodeIds(new Set([id]));
            } else {
                void insertAssistantImage({
                    id: `asset-${Date.now()}`,
                    prompt: payload.title,
                    dataUrl: payload.dataUrl,
                    storageKey: payload.storageKey,
                    sourceAssetId: payload.sourceAssetId,
                    assetVersion: payload.assetVersion,
                    volcengineAsset: payload.volcengineAsset,
                });
            }
            setAssetPickerOpen(false);
        },
        [getCanvasCenter, insertAssistantImage, insertAssistantText, setAssetPickerOpen, setNodes, setSelectedNodeIds],
    );

    return { applyAssistantActions, handleAssetInsert, insertAssistantImage, insertAssistantText };
}
