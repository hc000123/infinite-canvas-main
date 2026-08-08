export const workflowStageKeys = ["script", "asset-extraction", "asset-production", "storyboard", "prompt", "video"] as const;

export type WorkflowStageKey = (typeof workflowStageKeys)[number];
export type WorkflowRouteShotStatus = "blocked" | "review" | "running" | "incomplete" | "complete";
export type WorkflowRouteShot = { id: string; status?: WorkflowRouteShotStatus };
export type WorkflowRouteState = { shot: string; stage: WorkflowStageKey };

const shotPriority: WorkflowRouteShotStatus[] = ["blocked", "review", "running", "incomplete", "complete"];

export function selectDefaultWorkflowShot(shots: WorkflowRouteShot[]) {
    for (const status of shotPriority) {
        const shot = shots.find((item) => (item.status || "incomplete") === status);
        if (shot) return shot.id;
    }
    return "";
}

export function normalizeWorkflowRouteState(input: { shot?: string | null; stage?: string | null }, shotInput: string[] | WorkflowRouteShot[]): WorkflowRouteState {
    const shots = shotInput.map((item) => (typeof item === "string" ? { id: item, status: "incomplete" as const } : item));
    const requested = ({ assets: "asset-extraction", delivery: "video" } as Record<string, WorkflowStageKey>)[input.stage || ""] || input.stage;
    const stage = workflowStageKeys.includes(requested as WorkflowStageKey) ? (requested as WorkflowStageKey) : "script";
    const shot = input.shot && shots.some((item) => item.id === input.shot) ? input.shot : selectDefaultWorkflowShot(shots);
    return { shot, stage };
}

export function workflowRouteSearch(state: WorkflowRouteState) {
    const params = new URLSearchParams({ stage: state.stage });
    if (state.shot) params.set("shot", state.shot);
    return params.toString();
}
