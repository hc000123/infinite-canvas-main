import type { InvocationRunSummary } from "@/services/api/invocations";

const recoverableStatuses = new Set(["queued", "running", "cancel_requested", "needs_review", "approved"]);

export function findRecoverableInvocation(
    runs: InvocationRunSummary[],
    consumer: { consumerSurface: string; targetKind: string; targetId: string },
) {
    for (const run of runs) {
        if (run.consumerSurface !== consumer.consumerSurface || run.targetKind !== consumer.targetKind || run.targetId !== consumer.targetId) continue;
        if (run.status === "awaiting_confirmation") continue;
        return recoverableStatuses.has(run.status) ? run : undefined;
    }
    return undefined;
}
