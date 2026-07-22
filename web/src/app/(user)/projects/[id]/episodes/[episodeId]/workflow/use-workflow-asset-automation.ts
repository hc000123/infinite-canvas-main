"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { retryWorkflowStage, reviewWorkflowStage, startWorkflowStage } from "@/services/api/workflow-runs";

import type { useWorkflowStageActions } from "./use-workflow-stage-actions";
import { nextWorkflowAssetAction } from "./workflow-asset-automation";

type StageActions = ReturnType<typeof useWorkflowStageActions>;

export function useWorkflowAssetAutomation(input: {
    enabled: boolean;
    extraction: StageActions;
    prompts: StageActions;
    refresh: () => void | Promise<void>;
    runId: string;
    workerReady: boolean;
}) {
    const consumed = useRef(new Set<string>());
    const [executing, setExecuting] = useState("");
    const [localError, setLocalError] = useState("");
    const action = nextWorkflowAssetAction({
        enabled: input.enabled,
        workerReady: input.workerReady,
        extraction: stageSnapshot(input.extraction),
        prompts: stageSnapshot(input.prompts),
    });
    const actionKey = useMemo(() => automationActionKey(action.type, input.extraction, input.prompts), [action.type, input.extraction, input.prompts]);

    useEffect(() => {
        if (action.type === "idle" || !input.runId || executing || consumed.current.has(actionKey)) return;
        consumed.current.add(actionKey);
        setExecuting(action.type);
        setLocalError("");
        void executeAutomationAction(action.type, input)
            .catch((error) => setLocalError(error instanceof Error ? error.message : "资产自动整理失败"))
            .finally(() => setExecuting(""));
    }, [action.type, actionKey, executing, input]);

    const retry = useCallback(async () => {
        const target = failedStage(input.prompts) || failedStage(input.extraction);
        if (!target?.stage || executing) return;
        setExecuting("retry");
        setLocalError("");
        try {
            if (target.stage.status === "needs_review") {
                if (!target.artifact) throw new Error("未找到需要重做的资产产物");
                await reviewWorkflowStage(target.stage.id, { artifactHash: target.artifact.contentHash, decision: "rejected", comment: "质量检查未通过，自动重新生成" });
            }
            await retryWorkflowStage(target.stage.id, `workflow:${input.runId}:${target.stage.stageId}:retry:${target.stage.attempt + 1}`);
            consumed.current.clear();
            await input.refresh();
        } catch (error) {
            setLocalError(error instanceof Error ? error.message : "重新整理资产失败");
        } finally {
            setExecuting("");
        }
    }, [executing, input]);

    const failed = Boolean(localError || failedStage(input.prompts) || failedStage(input.extraction));
    const ready = ["approved", "applied"].includes(input.prompts.stage?.status || "");
    const actionReason = action.type === "idle" ? action.reason : "";
    return {
        busy: Boolean(executing),
        message: localError || (failed ? actionReason || "资产自动整理需要重试" : ready ? "资产卡片已自动准备完成" : actionReason || "正在准备资产卡片"),
        retry,
        status: failed ? ("error" as const) : ready ? ("ready" as const) : ("organizing" as const),
    };
}

async function executeAutomationAction(type: Exclude<ReturnType<typeof nextWorkflowAssetAction>["type"], "idle">, input: Parameters<typeof useWorkflowAssetAutomation>[0]) {
    if (type === "start-extraction") await startWorkflowStage(input.runId, "asset-extraction", input.extraction.startKey);
    if (type === "approve-extraction" && input.extraction.stage && input.extraction.artifact) await reviewWorkflowStage(input.extraction.stage.id, { artifactHash: input.extraction.artifact.contentHash, decision: "approved" });
    if (type === "start-prompts") await startWorkflowStage(input.runId, "asset-image-prompt", input.prompts.startKey);
    if (type === "approve-prompts" && input.prompts.stage && input.prompts.artifact) await reviewWorkflowStage(input.prompts.stage.id, { artifactHash: input.prompts.artifact.contentHash, decision: "approved" });
    await input.refresh();
}

function stageSnapshot(state: StageActions) {
    return state.stage ? { gatePassed: Boolean(state.gate?.passed), status: state.stage.status } : null;
}

function failedStage(state: StageActions) {
    if (!state.stage) return null;
    if (["failed", "cancelled", "rejected"].includes(state.stage.status)) return state;
    if (state.stage.status === "needs_review" && !state.gate?.passed) return state;
    return null;
}

function automationActionKey(type: string, extraction: StageActions, prompts: StageActions) {
    const state = type.includes("prompt") ? prompts : extraction;
    return [type, state.stage?.id, state.stage?.attempt, state.stage?.status, state.artifact?.contentHash].filter(Boolean).join(":");
}
