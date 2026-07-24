import type { AdminUserSummary } from "@/services/api/admin";

export function adminUsageUserDisplay(item: { userId: string; user?: AdminUserSummary | null }) {
    const user = item.user;
    if (!user?.id) return { primary: "用户已删除", secondary: item.userId || "-", deleted: true };
    const primary = user.displayName || user.username || item.userId;
    const secondary = [user.username && user.username !== primary ? user.username : "", item.userId].filter(Boolean).join(" · ");
    return { primary, secondary, deleted: false };
}
