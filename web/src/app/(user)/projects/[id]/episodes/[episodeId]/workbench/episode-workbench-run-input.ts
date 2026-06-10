import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import { workflowStageDetail, type AgentWorkflowPreset, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import type { AgentRunInput, AgentWorkflowSceneRunState, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import { buildWorkflowStageSourceFiles } from "../../../../agent-runner-workflow-prompt";
import type { WorkflowAgentCore } from "../../../../workflow-agents/workflow-agent-core";
import type { EpisodeSceneOption } from "./use-episode-workbench-state";

type BaseRunRequestInput = {
    boundCanvas?: CanvasProject;
    core: WorkflowAgentCore;
    effectiveConfig: AiConfig;
    episode: ScriptEpisode;
    episodeId: string;
    preset: AgentWorkflowPreset;
    projectId: string;
    projectTitle: string;
    scriptSnapshot: string;
    stage: AgentWorkflowStage;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRunId: string;
};

export function buildEpisodeStageRunRequest({
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
}: BaseRunRequestInput) {
    const textModel = workflowTextModel(effectiveConfig);
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
        configSummary: workflowConfigSummary(textModel, effectiveConfig),
        sourceFiles,
        qualityGateIds: coreInput.qualityGates.map((gate) => gate.gateId),
    };
    return { promptMessages, requestConfig, runInput, textModel };
}

export function buildEpisodeStoryboardSceneRunRequest({
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
    workflowSceneStates,
}: BaseRunRequestInput & {
    currentScene: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    workflowSceneStates: AgentWorkflowSceneRunState[];
}) {
    const textModel = workflowTextModel(effectiveConfig);
    const requestConfig = { ...effectiveConfig, model: textModel || effectiveConfig.model };
    const directorSummary = stageOutputs["director-analysis"]?.summary || "";
    const artSummary = stageOutputs["art-design"]?.summary || "";
    const stageDetail = workflowStageDetail(preset, stage);
    const sourceFiles = buildWorkflowStageSourceFiles(stageDetail.skills, stageDetail.qualityGates);
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
            previousSceneSummary: previousApprovedSceneSummary(workflowSceneStates, currentScene.sceneKey),
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
        configSummary: workflowConfigSummary(textModel, effectiveConfig),
        sourceFiles,
        qualityGateIds: coreInput.qualityGates.map((gate) => gate.gateId),
    };
    return { promptMessages, requestConfig, runInput, textModel };
}

function workflowTextModel(config: AiConfig) {
    return (config.textModel || config.model || "").trim();
}

function workflowConfigSummary(textModel: string, config: AiConfig) {
    return JSON.stringify({ model: textModel, channelMode: "remote", textModelList: config.textModels, provider: "openai-remote" }, null, 2);
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
