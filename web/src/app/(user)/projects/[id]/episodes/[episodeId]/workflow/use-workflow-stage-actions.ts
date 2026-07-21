"use client";

import { useMemo, useState } from "react";
import { App } from "antd";

import { cancelWorkflowStage, retryWorkflowStage, reviewWorkflowStage, startWorkflowStage, type RemoteWorkflowRunDetail } from "@/services/api/workflow-runs";

import { workflowStageActions } from "./workflow-stage-actions";

export function useWorkflowStageActions(input: { detail: RemoteWorkflowRunDetail | null; refresh: () => void | Promise<void>; stageId: string }) {
    const { message } = App.useApp();
    const [busyAction, setBusyAction] = useState("");
    const stage = input.detail?.stages.find((item) => item.stageId === input.stageId) || null;
    const artifact = input.detail?.artifacts.find((item) => item.id === stage?.outputArtifactId) || null;
    const gate = input.detail?.gates.find((item) => item.artifactId === artifact?.id) || null;
    const actions = useMemo(() => workflowStageActions(stage ? { hasArtifact: Boolean(artifact), status: stage.status } : null, Boolean(gate?.passed)), [artifact, gate?.passed, stage]);

    const execute = async (key: string, action: () => Promise<unknown>, success: string) => {
        if (busyAction) return;
        setBusyAction(key);
        try {
            await action();
            message.success(success);
            await input.refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败，请重试");
        } finally {
            setBusyAction("");
        }
    };

    return {
        actions,
        approve: () => artifact && stage ? execute("approve", () => reviewWorkflowStage(stage.id, { artifactHash: artifact.contentHash, decision: "approved" }), "阶段产物已批准") : undefined,
        artifact,
        busyAction,
        cancel: () => stage ? execute("cancel", () => cancelWorkflowStage(stage.id), "已提交停止请求") : undefined,
        gate,
        reject: () => artifact && stage ? execute("reject", () => reviewWorkflowStage(stage.id, { artifactHash: artifact.contentHash, decision: "rejected", comment: "需要调整后重新生成" }), "已退回当前产物") : undefined,
        retry: () => stage ? execute("retry", () => retryWorkflowStage(stage.id, workflowActionKey(stage.workflowRunId, stage.stageId, stage.attempt + 1, "retry")), "已重新加入队列") : undefined,
        stage,
        start: () => input.detail ? execute("start", () => startWorkflowStage(input.detail!.run.id, input.stageId, workflowActionKey(input.detail!.run.id, input.stageId, (stage?.attempt || 0) + 1, "start")), "阶段已加入云端队列") : undefined,
    };
}

function workflowActionKey(runId: string, stageId: string, attempt: number, action: string) {
    return `workflow:${runId}:${stageId}:${action}:${attempt}`;
}
