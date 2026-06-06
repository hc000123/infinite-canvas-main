import { canInvokeAgentConfig, normalizeAgentConfig, type AgentConfig, type AgentConfigKind } from "./agent-settings.ts";
import type { AgentWorkflowAgent, AgentWorkflowPreset, AgentWorkflowQualityGate, AgentWorkflowSkill, AgentWorkflowStage } from "./agent-workflow-presets";

export type AgentRunStatus = "draft" | "ready_for_review" | "running" | "review" | "approved" | "rejected" | "applied" | "error" | "failed";
export type AgentRunKind = AgentConfigKind | "workflow_text";

export type WorkflowTextOutputFormat = "json" | "text";

export type WorkflowTextRunOutput = {
    rawText: string;
    summary: string;
    structuredOutput?: unknown;
    outputFormat: WorkflowTextOutputFormat;
    stageId: string;
    agentId: string;
    workflowId: string;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
};

export type WorkflowStagePromptContext = {
    projectId?: string;
    projectTitle?: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptSnapshot?: string;
    stageSummary?: string;
    sceneSummary?: string;
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

export type AgentRunInput = {
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptId?: string;
    scriptSnapshot?: string;
    sourceType: string;
    sourceId?: string;
    variables: Record<string, unknown>;
    workflowRunId?: string;
    workflowId?: string;
    workflowVersion?: string;
    stageId?: string;
    agentId?: string;
    agentName?: string;
    sourcePresetId?: string;
    presetId?: string;
    inputSnapshot?: Record<string, unknown>;
    promptMessages?: ChatCompletionMessage[];
    model?: string;
    provider?: string;
    configSummary?: string;
    sourceFiles?: string[];
    qualityGateIds?: string[];
};

export type AgentDraftOutput = {
    summary: string;
    items: unknown[];
    rawJson: unknown;
    warnings: string[];
    schemaVersion: string;
};

export type AgentRunProposedAction = {
    type: string;
    title: string;
    targetRefs: Array<{
        kind: string;
        id: string;
        label?: string;
    }>;
    payload: unknown;
    requiresConfirmation: boolean;
};

export type AgentRunRecord = {
    id: string;
    agentKind: AgentRunKind;
    agentConfigId: string;
    agentConfigVersion: string;
    status: AgentRunStatus;
    input: AgentRunInput;
    draftOutput: AgentDraftOutput;
    proposedActions: AgentRunProposedAction[];
    approvedAt?: string;
    appliedAt?: string;
    rejectedAt?: string;
    errorMessage?: string;
    workflowTextOutput?: WorkflowTextRunOutput;
    createdAt: string;
    updatedAt: string;
};

export type AgentWorkflowStageStatus = "idle" | "running" | "review" | "approved" | "rejected" | "error" | "blocked";

export type AgentWorkflowStageState = {
    stageId: string;
    agentId: string;
    status: AgentWorkflowStageStatus;
    runnerRunId?: string;
    outputId?: string;
    approvedAt?: string;
    rejectedAt?: string;
    errorMessage?: string;
    evidenceIds: string[];
    dependsOnStageIds: string[];
    blockedReason?: string;
};

export type AgentWorkflowRunRecord = {
    id: string;
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    workflowId: string;
    workflowVersion: string;
    presetId: string;
    currentStageId: string;
    stageStates: AgentWorkflowStageState[];
    createdAt: string;
    updatedAt: string;
};

export type AgentWorkflowStageOutput = {
    outputId: string;
    workflowRunId: string;
    stageId: string;
    runnerRunId: string;
    rawText: string;
    summary: string;
    structuredOutput?: unknown;
    outputFormat: WorkflowTextOutputFormat;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

export type AgentWorkflowReviewEvidence = {
    evidenceId: string;
    projectId: string;
    workflowRunId: string;
    stageId: string;
    runnerRunId: string;
    decision: "approved" | "rejected";
    reviewer: string;
    reviewerNote?: string;
    outputSummary: string;
    outputHash: string;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

export function createAgentRunRecord({ config, input, id, now, draftOutput }: { config: AgentConfig; input: AgentRunInput; id: string; now: string; draftOutput?: unknown }): AgentRunRecord {
    const normalizedConfig = normalizeAgentConfig(config);
    const callable = canInvokeAgentConfig(normalizedConfig);
    if (!callable.callable) throw new Error(callable.reason || "Agent 配置不可用");
    const output = normalizeAgentDraftOutput(draftOutput || { summary: "已创建 Agent 运行记录，等待草案输出。", items: [], warnings: [] });
    return {
        id,
        agentKind: normalizedConfig.kind,
        agentConfigId: normalizedConfig.id,
        agentConfigVersion: normalizedConfig.version,
        status: output.items.length || output.summary ? "ready_for_review" : "draft",
        input,
        draftOutput: output,
        proposedActions: buildAgentRunProposedActions(normalizedConfig.kind, output),
        createdAt: now,
        updatedAt: now,
    };
}

export function createWorkflowTextRunRecord({ input, id, now }: { input: AgentRunInput; id: string; now: string }): AgentRunRecord {
    const normalizedInput = normalizeWorkflowRunInput(input);
    return {
        id,
        agentKind: "workflow_text",
        agentConfigId: normalizedInput.sourcePresetId || normalizedInput.workflowId || "workflow-text-runner",
        agentConfigVersion: normalizedInput.workflowVersion || "1.0.0",
        status: "running",
        input: normalizedInput,
        draftOutput: normalizeAgentDraftOutput({ summary: "workflow 阶段文本执行中...", items: [], warnings: ["执行开始，等待 LLM 返回文本。"] }),
        proposedActions: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function createAgentWorkflowRunRecord({ preset, projectId, canvasId, episodeId, id, now }: { preset: AgentWorkflowPreset; projectId: string; canvasId?: string; episodeId?: string; id: string; now: string }): AgentWorkflowRunRecord {
    const stages = orderedWorkflowPresetStages(preset);
    const firstStageId = stages[0]?.stageId || "";
    return refreshWorkflowStageBlocks(
        {
            id,
            projectId,
            canvasId,
            episodeId,
            workflowId: preset.workflowId,
            workflowVersion: preset.version,
            presetId: preset.workflowId,
            currentStageId: firstStageId,
            stageStates: stages.map((stage, index) => ({
                stageId: stage.stageId,
                agentId: stage.agentId,
                status: index === 0 ? "idle" : "blocked",
                evidenceIds: [],
                dependsOnStageIds: index === 0 ? [] : [stages[index - 1].stageId],
                blockedReason: index === 0 ? undefined : `需先批准前置阶段：${stages[index - 1].name}`,
            })),
            createdAt: now,
            updatedAt: now,
        },
        now,
    );
}

export function startAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, stageId: string, runnerRunId: string, now: string): AgentWorkflowRunRecord {
    const checked = refreshWorkflowStageBlocks(workflowRun, now);
    const stageState = checked.stageStates.find((stage) => stage.stageId === stageId);
    if (!stageState || stageState.status === "blocked") return checked;
    return {
        ...checked,
        currentStageId: stageId,
        stageStates: checked.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "running", runnerRunId, errorMessage: undefined, blockedReason: undefined } : stage)),
        updatedAt: now,
    };
}

export function buildAgentWorkflowStageOutput({ workflowRunId, runnerRun, outputId, now }: { workflowRunId: string; runnerRun: AgentRunRecord; outputId: string; now: string }): AgentWorkflowStageOutput | undefined {
    if (!runnerRun.workflowTextOutput || !runnerRun.input.stageId) return undefined;
    return {
        outputId,
        workflowRunId,
        stageId: runnerRun.input.stageId,
        runnerRunId: runnerRun.id,
        rawText: runnerRun.workflowTextOutput.rawText,
        summary: runnerRun.workflowTextOutput.summary,
        structuredOutput: runnerRun.workflowTextOutput.structuredOutput,
        outputFormat: runnerRun.workflowTextOutput.outputFormat,
        sourceFiles: runnerRun.workflowTextOutput.sourceFiles,
        qualityGateIds: runnerRun.workflowTextOutput.qualityGateIds,
        createdAt: now,
    };
}

export function completeAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, output: AgentWorkflowStageOutput, now: string): AgentWorkflowRunRecord {
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: output.stageId,
            stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === output.stageId ? { ...stage, status: "review", runnerRunId: output.runnerRunId, outputId: output.outputId, errorMessage: undefined, blockedReason: undefined } : stage)),
            updatedAt: now,
        },
        now,
    );
}

