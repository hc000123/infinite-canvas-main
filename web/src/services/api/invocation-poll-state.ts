type InvocationPollRun = {
    status: string;
    latestRevision: number;
    latestAttempt: number;
    reviewedAttempt: number;
    reviewedArtifactSetHash: string;
};

type InvocationPollAttempt = {
    attempt: number;
    status: string;
    errorClass: string;
    finishedAt: string;
};

const activeStatuses = new Set(["queued", "running", "cancel_requested"]);

export function invocationPollActive(status?: string) {
    return activeStatuses.has(status || "");
}

function invocationFingerprint(run: InvocationPollRun, attempt?: InvocationPollAttempt) {
    return JSON.stringify([
        run.status,
        run.latestRevision,
        run.latestAttempt,
        run.reviewedAttempt,
        run.reviewedArtifactSetHash,
        attempt ? [attempt.attempt, attempt.status, attempt.errorClass, attempt.finishedAt] : null,
    ]);
}

export function invocationPollNeedsDetail(
    detail: { run: InvocationPollRun; attempts: InvocationPollAttempt[] } | undefined,
    poll: { run: InvocationPollRun; attempt?: InvocationPollAttempt },
) {
    if (!detail) return true;
    const currentAttempt = detail.attempts.find((attempt) => attempt.attempt === detail.run.latestAttempt);
    return invocationFingerprint(detail.run, currentAttempt) !== invocationFingerprint(poll.run, poll.attempt);
}
