export type AdminAccountView = { id: string; role: "admin" | "superadmin"; status: "active" | "ban" };

export function adminAccountProtection(account: AdminAccountView, actorId: string, activeSuperAdminCount: number) {
    if (account.id === actorId) return { mutable: false, reason: "不能修改自己的管理员状态" };
    if (account.role === "superadmin" && account.status === "active" && activeSuperAdminCount <= 1) return { mutable: false, reason: "必须保留至少一个有效超级管理员" };
    return { mutable: true, reason: "" };
}

export const adminRoleLabels = { admin: "管理员", superadmin: "超级管理员" } as const;
export const adminStatusLabels = { active: "正常", ban: "禁用" } as const;
