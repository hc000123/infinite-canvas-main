"use client";

import { useRef, useState } from "react";

import { requestImageQuestion } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import { canInvokeAgentConfig, type AgentConfig, type AgentConfigKind } from "../../../../agent-settings";
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
    resolvedAgentConfigs: AgentConfig[];
    ensureWorkflowRun: (input: { projectId: string; canvasId?: string; episodeId: string; preset: AgentWorkflowPreset }) => string;
    episode: ScriptEpisode;
    episodeId: string;
    failWorkflowTextRun: (runId: string, reason: string) => void;
    interruptWorkflowStageRun: (workflowRunId: string, stageId: string, reason: string) => void;
    interruptWorkflowSceneRun: (workflowRunId: string, stageId: string, sceneKey: string, reason: string) => void;
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
    resolvedAgentConfigs,
    ensureWorkflowRun,
    episode,
    episodeId,
    failWorkflowTextRun,
    interruptWorkflowStageRun,
    interruptWorkflowSceneRun,
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
    const [runningStageDrafts, setRunningStageDrafts] = useState<Record<string, string>>({});
    const [runningSceneKeys, setRunningSceneKeys] = useState<Record<string, boolean>>({});
    const activeRunIdsRef = useRef<Record<string, string>>({});
    const canceledRunIdsRef = useRef<Record<string, boolean>>({});

    const executeWorkflowTextRun = async ({
        runKey,
        promptMessages,
        requestConfig,
        runId,
        stopRunning,
        successMessage,
        textModel,
    }: {
        runKey: string;
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
            const response = await requestImageQuestion(requestConfig, promptMessages, (streamed) => {
                const stageId = runKey.startsWith("stage:") ? runKey.slice("stage:".length) : "";
                if (stageId && activeRunIdsRef.current[runKey] === runId && !canceledRunIdsRef.current[runId]) {
                    setRunningStageDrafts((current) => ({ ...current, [stageId]: streamed }));
                }
            });
            const activeRunId = activeRunIdsRef.current[runKey];
            if (canceledRunIdsRef.current[runId] || (activeRunId && activeRunId !== runId)) return;
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(successMessage);
        } catch (error) {
            const activeRunId = activeRunIdsRef.current[runKey];
            if (canceledRunIdsRef.current[runId] || (activeRunId && activeRunId !== runId)) return;
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            message.warning(reason);
        } finally {
            if (activeRunIdsRef.current[runKey] === runId) delete activeRunIdsRef.current[runKey];
            delete canceledRunIdsRef.current[runId];
            if (runKey.startsWith("stage:")) {
                const stageId = runKey.slice("stage:".length);
                setRunningStageDrafts((current) => ({ ...current, [stageId]: "" }));
            }
            stopRunning();
        }
    };

    const cancelStage = (stageId: string) => {
        const runKey = `stage:${stageId}`;
        const runId = activeRunIdsRef.current[runKey];
        if (!runId) {
            const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
            if (workflowRun && stageState?.status === "running") {
                interruptWorkflowStageRun(workflowRun.id, stageId, "上一次运行已中断，可修改内容后重新发送。");
                setRunningStageIds((current) => ({ ...current, [stageId]: false }));
                setRunningStageDrafts((current) => ({ ...current, [stageId]: "" }));
                return message.warning("已清理上一次未结束的运行状态，可重新发送。");
            }
            return message.warning("当前阶段没有运行中的任务");
        }
        canceledRunIdsRef.current[runId] = true;
        delete activeRunIdsRef.current[runKey];
        failWorkflowTextRun(runId, "用户已取消本次运行，可修改内容后重新发送。");
        setRunningStageIds((current) => ({ ...current, [stageId]: false }));
        setRunningStageDrafts((current) => ({ ...current, [stageId]: "" }));
        message.warning("已取消本次运行；如果外部模型稍后返回，旧结果不会覆盖当前内容。");
    };

    const cancelStoryboardScene = () => {
        const runningScene = workflowRun?.sceneStates?.find((scene) => scene.stageId === "seedance-storyboard" && scene.status === "running");
        const targetScene = currentSceneState?.status === "running" ? currentSceneState : runningScene;
        const sceneKey = targetScene?.sceneKey || currentScene?.sceneKey || "";
        if (!sceneKey) return cancelStage("seedance-storyboard");
        const runKey = `scene:${sceneKey}`;
        const runId = activeRunIdsRef.current[runKey];
        if (!runId) {
            if (workflowRun && targetScene?.status === "running") {
                interruptWorkflowSceneRun(workflowRun.id, "seedance-storyboard", sceneKey, "上一次分镜场次运行已中断，可重新发送。");
                setRunningSceneKeys((current) => ({ ...current, [sceneKey]: false }));
                setRunningStageIds((current) => ({ ...current, "seedance-storyboard": false }));
                setRunningStageDrafts((current) => ({ ...current, "seedance-storyboard": "" }));
                return message.warning("已清理上一次未结束的分镜场次，可重新生成。");
            }
            return cancelStage("seedance-storyboard");
        }
        canceledRunIdsRef.current[runId] = true;
        delete activeRunIdsRef.current[runKey];
        failWorkflowTextRun(runId, "用户已取消本次分镜场次运行，可修改内容后重新发送。");
        setRunningSceneKeys((current) => ({ ...current, [sceneKey]: false }));
        message.warning("已取消当前分镜场次；如果外部模型稍后返回，旧结果不会覆盖当前内容。");
    };

    const runStage = async (stage: AgentWorkflowStage) => {
        if (!hasScript) {
            message.warning("请先导入本集剧本");
            return;
        }
        const workflowRunId = ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
        const currentRun = workflowRuns.find((run) => run.id === workflowRunId) || workflowRun;
        const stageState = currentRun?.stageStates.find((item) => item.stageId === stage.stageId);
        const allowBlockedStageRun = canRunBlockedEpisodeStage(stage.stageId, stageState, hasScript);
        if (stageState?.status === "blocked" && !allowBlockedStageRun) {
            message.warning(stageState.blockedReason || "前置阶段未批准");
            return;
        }
        const core = getSeedanceWorkflowAgentCore(stage.stageId);
        if (!core) return message.error("缺少当前阶段 Agent Core");
        const agentConfig = resolvedAgentConfigs.find((config) => config.kind === workflowStageAgentKind(stage.stageId));
        if (!agentConfig) return message.error("缺少当前阶段 Agent 设定");
        const callable = canInvokeAgentConfig(agentConfig);
        if (!callable.callable) return message.warning(callable.reason || "当前阶段 Agent 不可用");
        const { promptMessages, requestConfig, runInput, textModel } = buildEpisodeStageRunRequest({
            boundCanvas,
            core,
            effectiveConfig,
            episode,
            episodeId,
            agentConfig,
            preset,
            projectId,
            projectTitle,
            scriptSnapshot,
            stage,
            stageOutputs,
            workflowRunId,
        });
        if (allowBlockedStageRun) runInput.variables.allowBlockedStageRun = true;
        const runId = startWorkflowTextRun(runInput);
        const runKey = `stage:${stage.stageId}`;
        activeRunIdsRef.current[runKey] = runId;
        setRunningStageIds((current) => ({ ...current, [stage.stageId]: true }));
        setRunningStageDrafts((current) => ({ ...current, [stage.stageId]: "" }));
        await executeWorkflowTextRun({
            runKey,
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
        const agentConfig = resolvedAgentConfigs.find((config) => config.kind === workflowStageAgentKind(stage.stageId));
        if (!agentConfig) return message.error("缺少分镜阶段 Agent 设定");
        const callable = canInvokeAgentConfig(agentConfig);
        if (!callable.callable) return message.warning(callable.reason || "分镜阶段 Agent 不可用");
        const { promptMessages, requestConfig, runInput, textModel } = buildEpisodeStoryboardSceneRunRequest({
            boundCanvas,
            core,
            currentScene,
            currentSceneState,
            effectiveConfig,
            episode,
            episodeId,
            agentConfig,
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
        const runKey = `scene:${currentScene.sceneKey}`;
        activeRunIdsRef.current[runKey] = runId;
        setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: true }));
        await executeWorkflowTextRun({
            runKey,
            promptMessages,
            requestConfig,
            runId,
            stopRunning: () => setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: false })),
            successMessage: `${currentScene.sceneLabel} 草案已生成，待审核`,
            textModel,
        });
    };

    return { cancelStage, cancelStoryboardScene, runStage, runStoryboardScene, runningSceneKeys, runningStageDrafts, runningStageIds };
}

function workflowStageAgentKind(stageId: string): AgentConfigKind {
    if (stageId === "script-adaptation") return "script_optimizer";
    if (stageId === "director-analysis") return "script_analyzer";
    if (stageId === "art-design") return "asset_extractor";
    if (stageId === "seedance-storyboard") return "storyboard_director";
    return "script_analyzer";
}

function canRunBlockedEpisodeStage(stageId: string, stageState: AgentWorkflowRunRecord["stageStates"][number] | undefined, hasScript: boolean) {
    return Boolean(hasScript && stageId === "art-design" && stageState?.status === "blocked" && stageState.dependsOnStageIds.includes("director-analysis"));
}
