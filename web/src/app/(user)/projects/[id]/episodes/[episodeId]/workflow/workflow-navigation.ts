export type WorkflowNavigationSearchParams = Record<string, string | string[] | undefined>;

const INTERNAL_ORIGIN = "https://workspace.local";

export function workflowReturnTarget(projectId: string, query: WorkflowNavigationSearchParams) {
    const fallback = { href: `/projects/${encodeURIComponent(projectId)}`, label: "返回项目" };
    if (typeof query.returnTo !== "string" || (query.returnLabel !== undefined && typeof query.returnLabel !== "string")) return fallback;
    const returnTo = query.returnTo.trim();
    if (!returnTo.startsWith("/")) return fallback;
    try {
        const url = new URL(returnTo, INTERNAL_ORIGIN);
        if (url.origin !== INTERNAL_ORIGIN) return fallback;
        return {
            href: `${url.pathname}${url.search}${url.hash}`,
            label: url.pathname === "/agent" ? "返回生产总控" : "返回项目",
        };
    } catch {
        return fallback;
    }
}
