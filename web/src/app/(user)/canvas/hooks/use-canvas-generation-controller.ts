"use client";

import { useCanvasGenerationFlowActions } from "./use-canvas-generation-flow-actions";
import { useCanvasGenerationQueueRunner } from "./use-canvas-generation-queue-runner";
import { useCanvasGenerationRetryActions } from "./use-canvas-generation-retry-actions";
import { useCanvasVideoTaskRefresh } from "./use-canvas-video-task-refresh";

type FlowOptions = Parameters<typeof useCanvasGenerationFlowActions>[0];
type QueueOptions = Parameters<typeof useCanvasGenerationQueueRunner>[0];
type RefreshOptions = Parameters<typeof useCanvasVideoTaskRefresh>[0];
type RetryOptions = Parameters<typeof useCanvasGenerationRetryActions>[0];

type Props = {
    flow: FlowOptions;
    queue: Omit<QueueOptions, "handleGenerateNode">;
    refresh: RefreshOptions;
    retry: RetryOptions;
};

export function useCanvasGenerationController({ flow, queue, refresh, retry }: Props) {
    const { handleGenerateNode } = useCanvasGenerationFlowActions(flow);
    useCanvasGenerationQueueRunner({ ...queue, handleGenerateNode });
    const { handleRefreshVideoTask } = useCanvasVideoTaskRefresh(refresh);
    const { handleRetryNode } = useCanvasGenerationRetryActions(retry);

    return {
        handleGenerateNode,
        handleRefreshVideoTask,
        handleRetryNode,
    };
}