export function failAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, stageId: string, runnerRunId: string, errorMessage: string, now: string): AgentWorkflowRunRecord {
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: stageId,
            stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "error", runnerRunId, errorMessage, blockedReason: undefined } : stage)),
            updatedAt: now,
        },
        now,
    );
}

export function buildAgentWorkflowReviewEvidence({
    workflowRun,
    runnerRun,
    evidenceId,
    decision,
    reviewerNote,
    now,
}: {
    workflowRun: AgentWorkflowRunRecord;
    runnerRun: AgentRunRecord;
    evidenceId: string;
    decision: "approved" | "rejected";
    reviewerNote?: string;
    now: string;
}): AgentWorkflowReviewEvidence | undefined {
    if (!runnerRun.input.stageId || !runnerRun.workflowTextOutput) return undefined;
    return {
        evidenceId,
        projectId: workflowRun.projectId,
        workflowRunId: workflowRun.id,
        stageId: runnerRun.input.stageId,
        runnerRunId: runnerRun.id,
        decision,
        reviewer: "local",
        reviewerNote: reviewerNote?.trim() || undefined,
        outputSummary: runnerRun.workflowTextOutput.summary,
        outputHash: stableWorkflowSnapshotHash({
            rawText: runnerRun.workflowTextOutput.rawText,
            summary: runnerRun.workflowTextOutput.summary,
            outputFormat: runnerRun.workflowTextOutput.outputFormat,
            stageId: runnerRun.input.stageId,
            runnerRunId: runnerRun.id,
        }),
        sourceFiles: runnerRun.workflowTextOutput.sourceFiles,
        qualityGateIds: runnerRun.workflowTextOutput.qualityGateIds,
        createdAt: now,
    };
}

