export type AccountDestination = { key: "data-center" | "admin"; label: string; href: string };

export function accountDestinationItems(role: "guest" | "user" | "admin" | "superadmin"): AccountDestination[] {
    const items: AccountDestination[] = [{ key: "data-center", label: "数据中心", href: "/data-center" }];
    if (role === "admin" || role === "superadmin") items.push({ key: "admin", label: "管理后台", href: "/admin" });
    return items;
}
