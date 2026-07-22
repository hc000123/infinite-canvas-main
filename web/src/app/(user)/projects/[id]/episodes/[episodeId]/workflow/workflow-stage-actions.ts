import type { RemoteWorkflowStageStatus } from "@/services/api/workflow-runs";

export type WorkflowStageActionInput = { hasArtifact: boolean; status: RemoteWorkflowStageStatus };

export function workflowStageActions(stage: WorkflowStageActionInput | null | undefined, gatePassed: boolean) {
    const status = stage?.status;
    const canStart = status === "ready";
    const canCancel = status === "queued" || status === "running" || status === "cancel_requested";
    const canRetry = status === "failed" || status === "cancelled" || status === "rejected";
    const canReview = status === "needs_review" && Boolean(stage?.hasArtifact);
    const canApprove = canReview && gatePassed;
    const canReject = canReview;
    return {
        canApprove,
        canCancel,
        canReject,
        canRetry,
        canStart,
        reason: !stage ? "阶段尚未创建" : status === "blocked" ? "请先完成上一阶段" : canReview && !gatePassed ? "质量门未通过，修复后才能批准" : "",
    };
}

export function canStartFreshShotPrompt(status?: RemoteWorkflowStageStatus) {
    return status === "ready" || status === "failed" || status === "cancelled" || status === "rejected" || status === "approved" || status === "applied";
}

export function parseWorkflowGateIssues(issuesJson?: string) {
    if (!issuesJson) return [] as string[];
    try {
        const parsed = JSON.parse(issuesJson) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.map((issue) => (typeof issue === "string" ? issue : JSON.stringify(issue)));
    } catch {
        return ["质量门详情格式异常，请刷新后重试"];
    }
}
