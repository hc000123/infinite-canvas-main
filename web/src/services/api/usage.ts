import axios from "axios";
import { saveAs } from "file-saver";

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
    generatedSeconds: number;
    durationIssue: string;
    provider: string;
    upstreamTaskId: string;
    errorMessage: string;
    createdAt: string;
    frontendTrace?: AdminAITaskFrontendTrace;
};

export type AIUsageExportQuery = {
    startAt: string;
    endAt: string;
    user?: string;
    model?: string;
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

export async function downloadAdminAIUsageExport(token: string, query: AIUsageExportQuery) {
    let response;
    try {
        response = await axios.get<Blob>("/api/admin/ai-usage-export", {
            headers: { Authorization: `Bearer ${token}` },
            params: compactApiParams({ ...query }),
            responseType: "blob",
            validateStatus: () => true,
        });
    } catch {
        throw new Error("接口连接失败，请确认后端服务已启动");
    }
    const contentType = String(response.headers["content-type"] || response.data.type || "");
    if (response.status < 200 || response.status >= 300 || contentType.includes("application/json")) {
        let message = "用量报表导出失败";
        try {
            message = (JSON.parse(await response.data.text()) as { msg?: string }).msg || message;
        } catch {
            // 保留安全的默认提示。
        }
        throw new Error(message);
    }
    saveAs(response.data, usageExportFilename(String(response.headers["content-disposition"] || ""), query));
}

export function usageExportFilename(disposition: string, query: AIUsageExportQuery) {
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded);
        } catch {
            return encoded;
        }
    }
    const plain = disposition.match(/filename="([^"]+)"/i)?.[1] || disposition.match(/filename=([^;]+)/i)?.[1]?.trim();
    if (plain) return plain;
    const start = query.startAt.slice(0, 10);
    const end = new Date(new Date(query.endAt).getTime() - 1).toISOString().slice(0, 10);
    return `用量报表_${start}_${end}.xlsx`;
}
