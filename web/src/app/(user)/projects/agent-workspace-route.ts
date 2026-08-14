export type AgentWorkspaceRoute = {
    projectId: string;
    episodeId?: string;
    stage?: string;
    shot?: string;
};

const workflowStages = ["script", "asset-extraction", "asset-production", "storyboard", "prompt", "video"] as const;
type WorkflowStage = (typeof workflowStages)[number];

export function agentWorkspaceHref(input: AgentWorkspaceRoute) {
    const projectHref = `/projects/${encodeURIComponent(input.projectId)}`;
    if (!input.episodeId) return projectHref;
    const params = new URLSearchParams();
    params.set("stage", normalizeStage(input.stage));
    if (input.shot) params.set("shot", input.shot);
    return `${projectHref}/episodes/${encodeURIComponent(input.episodeId)}/workflow?${params.toString()}`;
}

type LegacyAgentQuery = Record<string, string | string[] | undefined>;

export function legacyAgentRedirectHref(query: LegacyAgentQuery) {
    const projectId = first(query.projectId);
    if (!projectId) return "/projects";
    return agentWorkspaceHref({ projectId, episodeId: first(query.episodeId), stage: first(query.stage), shot: first(query.shot) });
}

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function normalizeStage(stage?: string): WorkflowStage {
    const legacy = ({ assets: "asset-extraction", delivery: "video" } as Record<string, WorkflowStage>)[stage || ""];
    const requested = legacy || stage;
    return workflowStages.includes(requested as WorkflowStage) ? requested as WorkflowStage : "script";
}
