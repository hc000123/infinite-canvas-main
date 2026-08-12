import type { NavigationToolSlug } from "@/constant/navigation-tools";

type SearchParamReader = { get: (name: string) => string | null };

export function workspaceProjectId(pathname: string, searchParams: SearchParamReader) {
    const fromQuery = searchParams.get("projectId")?.trim();
    if (fromQuery) return fromQuery;
    const match = pathname.match(/^\/projects\/([^/]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
    let returnTo = searchParams.get("returnTo")?.trim() || "";
    for (let depth = 0; depth < 3 && returnTo.startsWith("/") && !returnTo.startsWith("//"); depth += 1) {
        const target = new URL(returnTo, "https://workspace.local");
        const projectId = target.searchParams.get("projectId")?.trim();
        if (projectId) return projectId;
        returnTo = target.searchParams.get("returnTo")?.trim() || "";
    }
    return "";
}

export function contextualToolHref(toolSlug: NavigationToolSlug, projectId: string) {
    if ((toolSlug === "agent" || toolSlug === "assets") && projectId) return `/${toolSlug}?projectId=${encodeURIComponent(projectId)}`;
    return `/${toolSlug}`;
}
