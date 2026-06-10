import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import { NODE_DEFAULT_SIZE } from "../constants";
import type { CanvasNodeData } from "../types";
import { buildImageBriefImageConfigNode, type ImageBrief } from "../utils/image-brief";
import { placeCanvasNodeAwayFromNodes } from "../utils/canvas-node-placement";

export function useCanvasImageBriefActions({
    canvasAiConfig,
    getCanvasCenter,
    nodesRef,
    setDialogNodeId,
    setNodes,
    setSelectedConnectionId,
    setSelectedNodeIds,
}: {
    canvasAiConfig: AiConfig;
    getCanvasCenter: () => { x: number; y: number };
    nodesRef: RefObject<CanvasNodeData[]>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
}) {
    const createBriefImageConfigNode = useCallback(
        (brief: ImageBrief) => {
            const center = getCanvasCenter();
            const node = placeCanvasNodeAwayFromNodes(
                buildImageBriefImageConfigNode({
                    brief,
                    config: canvasAiConfig,
                    position: { x: center.x - NODE_DEFAULT_SIZE.config.width / 2, y: center.y - NODE_DEFAULT_SIZE.config.height / 2 },
                }),
                nodesRef.current,
            );
            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
        },
        [canvasAiConfig, getCanvasCenter, nodesRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    return { createBriefImageConfigNode };
}
