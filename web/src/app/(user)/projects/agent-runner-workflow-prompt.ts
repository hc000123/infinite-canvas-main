import type { AgentWorkflowAgent, AgentWorkflowQualityGate, AgentWorkflowSkill, AgentWorkflowStage } from "./agent-workflow-presets";
import type { AgentRunInput, ChatCompletionMessage, WorkflowTextRunOutput } from "./agent-runner-types.ts";
import { normalizeStringList, summarizeWorkflowTextOutput, tryParseTextOutput } from "./agent-runner-text-utils.ts";

export type { ChatCompletionMessage };

export type WorkflowStagePromptContext = {
    projectId?: string;
    projectTitle?: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptSnapshot?: string;
    stageSummary?: string;
    sceneSummary?: string;
    sceneKey?: string;
    sceneLabel?: string;
    sceneScriptText?: string;
    sceneVisualDnaSummary?: string;
    previousSceneSummary?: string;
    directorOutputSummary?: string;
    artDesignOutputSummary?: string;
    storyboardRequirement?: string;
    assetNeedSummary?: string;
};

export type WorkflowStagePromptBuildInput = {
    workflowId: string;
    workflowVersion: string;
    stage: AgentWorkflowStage;
    agent: AgentWorkflowAgent;
    skills: AgentWorkflowSkill[];
    qualityGates: AgentWorkflowQualityGate[];
    inputSnapshot?: WorkflowStagePromptContext;
};

export function buildWorkflowStageSourceFiles(skills: AgentWorkflowSkill[], qualityGates: AgentWorkflowQualityGate[]): string[] {
    const sourceFiles: string[] = [];
    for (const skill of skills) {
        for (const sourceFile of skill.sourceFiles) {
            if (!sourceFiles.includes(sourceFile.path)) sourceFiles.push(sourceFile.path);
        }
    }
    for (const gate of qualityGates) {
        for (const sourceFile of gate.sourceFiles) {
            if (!sourceFiles.includes(sourceFile.path)) sourceFiles.push(sourceFile.path);
        }
    }
    return sourceFiles;
}

export function buildWorkflowStagePrompt({ workflowId, workflowVersion, stage, agent, skills, qualityGates, inputSnapshot }: WorkflowStagePromptBuildInput) {
    const sourceFiles = buildWorkflowStageSourceFiles(skills, qualityGates);
    const sceneRequirement =
        stage.stageId === "seedance-storyboard"
            ? [
                  "",
                  "阶段三场次推进要求：本次只能处理当前场次 / 子场次，不得整集一次性生成到底。",
                  "输出必须包含：场次视觉 DNA、生成 P / 镜头 P 拆分表摘要、单 P 任务卡 / Seedance 提示词正文、工业化预检记录摘要。",
                  "请优先输出 JSON 字段：summary、sceneVisualDna、promptPlanSummary、singlePTaskCards 或 seedancePrompts、industrialPrecheckSummary、items。",
              ]
            : [];
    return [
        `你正在执行 Seedance 工作流的文本阶段草案生成任务。请仅返回文本草案，不调用图片/视频生成接口，不触发扣费。`,
        `workflowId: ${workflowId}`,
        `workflowVersion: ${workflowVersion}`,
        `stageId: ${stage.stageId}`,
        `stageName: ${stage.name}`,
        `agentId: ${agent.agentId}`,
        `agentName: ${agent.name}`,
        `stagePurpose: ${stage.purpose}`,
        `outputSummary: ${stage.outputSummary}`,
        `agentRole: ${agent.role}`,
        `agentResponsibility: ${agent.responsibility}`,
        `agentSystemPromptSummary: ${agent.systemPromptSummary}`,
        `skills: ${skills.map((skill) => `${skill.name}（${skill.purpose}）`).join("；")}`,
        `qualityGates: ${qualityGates.map((gate) => `${gate.name}（${gate.summary}）`).join("；")}`,
        `sourceFiles: ${sourceFiles.join("；") || "（无）"}`,
        "",
        `最小上下文：${buildWorkflowStageContextLines(inputSnapshot, agent.agentId, stage.stageId).join("；")}`,
        ...sceneRequirement,
        "",
        `要求：输出可读、可审核的文本草案，并在必要处给出校验建议。若你能输出 JSON，请将结果放在 JSON 里；若不适配，可输出纯文本，但必须完整可读。`,
    ].join("\n");
}

