import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import { buildNodeGenerationInputs, type NodeGenerationInput } from "../components/canvas-node-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { buildCanvasVideoDefaultsPatch } from "../utils/canvas-video-config";
import { applyNodeConfigPatch, shouldRememberVideoDefaults } from "../utils/canvas-page-helpers";

export function useCanvasConfigNodeActions({
    canvasAiConfig,
    connections,
    nodes,
    nodesRef,
    setNodes,
    updateConfig,
}: {
    canvasAiConfig: AiConfig;
    connections: CanvasConnection[];
    nodes: CanvasNodeData[];
    nodesRef: RefObject<CanvasNodeData[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
}) {
    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);

    const handleConfigNodeChange = useCallback(
        (nodeId: string, patch: Partial<CanvasNodeMetadata>) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (shouldRememberVideoDefaults(node, patch)) {
                const defaults = buildCanvasVideoDefaultsPatch(canvasAiConfig, patch);
                Object.entries(defaults).forEach(([key, value]) => updateConfig(key as keyof AiConfig, value as AiConfig[keyof AiConfig]));
            }
            setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
        },
        [canvasAiConfig, nodesRef, setNodes, updateConfig],
    );

    return { configInputsById, handleConfigNodeChange };
}
