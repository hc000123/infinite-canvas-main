"use client";

import { useState } from "react";

import { requestImageQuestion } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import type { AgentWorkflowPreset, AgentWorkflowStage } from "../../../../agent-workflow-presets";
import type { AgentRunInput, AgentWorkflowRunRecord, AgentWorkflowSceneRunState, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import { getSeedanceWorkflowAgentCore } from "../../../../workflow-agents/seedance-workflow-agents";
import { buildEpisodeStageRunRequest, buildEpisodeStoryboardSceneRunRequest } from "./episode-workbench-run-input";
import type { EpisodeSceneOption } from "./use-episode-workbench-state";

type RunActionMessage = {
    error: (content: string) => void;
    success: (content: string) => void;
    warning: (content: string) => void;
};

type UseEpisodeWorkbenchRunActionsOptions = {
    boundCanvas?: CanvasProject;
    checkAiConfigReady: (config: AiConfig, model: string) => boolean;
    currentScene?: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    effectiveConfig: AiConfig;
    ensureWorkflowRun: (input: { projectId: string; canvasId?: string; episodeId: string; preset: AgentWorkflowPreset }) => string;
    episode: ScriptEpisode;
    episodeId: string;
    failWorkflowTextRun: (runId: string, reason: string) => void;
    hasScript: boolean;
    message: RunActionMessage;
    preset: AgentWorkflowPreset;
    projectId: string;
    projectTitle: string;
    scriptSnapshot: string;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    stages: AgentWorkflowStage[];
    startWorkflowTextRun: (input: AgentRunInput) => string;
    completeWorkflowTextRun: (runId: string, text: string) => void;
    workflowRun?: AgentWorkflowRunRecord;
    workflowRuns: AgentWorkflowRunRecord[];
};

export function useEpisodeWorkbenchRunActions({
    boundCanvas,
    checkAiConfigReady,
    currentScene,
    currentSceneState,
    effectiveConfig,
    ensureWorkflowRun,
    episode,
    episodeId,
    failWorkflowTextRun,
    hasScript,
    message,
    preset,
    projectId,
    projectTitle,
    scriptSnapshot,
    stageOutputs,
    stages,
    startWorkflowTextRun,
    completeWorkflowTextRun,
    workflowRun,
    workflowRuns,
}: UseEpisodeWorkbenchRunActionsOptions) {
    const [runningStageIds, setRunningStageIds] = useState<Record<string, boolean>>({});
    const [, setRunningSceneKeys] = useState<Record<string, boolean>>({});

    const executeWorkflowTextRun = async ({
        promptMessages,
        requestConfig,
        runId,
        stopRunning,
        successMessage,
        textModel,
    }: {
        promptMessages: NonNullable<AgentRunInput["promptMessages"]>;
        requestConfig: AiConfig;
        runId: string;
        stopRunning: () => void;
        successMessage: string;
        textModel: string;
    }) => {
        if (!textModel || !checkAiConfigReady(effectiveConfig, textModel)) {
            const reason = textModel ? "当前 API 配置或文本模型不可用" : "未配置文本模型";
            failWorkflowTextRun(runId, reason);
            stopRunning();
            return message.warning(reason);
        }
        try {
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(successMessage);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            message.warning(reason);
        } finally {
            stopRunning();
        }
    };

    const runStage = async (stage: AgentWorkflowStage) => {
        if (!hasScript) {
            message.warning("请先导入本集剧本");
            return;
        }
        const workflowRunId = ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
        const currentRun = workflowRuns.find((run) => run.id === workflowRunId) || workflowRun;
        const stageState = currentRun?.stageStates.find((item) => item.stageId === stage.stageId);
        if (stageState?.status === "blocked") {
            message.warning(stageState.blockedReason || "前置阶段未批准");
            return;
        }
        const core = getSeedanceWorkflowAgentCore(stage.stageId);
        if (!core) return message.error("缺少当前阶段 Agent Core");
        const { promptMessages, requestConfig, runInput, textModel } = buildEpisodeStageRunRequest({
            boundCanvas,
            core,
            effectiveConfig,
            episode,
            episodeId,
            preset,
            projectId,
            projectTitle,
            scriptSnapshot,
            stage,
            stageOutputs,
            workflowRunId,
        });
        const runId = startWorkflowTextRun(runInput);
        setRunningStageIds((current) => ({ ...current, [stage.stageId]: true }));
        await executeWorkflowTextRun({
            promptMessages,
            requestConfig,
            runId,
            stopRunning: () => setRunningStageIds((current) => ({ ...current, [stage.stageId]: false })),
            successMessage: `${stage.name} 草案已生成，待审核`,
            textModel,
        });
    };

    const runStoryboardScene = async () => {
        const stage = stages.find((item) => item.stageId === "seedance-storyboard");
        if (!stage) return;
        if (!hasScript) return message.warning("请先导入本集剧本");
        if (!currentScene) return message.warning("请先选择当前场次 / 子场次");
        const workflowRunId = ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
        const currentRun = workflowRuns.find((run) => run.id === workflowRunId) || workflowRun;
        const stageState = currentRun?.stageStates.find((item) => item.stageId === stage.stageId);
        if (stageState?.status === "blocked") return message.warning(stageState.blockedReason || "前置阶段未批准");
        const unfinishedScene = currentRun?.sceneStates?.find((scene) => scene.stageId === "seedance-storyboard" && scene.sceneKey !== currentScene.sceneKey && ["running", "review"].includes(scene.status));
        if (unfinishedScene) return message.warning(`请先完成当前场次审核：${unfinishedScene.sceneLabel}`);
        const core = getSeedanceWorkflowAgentCore(stage.stageId);
        if (!core) return message.error("缺少分镜师 Agent Core");
        const { promptMessages, requestConfig, runInput, textModel } = buildEpisodeStoryboardSceneRunRequest({
            boundCanvas,
            core,
            currentScene,
            currentSceneState,
            effectiveConfig,
            episode,
            episodeId,
            preset,
            projectId,
            projectTitle,
            scriptSnapshot,
            stage,
            stageOutputs,
            workflowRunId,
            workflowSceneStates: workflowRun?.sceneStates || [],
        });
        const runId = startWorkflowTextRun(runInput);
        setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: true }));
        await executeWorkflowTextRun({
            promptMessages,
            requestConfig,
            runId,
            stopRunning: () => setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: false })),
            successMessage: `${currentScene.sceneLabel} 草案已生成，待审核`,
            textModel,
        });
    };

    return { runStage, runStoryboardScene, runningStageIds };
}
