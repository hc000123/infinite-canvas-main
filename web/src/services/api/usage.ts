import type { AdminAITaskFrontendTrace, AdminAIUsagePeriodSummary, AdminUserSummary } from "@/services/api/admin";
import { apiGet, compactApiParams } from "@/services/api/request";

export type AIUsagePeriod = "day" | "week" | "month";
export type AIUsageScope = "mine" | "all";

export type AIUsageRecordQuery = {
    period?: AIUsagePeriod;
    user?: string;
    kind?: string;
    model?: string;
    status?: string;
    startAt?: string;
    endAt?: string;
    page?: number;
    pageSize?: number;
};

export type AIUsageRecord = {
    id: string;
    relatedId: string;
    userId: string;
    user?: AdminUserSummary;
    sourceType: "ai_task" | "agent_run" | "unknown";
    kind: string;
    model: string;
    status: string;
    credits: number;
    creditsRefunded: number;
    netCredits: number;
    provider: string;
    upstreamTaskId: string;
    errorMessage: string;
    createdAt: string;
    frontendTrace?: AdminAITaskFrontendTrace;
};

export type AIUsageRecordList = {
    items: AIUsageRecord[];
    total: number;
    page: number;
    pageSize: number;
};

export type AIUsageKindSummary = {
    kind: string;
    netCredits: number;
    usageCount: number;
    ratio: number;
};

export type UserAIUsageSummary = {
    balance: number;
    periods: AdminAIUsagePeriodSummary[];
    selectedPeriod: AIUsagePeriod;
    kinds: AIUsageKindSummary[];
};

export function fetchMyAIUsageSummary(token: string, period: AIUsagePeriod) {
    return apiGet<UserAIUsageSummary>("/api/me/ai-usage-summary", { period }, token);
}

export function fetchMyAIUsageRecords(token: string, query: AIUsageRecordQuery) {
    return apiGet<AIUsageRecordList>("/api/me/ai-usage-records", compactApiParams(query), token);
}

export function fetchAdminAIUsageRecords(token: string, query: AIUsageRecordQuery) {
    return apiGet<AIUsageRecordList>("/api/admin/ai-usage-records", compactApiParams(query), token);
}
