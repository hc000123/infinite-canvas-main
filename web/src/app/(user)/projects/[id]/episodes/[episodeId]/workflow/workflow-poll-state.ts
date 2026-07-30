type WorkflowPollStage = {
    stageId: string;
    status: string;
    attempt: number;
    errorMessage: string;
};

type WorkflowPollComparable = {
    status: string;
    stages: WorkflowPollStage[];
};

export function appendWorkflowEvents<T extends { cursor: number }>(current: T[], incoming: T[]) {
    const seen = new Set(current.map((event) => event.cursor));
    return [...current, ...incoming.filter((event) => !seen.has(event.cursor))];
}

export function workflowPollFingerprint(value: WorkflowPollComparable) {
    return JSON.stringify([
        value.status,
        [...value.stages]
            .sort((left, right) => left.stageId.localeCompare(right.stageId))
            .map((stage) => [stage.stageId, stage.status, stage.attempt, stage.errorMessage]),
    ]);
}

export function workflowPollNeedsDetail(detail: { run: { status: string }; stages: WorkflowPollStage[] } | null, poll: WorkflowPollComparable) {
    if (!detail) return true;
    return workflowPollFingerprint({ status: detail.run.status, stages: detail.stages }) !== workflowPollFingerprint(poll);
}
