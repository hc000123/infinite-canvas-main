import { canInvokeAgentConfig, normalizeAgentConfig, type AgentConfig, type AgentConfigKind } from "./agent-settings.ts";

export type AgentRunStatus = "draft" | "ready_for_review" | "approved" | "rejected" | "applied" | "failed";
export type AgentRunKind = AgentConfigKind;

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
    createdAt: string;
    updatedAt: string;
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

export function markAgentRunFailed(run: AgentRunRecord, errorMessage: string, now: string): AgentRunRecord {
    return { ...run, status: "failed", errorMessage, updatedAt: now };
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
    if (status === "approved") return "已批准";
    if (status === "rejected") return "已驳回";
    if (status === "applied") return "已应用";
    return "失败";
}

export function agentRunKindLabel(kind: AgentRunKind) {
    if (kind === "asset_extractor") return "资产提取";
    if (kind === "storyboard_director") return "分镜导演";
    if (kind === "image_brief_builder") return "生图 Brief";
    if (kind === "video_prompt_builder") return "视频提示词";
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

function buildTargetRefs(record: Record<string, unknown>) {
    const id = typeof record.id === "string" ? record.id : typeof record.sourceId === "string" ? record.sourceId : "";
    const label = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : undefined;
    const kind = typeof record.kind === "string" ? record.kind : "draft_item";
    return id ? [{ kind, id, label }] : [];
}

function orderAgentRuns(runs: AgentRunRecord[]) {
    return [...runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
