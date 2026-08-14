import { productionStageKeys, type ProductionStageKey } from "../../../../production-stage-projection.ts";

export const workflowStageKeys = productionStageKeys;
export type WorkflowStageKey = ProductionStageKey;
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
    const stage = normalizeWorkflowStageKey(input.stage);
    const shot = input.shot && shots.some((item) => item.id === input.shot) ? input.shot : selectDefaultWorkflowShot(shots);
    return { shot, stage };
}

export function normalizeWorkflowStageKey(stage?: string | null, fallback: WorkflowStageKey = "script") {
    const requested = ({ assets: "asset-extraction", delivery: "video" } as Record<string, WorkflowStageKey>)[stage || ""] || stage;
    return workflowStageKeys.includes(requested as WorkflowStageKey) ? (requested as WorkflowStageKey) : fallback;
}

export function workflowRouteSearch(state: WorkflowRouteState, currentSearch = "") {
    const params = new URLSearchParams(currentSearch);
    params.set("stage", state.stage);
    if (state.shot) params.set("shot", state.shot);
    else params.delete("shot");
    return params.toString();
}

export function workflowRouteHref(projectId: string, episodeId: string, state: WorkflowRouteState, currentSearch = "") {
    return `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/workflow?${workflowRouteSearch(state, currentSearch)}`;
}