export function buildWorkflowStagePromptMessages(params: WorkflowStagePromptBuildInput): ChatCompletionMessage[] {
    return [
        { role: "system", content: "你是 Seedance workflow 阶段文本助手，只输出可人工审核的文本产物。" },
        { role: "user", content: buildWorkflowStagePrompt(params) },
    ];
}

export function buildWorkflowTextRunOutput(input: AgentRunInput, rawText: string, now: string): WorkflowTextRunOutput {
    const parsed = tryParseTextOutput(rawText);
    return {
        rawText,
        summary: summarizeWorkflowTextOutput(parsed.value, rawText),
        structuredOutput: parsed.value,
        outputFormat: parsed.format,
        stageId: input.stageId || "",
        agentId: input.agentId || "",
        workflowId: input.workflowId || input.sourcePresetId || input.presetId || "workflow",
        sourceFiles: normalizeStringList(input.sourceFiles),
        qualityGateIds: normalizeStringList(input.qualityGateIds),
        createdAt: now,
    };
}

function buildWorkflowStageContextLines(snapshot: WorkflowStagePromptContext | undefined, agentId: string, stageId: string) {
    if (!snapshot) return ["（未提供上下文）"];
    const lines: string[] = [];
    if (snapshot.projectTitle) lines.push(`项目：${snapshot.projectTitle}`);
    if (snapshot.episodeTitle) lines.push(`本集：${snapshot.episodeTitle}`);
    if (snapshot.scriptSnapshot) lines.push(`剧本：${snapshot.scriptSnapshot}`);
    if (snapshot.stageSummary) lines.push(`阶段输入摘要：${snapshot.stageSummary}`);

    if (agentId === "director" || stageId === "director-analysis") {
        if (snapshot.sceneSummary) lines.push(`场次摘要：${snapshot.sceneSummary}`);
        return lines.length ? lines : ["未提供项目/剧本/场次上下文"];
    }
    if (agentId === "art-designer" || stageId === "art-design") {
        if (snapshot.directorOutputSummary) lines.push(`导演产物摘要：${snapshot.directorOutputSummary}`);
        if (snapshot.assetNeedSummary) lines.push(`本集资产需求摘要：${snapshot.assetNeedSummary}`);
        return lines.length ? lines : ["未提供导演产物摘要 / 资产需求"];
    }
    if (agentId === "storyboard-artist" || stageId === "seedance-storyboard") {
        if (snapshot.sceneKey || snapshot.sceneLabel) lines.push(`当前场次 / 子场次：${[snapshot.sceneKey, snapshot.sceneLabel].filter(Boolean).join(" · ")}`);
        if (snapshot.sceneScriptText) lines.push(`当前场次剧本片段：${snapshot.sceneScriptText}`);
        if (snapshot.sceneVisualDnaSummary) lines.push(`当前场次已有视觉 DNA：${snapshot.sceneVisualDnaSummary}`);
        if (snapshot.previousSceneSummary) lines.push(`前序衔接状态：${snapshot.previousSceneSummary}`);
        if (snapshot.directorOutputSummary) lines.push(`导演产物摘要：${snapshot.directorOutputSummary}`);
        if (snapshot.artDesignOutputSummary) lines.push(`服化道产物摘要：${snapshot.artDesignOutputSummary}`);
        if (snapshot.storyboardRequirement) lines.push(`分镜输出要求：${snapshot.storyboardRequirement}`);
        return lines.length ? lines : ["未提供导演 / 服化道产物及要求"];
    }
    return lines.length ? lines : ["未提供阶段上下文"];
}
