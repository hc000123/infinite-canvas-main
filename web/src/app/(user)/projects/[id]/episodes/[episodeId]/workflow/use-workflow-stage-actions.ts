"use client";

import { useState } from "react";
import { App } from "antd";

import { cancelWorkflowStage, retryWorkflowStage, reviewWorkflowStage, startWorkflowStage, type RemoteWorkflowRunDetail, type WorkflowStageStartOptions } from "@/services/api/workflow-runs";

import { canStartFreshShotPrompt, workflowStageActions } from "./workflow-stage-actions";

export function useWorkflowStageActions(input: { detail: RemoteWorkflowRunDetail | null; refresh: () => void | Promise<void>; stageId: string }) {
    const { message } = App.useApp();
    const [busyAction, setBusyAction] = useState("");
    const stageFor = (stageId: string) => input.detail?.stages.filter((item) => item.stageId === stageId).reduce((latest, item) => (!latest || item.attempt > latest.attempt ? item : latest), null as RemoteWorkflowRunDetail["stages"][number] | null) || null;
    const rawStage = stageFor(input.stageId);
    const dependency = input.stageId === "asset-image-prompt" ? stageFor("asset-extraction") : input.stageId === "shot-breakdown" ? stageFor("script-adaptation") : input.stageId === "shot-prompt" ? stageFor("shot-breakdown") : null;
    const dependencyReady = Boolean(dependency && ["approved", "applied"].includes(dependency.status));
    const stage = rawStage?.status === "blocked" && dependencyReady ? { ...rawStage, status: "ready" as const } : rawStage;
    const artifact = input.detail?.artifacts.find((item) => item.id === stage?.outputArtifactId) || null;
    const gate = input.detail?.gates.find((item) => item.artifactId === artifact?.id) || null;
    const actions = workflowStageActions(stage ? { hasArtifact: Boolean(artifact), status: stage.status } : null, Boolean(gate?.passed));
    if (input.stageId === "shot-prompt" && canStartFreshShotPrompt(stage?.status)) actions.canStart = true;

    const execute = async (key: string, action: () => Promise<unknown>, success: string) => {
        if (busyAction) return false;
        setBusyAction(key);
        try {
            await action();
            message.success(success);
            await input.refresh();
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败，请重试");
            return false;
        } finally {
            setBusyAction("");
        }
    };

    const startKey = input.detail ? workflowActionKey(input.detail.run.id, input.stageId, (stage?.attempt || 0) + 1, "start") : "";
    return {
        actions,
        approve: () => (artifact && stage ? execute("approve", () => reviewWorkflowStage(stage.id, { artifactHash: artifact.contentHash, decision: "approved" }), "阶段产物已批准") : undefined),
        artifact,
        busyAction,
        cancel: () => (stage ? execute("cancel", () => cancelWorkflowStage(stage.id), "已提交停止请求") : undefined),
        gate,
        reject: () => (artifact && stage ? execute("reject", () => reviewWorkflowStage(stage.id, { artifactHash: artifact.contentHash, decision: "rejected", comment: "需要调整后重新生成" }), "已退回当前产物") : undefined),
        retry: () => (stage ? execute("retry", () => retryWorkflowStage(stage.id, workflowActionKey(stage.workflowRunId, stage.stageId, stage.attempt + 1, "retry")), "已重新加入队列") : undefined),
        stage,
        start: (options?: string | WorkflowStageStartOptions) => (input.detail ? execute("start", () => startWorkflowStage(input.detail!.run.id, input.stageId, startKey, typeof options === "string" ? { mediaBatchId: options } : options), "阶段已加入执行队列") : undefined),
        startKey,
    };
}

function workflowActionKey(runId: string, stageId: string, attempt: number, action: string) {
    return `workflow:${runId}:${stageId}:${action}:${attempt}`;
}
