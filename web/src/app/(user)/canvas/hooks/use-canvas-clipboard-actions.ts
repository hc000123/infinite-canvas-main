import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

import { getNodeSpec } from "../constants";
import { copySelectedCanvasItems, pasteCanvasClipboard, type CanvasClipboard } from "../utils/canvas-clipboard";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ContextMenuState, type Position } from "../types";

type UseCanvasClipboardActionsOptions = {
    nodesRef: RefObject<CanvasNodeData[]>;
    connectionsRef: RefObject<CanvasConnection[]>;
    selectedNodeIdsRef: RefObject<Set<string>>;
    getCanvasCenter: () => Position;
    createImageFileNode: (file: File, position: Position) => Promise<unknown>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    showSuccess: (text: string) => void;
};

export function useCanvasClipboardActions({
    nodesRef,
    connectionsRef,
    selectedNodeIdsRef,
    getCanvasCenter,
    createImageFileNode,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    setDialogNodeId,
    showSuccess,
}: UseCanvasClipboardActionsOptions) {
    const clipboardRef = useRef<CanvasClipboard | null>(null);

    const copySelectedNodes = useCallback(() => {
        const clipboard = copySelectedCanvasItems(nodesRef.current, connectionsRef.current, selectedNodeIdsRef.current);
        if (clipboard) clipboardRef.current = clipboard;
    }, [connectionsRef, nodesRef, selectedNodeIdsRef]);

    const pasteCopiedNodes = useCallback(() => {
        const pasted = pasteCanvasClipboard(clipboardRef.current, getCanvasCenter());
        if (!pasted) return false;

        setNodes((prev) => [...prev, ...pasted.nodes]);
        setConnections((prev) => [...prev, ...pasted.connections]);
        setSelectedNodeIds(new Set(pasted.nodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(pasted.nodes[0]?.id || null);
        return true;
    }, [getCanvasCenter, setConnections, setContextMenu, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds]);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const spec = getNodeSpec(CanvasNodeType.Text);
            const center = getCanvasCenter();
            const node: CanvasNodeData = {
                id: `${CanvasNodeType.Text}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type: CanvasNodeType.Text,
                title: trimmed.slice(0, 32) || "剪切板文本",
                position: {
                    x: center.x - spec.width / 2,
                    y: center.y - spec.height / 2,
                },
                width: spec.width,
                height: spec.height,
                metadata: { ...spec.metadata, content: trimmed, status: "success" },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter, setContextMenu, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            showSuccess("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) showSuccess("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, showSuccess]);

    return { copySelectedNodes, pasteCopiedNodes, pasteSystemClipboard };
}
