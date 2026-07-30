export type AdminAccountView = { id: string; role: "admin" | "superadmin"; status: "active" | "ban" };
export type AdminCreditAccountView = { role: "admin" | "superadmin"; credits: number };

export function adminAccountProtection(account: AdminAccountView, actorId: string, activeSuperAdminCount: number) {
    if (account.id === actorId) return { mutable: false, reason: "不能修改自己的管理员状态" };
    if (account.role === "superadmin" && account.status === "active" && activeSuperAdminCount <= 1) return { mutable: false, reason: "必须保留至少一个有效超级管理员" };
    return { mutable: true, reason: "" };
}

export function adminRoleConversion(account: Pick<AdminAccountView, "role">) {
    return account.role === "admin" ? { visible: true, label: "降为普通用户", targetRole: "user" as const } : { visible: false, label: "", targetRole: null };
}

export function adminRoleChangeCopy(role: "admin" | "user") {
    const warning = "账号 ID、资料、算力余额、用量及操作记录都会保留。";
    return role === "admin" ? { title: "提升现有用户", success: "用户已提升为管理员", warning } : { title: "降为普通用户", success: "管理员已降为普通用户", warning };
}

export const adminRoleLabels = { admin: "管理员", superadmin: "超级管理员" } as const;
export const adminStatusLabels = { active: "正常", ban: "禁用" } as const;

export function adminCreditView(account: AdminCreditAccountView) {
    return account.role === "superadmin" ? { label: "余额不限", adjustable: false } : { label: String(account.credits), adjustable: true };
}

export function adminCreditDelta(current: number, next: number) {
    const difference = next - current;
    return { amount: Math.abs(difference), direction: difference > 0 ? "增加" : difference < 0 ? "减少" : "不变" };
}
