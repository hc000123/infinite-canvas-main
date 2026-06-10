import { canInvokeAgentConfig, normalizeAgentConfig, type AgentConfig } from "./agent-settings.ts";
import type { AgentDraftOutput, AgentRunInput, AgentRunKind, AgentRunProposedAction, AgentRunRecord, AgentRunStatus } from "./agent-runner-types.ts";
import { buildWorkflowTextRunOutput } from "./agent-runner-workflow-prompt.ts";
import { normalizeStringList } from "./agent-runner-text-utils.ts";

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

function normalizeWorkflowRunInput(input: AgentRunInput): AgentRunInput {
    return {
        ...input,
        sourceFiles: normalizeStringList(input.sourceFiles),
        qualityGateIds: normalizeStringList(input.qualityGateIds),
        promptMessages: Array.isArray(input.promptMessages) ? input.promptMessages : [],
    };
}

function buildTargetRefs(record: Record<string, unknown>) {
    const id = typeof record.id === "string" ? record.id : typeof record.sourceId === "string" ? record.sourceId : "";
    const label = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : undefined;
    const kind = typeof record.kind === "string" ? record.kind : "draft_item";
    return id ? [{ kind, id, label }] : [];
}

function orderAgentRuns(runs: AgentRunRecord[]) {
    return [...runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