export function reviewAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, evidence: AgentWorkflowReviewEvidence, now: string): AgentWorkflowRunRecord {
    const status = evidence.decision === "approved" ? "approved" : "rejected";
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: evidence.stageId,
            stageStates: workflowRun.stageStates.map((stage) =>
                stage.stageId === evidence.stageId
                    ? {
                          ...stage,
                          status,
                          runnerRunId: evidence.runnerRunId,
                          approvedAt: evidence.decision === "approved" ? now : stage.approvedAt,
                          rejectedAt: evidence.decision === "rejected" ? now : undefined,
                          errorMessage: undefined,
                          blockedReason: undefined,
                          evidenceIds: Array.from(new Set([...stage.evidenceIds, evidence.evidenceId])),
                      }
                    : stage,
            ),
            updatedAt: now,
        },
        now,
    );
}

export function workflowStageStatusLabel(status: AgentWorkflowStageStatus) {
    if (status === "idle") return "未开始";
    if (status === "running") return "运行中";
    if (status === "review") return "待审核";
    if (status === "approved") return "已批准";
    if (status === "rejected") return "已驳回";
    if (status === "error") return "异常";
    return "已阻塞";
}

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

export function normalizeAgentDraftOutput(value: unknown, schemaVersion = "1.0.0"): AgentDraftOutput {
    const parsed = parseRawJson(value);
    const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    const items = Array.isArray(record.items) ? record.items : Array.isArray(record.assets) ? record.assets : Array.isArray(record.shots) ? record.shots : Array.isArray(record.briefs) ? record.briefs : [];
    const warnings = Array.isArray(record.warnings) ? record.warnings.map((item) => String(item)).filter(Boolean) : [];
    return {
        summary: String(record.summary || record.title || (items.length ? `生成 ${items.length} 条草案` : "暂无草案摘要")),
        items,
        rawJson: parsed,
        warnings,
        schemaVersion: String(record.schemaVersion || schemaVersion),
    };
}

export function validateAgentDraftOutputShape(value: unknown) {
    const output = normalizeAgentDraftOutput(value);
    return {
        valid: Boolean(output.summary && Array.isArray(output.items) && Array.isArray(output.warnings) && output.schemaVersion),
        output,
    };
}

export function buildAgentTraceMetadata(run: Pick<AgentRunRecord, "id" | "agentConfigId" | "agentConfigVersion" | "agentKind">) {
    return {
        agentRunId: run.id,
        agentKind: run.agentKind,
        agentConfigId: run.agentConfigId,
        agentConfigVersion: run.agentConfigVersion,
    };
}

export function canWriteAgentRun(run: Pick<AgentRunRecord, "status">) {
    return run.status === "approved";
}

