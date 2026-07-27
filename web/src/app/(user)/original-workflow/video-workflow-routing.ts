export function displayEpisodeKey(order: number | string) {
    if (typeof order === "string" && /^EP\d{2,}$/i.test(order.trim())) return order.trim().toLowerCase();
    return `ep${String(order || 1).padStart(2, "0")}`;
}

export function videoWorkflowProjectSlug(projectId?: string) {
    const safeId = sanitizeWorkflowKey(projectId || "");
    return safeId ? `project-${safeId}` : "demo-project";
}

export function videoWorkflowEpisodeKey(order: number | string, projectId?: string) {
    const episode = displayEpisodeKey(order);
    return projectId ? `${episode}-${videoWorkflowProjectSlug(projectId)}` : episode;
}

export function videoWorkflowHref(order: number, sourceProjectId?: string, sourceEpisodeId?: string) {
    if (sourceProjectId && sourceEpisodeId) return `/projects/${encodeURIComponent(sourceProjectId)}/episodes/${encodeURIComponent(sourceEpisodeId)}/workflow`;
    const params = new URLSearchParams({
        episode: videoWorkflowEpisodeKey(order, sourceProjectId),
        projectSlug: videoWorkflowProjectSlug(sourceProjectId),
    });
    if (sourceProjectId) params.set("sourceProjectId", sourceProjectId);
    if (sourceEpisodeId) params.set("sourceEpisodeId", sourceEpisodeId);
    return `/original-workflow?${params.toString()}`;
}

function sanitizeWorkflowKey(value: string) {
    return value
        .trim()
        .replace(/[^\w-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
