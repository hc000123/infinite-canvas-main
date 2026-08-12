import dayjs, { type Dayjs } from "dayjs";

import type { AIUsagePeriod, AIUsageScope } from "../../../services/api/usage.ts";

type UserRole = "guest" | "user" | "admin" | "superadmin";
export type DataCenterRecordColumnKey = "createdAt" | "user" | "kind" | "model" | "netCredits" | "creditsRefunded" | "status";

export const dataCenterSectionTitles = ["使用概览", "使用分布", "消费明细"] as const;
export const dataCenterDetailActions: readonly string[] = [];

export function dataCenterDefaultScope(role: UserRole): AIUsageScope {
    return role === "admin" || role === "superadmin" ? "all" : "mine";
}

export function dataCenterCanExport(role: UserRole, scope: AIUsageScope) {
    return (role === "admin" || role === "superadmin") && scope === "all";
}

export function dataCenterExportRange(current: Dayjs = dayjs()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(current.toDate())
        .reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
    const year = Number(parts.year);
    const month = Number(parts.month);
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    return {
        startAt: `${year}-${String(month).padStart(2, "0")}-01T00:00:00+08:00`,
        endAt: `${next.year}-${String(next.month).padStart(2, "0")}-01T00:00:00+08:00`,
    };
}

export function dataCenterScopeOptions(role: UserRole) {
    if (role !== "admin" && role !== "superadmin") return [];
    return [
        { label: "全部用户", value: "all" as const },
        { label: "我的", value: "mine" as const },
    ];
}

export function dataCenterRecordColumnKeys(scope: AIUsageScope): DataCenterRecordColumnKey[] {
    const columns: DataCenterRecordColumnKey[] = ["createdAt"];
    if (scope === "all") columns.push("user");
    columns.push("kind", "model", "netCredits", "creditsRefunded", "status");
    return columns;
}

export const dataCenterKindLabels: Record<string, string> = {
    image: "图片生成",
    video: "视频生成",
    text: "文本生成",
    agent: "智能体",
    other: "其他",
};

export const dataCenterStatusLabels: Record<string, string> = {
    created: "已创建",
    queued: "排队中",
    running: "处理中",
    succeeded: "成功",
    applied: "已应用",
    approved: "已通过",
    partial: "部分完成",
    needs_review: "待审核",
    failed: "失败",
    cancelled: "已取消",
    rejected: "已拒绝",
    unknown: "未知",
};

export const dataCenterPeriodLabels: Record<AIUsagePeriod, string> = {
    day: "今日",
    week: "本周",
    month: "本月",
};

export function dataCenterPeriodRange(period: AIUsagePeriod, current: Dayjs = dayjs()) {
    const day = current.startOf("day");
    if (period === "day") return { startAt: day.toISOString(), endAt: day.add(1, "day").toISOString() };
    if (period === "week") {
        const start = day.subtract((day.day() + 6) % 7, "day");
        return { startAt: start.toISOString(), endAt: start.add(7, "day").toISOString() };
    }
    const start = day.startOf("month");
    return { startAt: start.toISOString(), endAt: start.add(1, "month").toISOString() };
}
