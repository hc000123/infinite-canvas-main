"use client";

import { useState } from "react";

import { requestImageQuestion } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import { workflowStageDetail, type AgentWorkflowPreset, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import {
    buildWorkflowStageSourceFiles,
    type AgentRunInput,
    type AgentWorkflowRunRecord,
    type AgentWorkflowSceneRunState,
    type AgentWorkflowStageOutput,
} from "../../../../agent-runner";
import { getSeedanceWorkflowAgentCore } from "../../../../workflow-agents/seedance-workflow-agents";
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
        const textModel = (effectiveConfig.textModel || effectiveConfig.model || "").trim();
        const requestConfig = { ...effectiveConfig, model: textModel || effectiveConfig.model };
        const directorSummary = stageOutputs["director-analysis"]?.summary || "";
        const artSummary = stageOutputs["art-design"]?.summary || "";
        const coreInput = core.buildInput({
            preset,
            inputSnapshot: {
                projectId,
                projectTitle,
                canvasId: boundCanvas?.id,
                episodeId,
                episodeTitle: episode.title,
                scriptSnapshot,
                stageSummary: `${stage.inputSummary}；输出目标：${stage.outputSummary}`,
                directorOutputSummary: directorSummary,
                artDesignOutputSummary: artSummary,
                storyboardRequirement:
                    stage.qualityGateIds
                        .map((gateId) => preset.qualityGates.find((gate) => gate.gateId === gateId)?.purpose)
                        .filter(Boolean)
                        .join("；") || stage.outputSummary,
                assetNeedSummary: artSummary,
            },
        });
        const sourceFiles = buildWorkflowStageSourceFiles(coreInput.skills, coreInput.qualityGates);
        const promptMessages = core.buildPromptMessages(coreInput, preset);
        const runInput: AgentRunInput = {
            projectId,
            canvasId: boundCanvas?.id,
            episodeId,
            episodeTitle: episode.title,
            scriptId: projectId,
            scriptSnapshot,
            sourceType: "episode_production_workbench",
            sourceId: stage.stageId,
            variables: { stageId: stage.stageId },
            workflowRunId,
            workflowId: preset.workflowId,
            workflowVersion: preset.version,
            stageId: core.stageId,
            agentId: core.agentId,
            agentName: coreInput.agent.name,
            sourcePresetId: preset.workflowId,
            presetId: preset.workflowId,
            inputSnapshot: { stageName: stage.name, stageSummary: stage.inputSummary },
            promptMessages,
            model: textModel,
            provider: "openai-remote",
            configSummary: JSON.stringify({ model: textModel, channelMode: "remote", textModelList: effectiveConfig.textModels, provider: "openai-remote" }, null, 2),
            sourceFiles,
            qualityGateIds: coreInput.qualityGates.map((gate) => gate.gateId),
        };
        const runId = startWorkflowTextRun(runInput);
        setRunningStageIds((current) => ({ ...current, [stage.stageId]: true }));
        if (!textModel || !checkAiConfigReady(effectiveConfig, textModel)) {
            const reason = textModel ? "当前 API 配置或文本模型不可用" : "未配置文本模型";
            failWorkflowTextRun(runId, reason);
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
            return message.warning(reason);
        }
        try {
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(`${stage.name} 草案已生成，待审核`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            message.warning(reason);
        } finally {
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
        }
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
        const textModel = (effectiveConfig.textModel || effectiveConfig.model || "").trim();
        const requestConfig = { ...effectiveConfig, model: textModel || effectiveConfig.model };
        const directorSummary = stageOutputs["director-analysis"]?.summary || "";
        const artSummary = stageOutputs["art-design"]?.summary || "";
        const sourceFiles = buildWorkflowStageSourceFiles(workflowStageDetail(preset, stage).skills, workflowStageDetail(preset, stage).qualityGates);
        const coreInput = core.buildInput({
            preset,
            inputSnapshot: {
                projectId,
                projectTitle,
                canvasId: boundCanvas?.id,
                episodeId,
                episodeTitle: episode.title,
                scriptSnapshot,
                stageSummary: "阶段三按场次 / 子场次推进；本次只处理当前选中场次。",
                sceneKey: currentScene.sceneKey,
                sceneLabel: currentScene.sceneLabel,
                sceneScriptText: currentScene.scriptText,
                sceneVisualDnaSummary: currentSceneState?.visualDnaSummary,
                previousSceneSummary: previousApprovedSceneSummary(workflowRun?.sceneStates || [], currentScene.sceneKey),
                directorOutputSummary: directorSummary,
                artDesignOutputSummary: artSummary,
                storyboardRequirement: "先输出场次视觉 DNA，再输出生成 P / 镜头 P 拆分表、单 P 任务卡、Seedance 提示词正文和工业化预检记录摘要。",
                assetNeedSummary: artSummary,
            },
        });
        const promptMessages = core.buildPromptMessages(coreInput, preset);
        const runInput: AgentRunInput = {
            projectId,
            canvasId: boundCanvas?.id,
            episodeId,
            episodeTitle: episode.title,
            scriptId: projectId,
            scriptSnapshot: currentScene.scriptText || scriptSnapshot,
            sourceType: "episode_production_workbench_scene",
            sourceId: currentScene.sceneKey,
            variables: { stageId: stage.stageId, sceneKey: currentScene.sceneKey, sceneLabel: currentScene.sceneLabel },
            workflowRunId,
            workflowId: preset.workflowId,
            workflowVersion: preset.version,
            stageId: core.stageId,
            agentId: core.agentId,
            agentName: coreInput.agent.name,
            sourcePresetId: preset.workflowId,
            presetId: preset.workflowId,
            inputSnapshot: { stageName: stage.name, sceneKey: currentScene.sceneKey, sceneLabel: currentScene.sceneLabel },
            promptMessages,
            model: textModel,
            provider: "openai-remote",
            configSummary: JSON.stringify({ model: textModel, channelMode: "remote", textModelList: effectiveConfig.textModels, provider: "openai-remote" }, null, 2),
            sourceFiles,
            qualityGateIds: coreInput.qualityGates.map((gate) => gate.gateId),
        };
        const runId = startWorkflowTextRun(runInput);
        setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: true }));
        if (!textModel || !checkAiConfigReady(effectiveConfig, textModel)) {
            const reason = textModel ? "当前 API 配置或文本模型不可用" : "未配置文本模型";
            failWorkflowTextRun(runId, reason);
            setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: false }));
            return message.warning(reason);
        }
        try {
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(`${currentScene.sceneLabel} 草案已生成，待审核`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            message.warning(reason);
        } finally {
            setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: false }));
        }
    };

    return { runStage, runStoryboardScene, runningStageIds };
}

function previousApprovedSceneSummary(sceneStates: AgentWorkflowSceneRunState[], sceneKey: string) {
    const index = sceneStates.findIndex((scene) => scene.sceneKey === sceneKey);
    const previous =
        index > 0
            ? sceneStates
                  .slice(0, index)
                  .reverse()
                  .find((scene) => scene.status === "approved")
            : undefined;
    return previous ? `${previous.sceneLabel}：${previous.promptTextSummary || previous.promptPlanSummary || "已批准"}` : "";
}