export function summarizeAgentRunDraft(run: Pick<AgentRunRecord, "status" | "draftOutput" | "agentConfigVersion">) {
    return {
        status: run.status,
        itemCount: run.draftOutput.items.length,
        warningCount: run.draftOutput.warnings.length,
        configVersionLabel: `配置 v${run.agentConfigVersion}`,
        summary: run.draftOutput.summary,
    };
}

export function buildAgentRunProposedActions(kind: AgentRunKind, output: AgentDraftOutput): AgentRunProposedAction[] {
    return output.items.map((item, index) => {
        const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const title = String(record.title || record.name || `${agentRunKindLabel(kind)}草案 ${index + 1}`);
        return {
            type: `${kind}.preview`,
            title,
            targetRefs: buildTargetRefs(record),
            payload: item,
            requiresConfirmation: true,
        };
    });
}

export function updateAgentRunDraft(run: AgentRunRecord, output: unknown, now: string): AgentRunRecord {
    const draftOutput = normalizeAgentDraftOutput(output);
    return {
        ...run,
        status: "ready_for_review",
        draftOutput,
        proposedActions: buildAgentRunProposedActions(run.agentKind, draftOutput),
        updatedAt: now,
        errorMessage: undefined,
    };
}

export function setWorkflowTextRunCompleted(run: AgentRunRecord, rawText: string, now: string): AgentRunRecord {
    if (run.agentKind !== "workflow_text") return updateAgentRunDraft(run, rawText, now);
    const workflowTextOutput = buildWorkflowTextRunOutput(run.input, rawText, now);
    const structuredItems =
        workflowTextOutput.structuredOutput && typeof workflowTextOutput.structuredOutput === "object" && !Array.isArray(workflowTextOutput.structuredOutput) ? (workflowTextOutput.structuredOutput as Record<string, unknown>).items : [];
    return {
        ...run,
        status: "review",
        draftOutput: {
            summary: workflowTextOutput.summary,
            items: Array.isArray(structuredItems) ? structuredItems : [],
            rawJson: workflowTextOutput.structuredOutput || rawText,
            warnings: workflowTextOutput.outputFormat === "text" ? ["模型返回非 JSON，已按文本保留。"] : [],
            schemaVersion: "workflow-text.v1",
        },
        workflowTextOutput,
        updatedAt: now,
        errorMessage: undefined,
    };
}

export function setWorkflowTextRunFailed(run: AgentRunRecord, errorMessage: string, now: string): AgentRunRecord {
    return {
        ...run,
        status: "error",
        errorMessage,
        draftOutput: {
            ...run.draftOutput,
            summary: errorMessage || "执行失败",
            warnings: [...run.draftOutput.warnings, errorMessage || "执行失败"],
        },
        updatedAt: now,
    };
}

export function markAgentRunFailed(run: AgentRunRecord, errorMessage: string, now: string): AgentRunRecord {
    return { ...run, status: "failed", errorMessage, updatedAt: now };
}

export function approveAgentRun(run: AgentRunRecord, now: string): AgentRunRecord {
    if (run.status === "applied") return run;
    return { ...run, status: "approved", approvedAt: now, rejectedAt: undefined, updatedAt: now };
}

export function rejectAgentRun(run: AgentRunRecord, now: string): AgentRunRecord {
    return { ...run, status: "rejected", rejectedAt: now, updatedAt: now };
}

export function markAgentRunApplied(run: AgentRunRecord, now: string): AgentRunRecord {
    if (run.status !== "approved") throw new Error("Agent run 必须先批准，才能标记为已应用");
    return { ...run, status: "applied", appliedAt: now, updatedAt: now };
}

export function listAgentRunsByProject(runs: AgentRunRecord[], projectId: string) {
    return orderAgentRuns(runs.filter((run) => run.input.projectId === projectId));
}

export function listAgentRunsByEpisode(runs: AgentRunRecord[], episodeId: string) {
    return orderAgentRuns(runs.filter((run) => run.input.episodeId === episodeId));
}

export function listAgentRunsByAgentKind(runs: AgentRunRecord[], agentKind: AgentRunKind) {
    return orderAgentRuns(runs.filter((run) => run.agentKind === agentKind));
}

export function agentRunStatusLabel(status: AgentRunStatus) {
    if (status === "draft") return "草稿";
    if (status === "ready_for_review") return "待审核";
    if (status === "running") return "运行中";
    if (status === "review") return "待审核";
    if (status === "approved") return "已批准";
    if (status === "rejected") return "已驳回";
    if (status === "applied") return "已应用";
    if (status === "failed") return "失败";
    return "异常";
}

