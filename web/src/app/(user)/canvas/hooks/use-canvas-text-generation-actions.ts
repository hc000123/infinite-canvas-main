import { useCallback, type Dispatch, type SetStateAction } from "react";

import { requestImageQuestion } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";

import { buildNodeChatMessages, type NodeGenerationContext } from "../components/canvas-node-generation";
import { createTextGenerationChildNodes } from "../utils/canvas-generation-nodes";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;

type UseCanvasTextGenerationActionsOptions = {
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
};

type GenerateTextNodeInput = {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    prompt: string;
    effectivePrompt: string;
    generationConfig: AiConfig;
    generationContext: NodeGenerationContext;
    editingTextNode: boolean;
};

type RetryTextNodeInput = {
    node: CanvasNodeData;
    prompt: string;
    generationConfig: AiConfig;
    generationContext: NodeGenerationContext;
};

export function useCanvasTextGenerationActions({ setNodes, setConnections }: UseCanvasTextGenerationActionsOptions) {
    const generateTextNode = useCallback(
        async ({ nodeId, sourceNode, prompt, effectivePrompt, generationConfig, generationContext, editingTextNode }: GenerateTextNodeInput) => {
            let streamed = "";
            const isConfigNode = sourceNode?.type === "config";
            const textCount = isConfigNode ? textGenerationCount(generationConfig.count) : 1;
            const { childIds, childNodes, connections } = createTextGenerationChildNodes({ nodeId, sourceNode, prompt, textCount, editingTextNode });
            if (isConfigNode || editingTextNode) {
                setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                setConnections((prev) => [...prev, ...connections]);
            }

            const answers = await Promise.all(
                (childIds.length ? childIds : [nodeId]).map((targetNodeId) => {
                    let localStreamed = "";
                    return requestImageQuestion(generationConfig, buildNodeChatMessages({ ...generationContext, prompt: effectivePrompt }), (text) => {
                        localStreamed = text;
                        streamed = text;
                        if (isConfigNode) return;
                        setNodes((prev) => prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: text, status: NODE_STATUS_LOADING } } : node)));
                    }).then((answer) => ({ nodeId: targetNodeId, content: answer || localStreamed }));
                }),
            );
            const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
            setNodes((prev) =>
                prev.map((node) =>
                    childIds.includes(node.id)
                        ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                        : node.id === nodeId && isConfigNode
                          ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                          : node.id === nodeId && !editingTextNode
                            ? { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Generated Text", metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                            : node,
                ),
            );
            return { pendingChildIds: childIds };
        },
        [setConnections, setNodes],
    );

    const retryTextNode = useCallback(
        async ({ node, prompt, generationConfig, generationContext }: RetryTextNodeInput) => {
            let streamed = "";
            const answer = await requestImageQuestion(generationConfig, buildNodeChatMessages({ ...generationContext, prompt }), (text) => {
                streamed = text;
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
            });
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)));
        },
        [setNodes],
    );

    return { generateTextNode, retryTextNode };
}

function textGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}
