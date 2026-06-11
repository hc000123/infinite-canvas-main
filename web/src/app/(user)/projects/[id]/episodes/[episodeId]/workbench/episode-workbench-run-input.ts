import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import { agentSystemPromptContent, fillAgentPromptTemplate, type AgentConfig } from "../../../../agent-settings";
import { workflowStageDetail, type AgentWorkflowPreset, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import type { AgentRunInput, AgentWorkflowSceneRunState, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import { buildWorkflowStageSourceFiles } from "../../../../agent-runner-workflow-prompt";
import type { WorkflowAgentCore } from "../../../../workflow-agents/workflow-agent-core";
import type { EpisodeSceneOption } from "./use-episode-workbench-state";

const ASSET_CARD_FORMAT_RULES = `资产卡片整理硬规则：
1. 输出必须是 JSON 对象，顶层只包含 assets 数组。
2. 每个 assets 条目必须包含 kind、name、usage、description、prompt、sourceText、tags、needsImage、needsWhitelisting、riskNotes。
3. kind 只能是 character / scene / prop / costume；场记、地点、空间、环境归 scene；服装、妆发、发型归 costume。
4. name 只能是短名称，不能是提示词、长句、剧情摘要或“这是一份基于……”这类说明。
5. description 写单一资产的视觉描述，prompt 写单一资产的生图提示词，sourceText 写来源依据，三者不能混在一起。
6. 只要剧本里出现地点、空间或场记，就必须输出至少一条 scene 资产。`;

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
    agentConfig?: AgentConfig;
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
    agentConfig,
    stageOutputs,
    workflowRunId,
}: BaseRunRequestInput) {
    const textModel = workflowTextModel(effectiveConfig, agentConfig);
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
    const promptMessages = agentConfig ? buildConfiguredAgentPromptMessages(agentConfig, coreInput.inputSnapshot) : core.buildPromptMessages(coreInput, preset);
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
        agentName: agentConfig?.name || coreInput.agent.name,
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
    agentConfig,
    stageOutputs,
    workflowRunId,
    workflowSceneStates,
}: BaseRunRequestInput & {
    currentScene: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    workflowSceneStates: AgentWorkflowSceneRunState[];
}) {
    const textModel = workflowTextModel(effectiveConfig, agentConfig);
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
    const promptMessages = agentConfig ? buildConfiguredAgentPromptMessages(agentConfig, coreInput.inputSnapshot) : core.buildPromptMessages(coreInput, preset);
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
        agentName: agentConfig?.name || coreInput.agent.name,
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

function workflowTextModel(config: AiConfig, agentConfig?: AgentConfig) {
    const preferredModel = agentConfig?.modelPreference.trim();
    return (preferredModel && preferredModel !== "default" ? preferredModel : config.textModel || config.model || "").trim();
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

function buildConfiguredAgentPromptMessages(agentConfig: AgentConfig, snapshot: Record<string, unknown> | undefined) {
    const systemContent = agentConfig.kind === "asset_extractor" ? `${agentSystemPromptContent(agentConfig)}\n\n${ASSET_CARD_FORMAT_RULES}` : agentSystemPromptContent(agentConfig);
    const userContent = fillAgentPromptTemplate(agentConfig.userPromptTemplate, snapshot || {});
    return [
        { role: "system" as const, content: systemContent },
        { role: "user" as const, content: agentConfig.kind === "asset_extractor" ? `${userContent}\n\n${ASSET_CARD_FORMAT_RULES}` : userContent },
    ];
}
