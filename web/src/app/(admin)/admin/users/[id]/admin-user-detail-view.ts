import type { AdminUser } from "@/services/api/admin";

type Input = { user: Pick<AdminUser, "credits" | "lastLoginAt">; aiTaskCount: number; aiCreditsConsumed: number; creditLogCount: number };

export function adminUserDetailStats(detail: Input) {
    return [
        { key: "credits", label: "当前算力点", value: detail.user.credits },
        { key: "consumed", label: "累计 AI 消耗", value: detail.aiCreditsConsumed },
        { key: "tasks", label: "AI 任务", value: detail.aiTaskCount },
        { key: "lastLogin", label: "最近登录", value: detail.user.lastLoginAt },
    ];
}

export function adminUserDetailTabs(detail: Input) {
    return ["操作记录", `AI 任务 ${detail.aiTaskCount}`, `算力点流水 ${detail.creditLogCount}`];
}
