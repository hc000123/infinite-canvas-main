export type AgentWorkspaceRoute = {
    projectId: string;
    episodeId?: string;
    stage?: string;
    shot?: string;
};

export function agentWorkspaceHref(input: AgentWorkspaceRoute) {
    const params = new URLSearchParams();
    params.set("projectId", input.projectId);
    if (input.episodeId) params.set("episodeId", input.episodeId);
    if (input.stage) params.set("stage", input.stage);
    if (input.shot) params.set("shot", input.shot);
    return `/agent?${params.toString()}`;
}
