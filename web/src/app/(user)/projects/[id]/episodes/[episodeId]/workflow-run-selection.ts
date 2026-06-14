import type { AgentWorkflowRunRecord } from "../../../agent-runner-types";

export function findEpisodeWorkflowRun({
    canvasId,
    episodeId,
    projectId,
    workflowId,
    workflowRuns,
}: {
    canvasId?: string;
    episodeId: string;
    projectId: string;
    workflowId: string;
    workflowRuns: AgentWorkflowRunRecord[];
}) {
    const candidates = workflowRuns.filter((run) => run.projectId === projectId && run.workflowId === workflowId && (run.episodeId === episodeId || (!run.episodeId && canvasId && run.canvasId === canvasId)));
    if (!candidates.length) return undefined;
    return [...candidates].sort((a, b) => workflowRunRestoreScore(b, canvasId) - workflowRunRestoreScore(a, canvasId) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

function workflowRunRestoreScore(run: AgentWorkflowRunRecord, canvasId?: string) {
    let score = 0;
    score += workflowRunProgressScore(run);
    if (canvasId && run.canvasId === canvasId) score += 50;
    if (!canvasId && !run.canvasId) score += 40;
    if (!run.canvasId) score += 10;
    return score;
}

function workflowRunProgressScore(run: AgentWorkflowRunRecord) {
    return run.stageStates.reduce((score, stage) => {
        if (stage.outputId) score += 1000;
        if (stage.status === "approved") score += 500;
        else if (stage.status === "review") score += 400;
        else if (stage.status === "running") score += 250;
        else if (stage.status === "error" || stage.status === "rejected") score += 150;
        if (stage.stageId === "director-analysis" && ["approved", "review"].includes(stage.status)) score += 300;
        return score;
    }, 0);
}
