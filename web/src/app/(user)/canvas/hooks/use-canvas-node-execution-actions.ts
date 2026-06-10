import { useCanvasGenerationController } from "./use-canvas-generation-controller";
import { useCanvasNodeActionController } from "./use-canvas-node-action-controller";

type GenerationOptions = Parameters<typeof useCanvasGenerationController>[0];
type NodeActionOptions = Parameters<typeof useCanvasNodeActionController>[0];

type UseCanvasNodeExecutionActionsOptions = GenerationOptions & {
    derivative: NodeActionOptions["derivative"];
    tools: Omit<NodeActionOptions["tools"], "handleRetryNode">;
};

export function useCanvasNodeExecutionActions({ flow, queue, refresh, retry, derivative, tools }: UseCanvasNodeExecutionActionsOptions) {
    const { handleGenerateNode, handleRefreshVideoTask, handleRetryNode } = useCanvasGenerationController({
        flow,
        queue,
        refresh,
        retry,
    });
    const { cropImageNode, generateAngleNode, nodeToolActions } = useCanvasNodeActionController({
        derivative,
        tools: {
            ...tools,
            handleRetryNode,
        },
    });

    return {
        cropImageNode,
        generateAngleNode,
        handleGenerateNode,
        handleRefreshVideoTask,
        nodeToolActions,
    };
}
