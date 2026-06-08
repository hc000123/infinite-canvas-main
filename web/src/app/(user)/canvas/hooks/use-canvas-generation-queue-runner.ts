"use client";

import { useEffect, type MutableRefObject } from "react";

import type { CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";
import type { CanvasNodeData } from "../types";
import { nextQueuedItem } from "../utils/generation-queue";
import type { GenerateNodeResult } from "./use-canvas-generation-flow-actions";

type UseCanvasGenerationQueueRunnerOptions = {
    projectLoaded: boolean;
    queuePaused: boolean;
    queueItems: Parameters<typeof nextQueuedItem>[0];
    queueConcurrency: number;
    workspaceProjectId: string;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    processingQueueItemIdsRef: MutableRefObject<Set<string>>;
    handleGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<GenerateNodeResult>;
    markQueueItemRunning: (id: string, taskId?: string) => void;
    markQueueItemSucceeded: (id: string, result?: { taskId?: string; resultAssetId?: string }) => void;
    markQueueItemFailed: (id: string, errorMessage: string) => void;
};

export function useCanvasGenerationQueueRunner({
    projectLoaded,
    queuePaused,
    queueItems,
    queueConcurrency,
    workspaceProjectId,
    nodesRef,
    processingQueueItemIdsRef,
    handleGenerateNode,
    markQueueItemRunning,
    markQueueItemSucceeded,
    markQueueItemFailed,
}: UseCanvasGenerationQueueRunnerOptions) {
    useEffect(() => {
        if (!projectLoaded || queuePaused) return;
        const item = nextQueuedItem(queueItems, workspaceProjectId, queueConcurrency);
        if (!item || processingQueueItemIdsRef.current.has(item.id)) return;
        processingQueueItemIdsRef.current.add(item.id);
        markQueueItemRunning(item.id, item.taskId);
        void (async () => {
            try {
                const node = nodesRef.current.find((entry) => entry.id === item.nodeId);
                if (!node) {
                    markQueueItemFailed(item.id, "视频生成配置节点不存在");
                    return;
                }
                const prompt = node.metadata?.prompt || "";
                const result = await handleGenerateNode(node.id, "video", prompt);
                if (result && "recoverable" in result && result.recoverable) {
                    markQueueItemRunning(item.id, result.taskId || item.taskId);
                } else if (result?.ok === false) {
                    markQueueItemFailed(item.id, result.errorDetails || "生成失败");
                } else {
                    markQueueItemSucceeded(item.id, { taskId: result?.taskId || item.taskId, resultAssetId: result?.resultAssetId });
                }
            } catch (error) {
                markQueueItemFailed(item.id, error instanceof Error ? error.message : "生成失败");
            } finally {
                processingQueueItemIdsRef.current.delete(item.id);
            }
        })();
    }, [handleGenerateNode, markQueueItemFailed, markQueueItemRunning, markQueueItemSucceeded, nodesRef, processingQueueItemIdsRef, projectLoaded, queueConcurrency, queueItems, queuePaused, workspaceProjectId]);
}
