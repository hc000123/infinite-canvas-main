import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import { agentSystemPromptContent, fillAgentPromptTemplate, type AgentConfig } from "../../../../agent-settings";
import { workflowStageDetail, type AgentWorkflowPreset, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import type { AgentRunInput, AgentWorkflowSceneRunState, AgentWorkflowStageOutput, ChatCompletionMessage } from "../../../../agent-runner-types";
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

const STORYBOARD_PACKAGE_FORMAT_RULES = `分镜生产包硬规则：
1. 最终回复必须是 JSON 对象，顶层只包含 summary、sceneVisualDna、industrialPrecheckSummary、shots、warnings。
2. shots 必须是非空数组；每个条目必须包含 sceneName、title、scriptText、visualDescription、characters、shotSize、cameraMovement、action、emotion、dialogue、estimatedDuration、assetNeeds、seedancePrompt。
3. estimatedDuration 必须是 4-15 秒；如果当前场次过长，只输出本次可执行的前 1-4 个 P 包，不要整集一次性生成到底。
4. 不要先输出 Markdown 说明、规范读取长段落、合规高危词清单或解释性前言；所有审核说明压缩进 industrialPrecheckSummary 和 warnings。
5. 涉及敏感剧情时，只在 shot 字段里使用转译后的可拍画面语言，不复述原始高敏词，不展开敏感词列表。
6. seedancePrompt 是给 Seedance 的最终片段提示词正文，不出现“本P、单P、生成P、P间”等内部术语。`;

const FULL_WORKFLOW_FORMAT_RULES = `完整短剧工作流硬规则：
1. 这次不是单阶段任务，而是一次性完成导演分析、资产整理和分镜生产包。
2. 最终回复必须是 JSON 对象，不要 Markdown，不要代码围栏，不要解释文字。
3. 顶层只包含 directorAnalysis、assets、storyboard、warnings。
4. directorAnalysis 放导演讲戏、风险提示、场次理解、人物表演方向和分镜建议。
5. assets 必须是对象，内部包含 assets 数组；每个资产条目遵守资产卡片整理硬规则。
6. storyboard 必须是对象，内部包含 summary、sceneVisualDna、industrialPrecheckSummary、shots、warnings；shots 遵守分镜生产包硬规则。
7. 允许一次性处理本集所有关键场次，但每个 shots 条目仍然代表一个 4-15 秒的可生成片段。
8. 涉及敏感剧情时，只输出转译后的可拍画面语言，不复述高敏词清单。`;

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

export function buildEpisodeFullWorkflowRunRequest({
    effectiveConfig,
    episode,
    projectTitle,
    resolvedAgentConfigs,
    scriptSnapshot,
}: {
    effectiveConfig: AiConfig;
    episode: ScriptEpisode;
    projectTitle: string;
    resolvedAgentConfigs: AgentConfig[];
    scriptSnapshot: string;
}) {
    const directorConfig = resolvedAgentConfigs.find((config) => config.kind === "script_analyzer");
    const assetConfig = resolvedAgentConfigs.find((config) => config.kind === "asset_extractor");
    const storyboardConfig = resolvedAgentConfigs.find((config) => config.kind === "storyboard_director");
    const textModel = workflowTextModel(effectiveConfig, storyboardConfig || directorConfig || assetConfig);
    const requestConfig = { ...effectiveConfig, model: textModel || effectiveConfig.model };
    const agentRules = [
        directorConfig ? `导演分析 Agent：\n${agentSystemPromptContent(directorConfig)}` : "",
        assetConfig ? `资产整理 Agent：\n${agentSystemPromptContent(assetConfig)}` : "",
        storyboardConfig ? `分镜生产 Agent：\n${agentSystemPromptContent(storyboardConfig)}` : "",
    ]
        .filter(Boolean)
        .join("\n\n");
    const promptMessages: ChatCompletionMessage[] = [
        {
            role: "system",
            content: [
                "你是短剧生产多 Agent 总控。你要在一次回复里模拟导演、服化道/资产整理、Seedance 分镜三个 Agent 协作完成完整工作流。",
                "只返回最终 JSON，不要输出过程日志。",
                agentRules,
                ASSET_CARD_FORMAT_RULES,
                STORYBOARD_PACKAGE_FORMAT_RULES,
                FULL_WORKFLOW_FORMAT_RULES,
            ]
                .filter(Boolean)
                .join("\n\n"),
        },
        {
            role: "user",
            content: [
                `项目：${projectTitle || "未命名项目"}`,
                `本集：第 ${episode.order} 集 ${episode.title}`,
                "本集剧本与结构化剧本：",
                scriptSnapshot,
                "",
                FULL_WORKFLOW_FORMAT_RULES,
            ].join("\n"),
        },
    ];
    return { promptMessages, requestConfig, textModel };
}

export function buildEpisodeDistributedWorkflowRunInput({
    boundCanvas,
    effectiveConfig,
    episode,
    preset,
    projectId,
    scriptSnapshot,
    stage,
    textModel,
    workflowRunId,
}: {
    boundCanvas?: CanvasProject;
    effectiveConfig: AiConfig;
    episode: ScriptEpisode;
    preset: AgentWorkflowPreset;
    projectId: string;
    scriptSnapshot: string;
    stage: AgentWorkflowStage;
    textModel: string;
    workflowRunId: string;
}): AgentRunInput {
    const stageDetail = workflowStageDetail(preset, stage);
    const sourceFiles = buildWorkflowStageSourceFiles(stageDetail.skills, stageDetail.qualityGates);
    return {
        projectId,
        canvasId: boundCanvas?.id,
        episodeId: episode.id,
        episodeTitle: episode.title,
        scriptId: projectId,
        scriptSnapshot,
        sourceType: "episode_full_workflow",
        sourceId: stage.stageId,
        variables: { stageId: stage.stageId, fullWorkflow: true, allowBlockedStageRun: true },
        workflowRunId,
        workflowId: preset.workflowId,
        workflowVersion: preset.version,
        stageId: stage.stageId,
        agentId: stage.agentId,
        agentName: stageDetail.agent?.name || stage.name,
        sourcePresetId: preset.workflowId,
        presetId: preset.workflowId,
        inputSnapshot: { stageName: stage.name, stageSummary: stage.inputSummary, fullWorkflow: true },
        model: textModel,
        provider: "openai-remote",
        configSummary: workflowConfigSummary(textModel, effectiveConfig),
        sourceFiles,
        qualityGateIds: stageDetail.qualityGates.map((gate) => gate.gateId),
    };
}

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
    const formatRules = agentConfig.kind === "asset_extractor" ? ASSET_CARD_FORMAT_RULES : agentConfig.kind === "storyboard_director" ? STORYBOARD_PACKAGE_FORMAT_RULES : "";
    const systemContent = formatRules ? `${agentSystemPromptContent(agentConfig)}\n\n${formatRules}` : agentSystemPromptContent(agentConfig);
    const userContent = fillAgentPromptTemplate(agentConfig.userPromptTemplate, snapshot || {});
    return [
        { role: "system" as const, content: systemContent },
        { role: "user" as const, content: formatRules ? `${userContent}\n\n${formatRules}` : userContent },
    ];
}