export function agentRunKindLabel(kind: AgentRunKind) {
    if (kind === "asset_extractor") return "资产提取";
    if (kind === "storyboard_director") return "分镜导演";
    if (kind === "image_brief_builder") return "生图 Brief";
    if (kind === "video_prompt_builder") return "视频提示词";
    if (kind === "workflow_text") return "文本工作流";
    return "提示词质检";
}

function parseRawJson(value: unknown) {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch {
        return { summary: value, items: [], warnings: ["原始输出不是合法 JSON，已作为文本摘要保存。"] };
    }
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
        if (snapshot.directorOutputSummary) lines.push(`导演产物摘要：${snapshot.directorOutputSummary}`);
        if (snapshot.artDesignOutputSummary) lines.push(`服化道产物摘要：${snapshot.artDesignOutputSummary}`);
        if (snapshot.storyboardRequirement) lines.push(`分镜输出要求：${snapshot.storyboardRequirement}`);
        return lines.length ? lines : ["未提供导演 / 服化道产物及要求"];
    }
    return lines.length ? lines : ["未提供阶段上下文"];
}

function normalizeWorkflowRunInput(input: AgentRunInput): AgentRunInput {
    return {
        ...input,
        sourceFiles: normalizeStringList(input.sourceFiles),
        qualityGateIds: normalizeStringList(input.qualityGateIds),
        promptMessages: Array.isArray(input.promptMessages) ? input.promptMessages : [],
    };
}

function normalizeStringList(value: unknown) {
    const list = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    return Array.from(new Set(list.map((item) => item.trim())));
}

function tryParseTextOutput(rawText: string) {
    const trimmed = rawText.trim();
    const parsed = parseWorkflowTextJson(trimmed) || parseWorkflowTextJson(extractCodeBlock(trimmed));
    if (parsed !== undefined) return { format: "json" as const, value: parsed };
    return { format: "text" as const, value: undefined };
}

function parseWorkflowTextJson(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function extractCodeBlock(text: string) {
    const match = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
    return match?.[1]?.trim() || "";
}

function summarizeWorkflowTextOutput(value: unknown, rawText: string) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record.summary === "string" && record.summary.trim()) return record.summary;
        if (typeof record.text === "string" && record.text.trim()) return record.text;
        if (typeof record.output === "string" && record.output.trim()) return record.output;
    }
    const preview = rawText.trim();
    return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview || "模型返回空文本";
}

function buildTargetRefs(record: Record<string, unknown>) {
    const id = typeof record.id === "string" ? record.id : typeof record.sourceId === "string" ? record.sourceId : "";
    const label = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : undefined;
    const kind = typeof record.kind === "string" ? record.kind : "draft_item";
    return id ? [{ kind, id, label }] : [];
}

function refreshWorkflowStageBlocks(workflowRun: AgentWorkflowRunRecord, now: string): AgentWorkflowRunRecord {
    const stageById = new Map(workflowRun.stageStates.map((stage) => [stage.stageId, stage]));
    let changed = false;
    const stageStates = workflowRun.stageStates.map((stage) => {
        const missingDependency = stage.dependsOnStageIds.find((stageId) => stageById.get(stageId)?.status !== "approved");
        if (!missingDependency) {
            if (stage.status === "blocked") {
                changed = true;
                return { ...stage, status: "idle" as const, blockedReason: undefined };
            }
            return stage;
        }
        const blockedReason = `需先批准前置阶段：${missingDependency}`;
        if (stage.status === "blocked" && stage.blockedReason === blockedReason) return stage;
        changed = true;
        return { ...stage, status: "blocked" as const, blockedReason };
    });
    return changed ? { ...workflowRun, stageStates, updatedAt: now } : workflowRun;
}

function stableWorkflowSnapshotHash(value: unknown) {
    const text = JSON.stringify(value, Object.keys((value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>).sort());
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return `wf-${hash.toString(16).padStart(8, "0")}`;
}

function orderedWorkflowPresetStages(preset: Pick<AgentWorkflowPreset, "stages">) {
    return [...preset.stages].sort((a, b) => a.order - b.order);
}

function orderAgentRuns(runs: AgentRunRecord[]) {
    return [...runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
