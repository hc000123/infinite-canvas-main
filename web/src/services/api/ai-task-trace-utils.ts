import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from "axios";

import type { AiConfig } from "@/stores/use-config-store";
import type { AdminAITaskDetailResponse, AdminCreditLog } from "./admin";

export type AiTaskTrace = {
    projectId?: string;
    canvasId?: string;
    nodeId?: string;
    assetId?: string;
    storyboardGroupId?: string;
    storyboardShotId?: string;
    shotGroupId?: string;
    shotIds?: string[];
    source?: string;
};

export type AiTaskLedger = {
    aiTaskId?: string;
    upstreamTaskId?: string;
    aiTaskStatus?: string;
    aiTaskCredits?: number;
    creditLogId?: string;
    creditsRefunded?: number;
    refundedAt?: string;
    finishedAt?: string;
    errorMessage?: string;
};

export type FrontendArtifactTrace = AiTaskTrace & {
    assetId?: string;
    kind?: string;
    createdAt?: string;
};

export function aiTaskTraceHeaders(_config: AiConfig, trace?: AiTaskTrace): Record<string, string> {
    const compact = compactTrace(trace);
    return compact ? { "X-Infinite-Canvas-Trace": JSON.stringify(compact) } : {};
}

export function readAiTaskLedgerFromHeaders(headers: RawAxiosResponseHeaders | AxiosResponseHeaders): AiTaskLedger {
    return {
        aiTaskId: readHeader(headers, "x-ai-task-id"),
        upstreamTaskId: readHeader(headers, "x-ai-upstream-task-id"),
        aiTaskStatus: readHeader(headers, "x-ai-task-status"),
        aiTaskCredits: readNumberHeader(headers, "x-ai-task-credits"),
        creditLogId: readHeader(headers, "x-ai-credit-log-id"),
    };
}

export function buildGenerationTaskLedger(ledger?: AiTaskLedger | null, detail?: AdminAITaskDetailResponse | null) {
    const task = detail?.task;
    const creditLogs = detail?.creditLogs || [];
    const consume = creditLogs.find((log) => log.type === "ai_consume");
    return {
        aiTaskId: ledger?.aiTaskId || task?.id,
        upstreamTaskId: ledger?.upstreamTaskId || task?.upstreamTaskId,
        aiTaskStatus: task?.status || ledger?.aiTaskStatus,
        aiTaskCredits: task?.credits ?? ledger?.aiTaskCredits,
        creditLogId: ledger?.creditLogId || consume?.id,
        creditsRefunded: task?.creditsRefunded,
        refundedAt: task?.refundedAt,
        finishedAt: task?.finishedAt,
        errorMessage: task?.errorMessage,
    };
}

export function aiTaskLedgerFromGeneration(generation: Record<string, unknown> | undefined): AiTaskLedger {
    return {
        aiTaskId: readString(generation?.aiTaskId),
        upstreamTaskId: readString(generation?.upstreamTaskId) || readString(generation?.taskId),
        aiTaskStatus: readString(generation?.aiTaskStatus),
        aiTaskCredits: readNumber(generation?.aiTaskCredits) || undefined,
        creditLogId: readString(generation?.creditLogId),
        creditsRefunded: readNumber(generation?.creditsRefunded) || undefined,
        refundedAt: readString(generation?.refundedAt),
        finishedAt: readString(generation?.finishedAt),
    };
}

export function generationTaskSummary(generation: Record<string, unknown> | undefined, creditLogs?: AdminCreditLog[]) {
    const credits = readNumber(generation?.aiTaskCredits);
    const refunded = readNumber(generation?.creditsRefunded);
    const creditLogId = readString(generation?.creditLogId);
    const consume = creditLogs?.find((log) => log.type === "ai_consume");
    return {
        aiTaskId: readString(generation?.aiTaskId),
        upstreamTaskId: readString(generation?.upstreamTaskId) || readString(generation?.taskId),
        status: readString(generation?.aiTaskStatus),
        credits: credits || Math.abs(consume?.amount || 0),
        refunded,
        refundedAt: readString(generation?.refundedAt),
        creditLogId: creditLogId || consume?.id || "",
    };
}

export function compactTrace(trace?: AiTaskTrace | FrontendArtifactTrace) {
    if (!trace) return null;
    const entries = Object.entries(trace).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && String(value).trim() !== "";
    });
    return entries.length ? Object.fromEntries(entries) : null;
}

function readHeader(headers: RawAxiosResponseHeaders | AxiosResponseHeaders, key: string) {
    const value = headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] || "" : "";
}

function readNumberHeader(headers: RawAxiosResponseHeaders | AxiosResponseHeaders, key: string) {
    const value = Number(readHeader(headers, key));
    return Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
    return Number.isFinite(number) ? number : 0;
}
