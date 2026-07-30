export type RemoteWorkflowRunStatus = "active" | "completed" | "failed" | "cancelled";
export type RemoteWorkflowStageStatus = "blocked" | "ready" | "queued" | "running" | "cancel_requested" | "needs_review" | "approved" | "rejected" | "applied" | "failed" | "cancelled";

export type RemoteWorkflowRun = {
    id: string;
    userId: string;
    projectId: string;
    episodeId: string;
    workflowId: string;
    workflowVersion: string;
    scriptHash: string;
    scriptSnapshot: string;
    currentStageId: string;
    status: RemoteWorkflowRunStatus;
    createdAt: string;
    updatedAt: string;
};

export type RemoteWorkflowStageRun = {
    id: string;
    userId: string;
    workflowRunId: string;
    stageId: string;
    parentStageRunId: string;
    invocationId: string;
    agentRunId: string;
    attempt: number;
    status: RemoteWorkflowStageStatus;
    inputArtifactId: string;
    outputArtifactId: string;
    estimatedCredits: number;
    progressCurrent: number;
    progressTotal: number;
    errorMessage: string;
    reviewDecision: string;
    reviewedArtifactHash: string;
    reviewComment: string;
    applyReceiptJson: string;
    startedAt: string;
    finishedAt: string;
    reviewedAt: string;
    appliedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type RemoteWorkflowArtifact = {
    id: string;
    userId: string;
    workflowRunId: string;
    stageRunId: string;
    agentRunId: string;
    kind: string;
    version: number;
    schemaVersion: string;
    templateVersion: string;
    contentJson: string;
    contentHash: string;
    artifactSetHash: string;
    artifactIds: string[];
    createdAt: string;
};

export type RemoteWorkflowQualityGate = {
    id: string;
    userId: string;
    workflowRunId: string;
    stageRunId: string;
    artifactId: string;
    artifactHash: string;
    validatorVersion: string;
    passed: boolean;
    issuesJson: string;
    createdAt: string;
};

export type RemoteWorkflowEvent = {
    cursor: number;
    userId: string;
    workflowRunId: string;
    stageRunId: string;
    agentRunId: string;
    type: string;
    level: string;
    dataJson: string;
    createdAt: string;
};

export type RemoteWorkflowRunDetail = {
    run: RemoteWorkflowRun;
    stages: RemoteWorkflowStageRun[];
    artifacts: RemoteWorkflowArtifact[];
    gates: RemoteWorkflowQualityGate[];
    agentRuns: Array<Record<string, unknown> & { id: string; status: string; model: string; provider: string; errorMessage: string; executor: "api"; skillId: string; skillVersionId: string; skillVersion: string; skillContentHash: string }>;
};

export type WorkflowWorkerHealth = {
    enabled: boolean;
    ready: boolean;
    workerId: string;
    lastHeartbeatAt: string;
    heartbeatFresh: boolean;
    textChannelAvailable: boolean;
    queueDepth: number;
    runningCount: number;
    staleLeaseCount: number;
    executor: "api";
    executorLabel: string;
};

export type WorkflowStagePollSummary = {
    id: string;
    stageId: string;
    invocationId: string;
    status: RemoteWorkflowStageStatus;
    attempt: number;
    errorMessage: string;
    updatedAt: string;
};

export type WorkflowRunPoll = {
    runId: string;
    status: RemoteWorkflowRunStatus;
    updatedAt: string;
    stages: WorkflowStagePollSummary[];
    events: RemoteWorkflowEvent[];
    nextAfter: number;
    worker: WorkflowWorkerHealth;
};

export type WorkflowMediaItem = { id: string; batchId: string; assetId: string; label: string; kind: "character" | "scene" | "prop"; version: string; order: number; sha256: string; mime: string; size: number; createdAt: string };
export type WorkflowMediaBatchDetail = {
    batch: { id: string; userId: string; workflowRunId: string; stageId: string; idempotencyKey: string; status: "open" | "claimed"; agentRunId: string; expiresAt: string; createdAt: string; updatedAt: string };
    items: WorkflowMediaItem[];
};

export type EnsureWorkflowRunRequest = {
    projectId: string;
    episodeId: string;
    workflowId?: string;
    workflowVersion?: string;
    scriptSnapshot: string;
    scriptConfirmed: boolean;
};

export type WorkflowSkillOption = {
    stageId: string;
    skillId: string;
    skillName: string;
    description: string;
    skillVersionId: string;
    version: string;
    isDefault: boolean;
};

export function workflowStageSkillCapability(stageId: string) {
    return `workflow.stage.${({ "script-adaptation": "script", "asset-extraction": "art", "asset-image-prompt": "assets", "shot-breakdown": "storyboard", "shot-prompt": "video" } as Record<string, string>)[stageId] || stageId}`;
}

export type WorkflowReviewRequest = { decision: "approved" | "rejected"; artifactHash: string; comment?: string };
export type WorkflowStageStartOptions = { mediaBatchId?: string; skillVersionId?: string; context?: unknown };
export type WorkflowApplyRequest = {
    artifactHash: string;
    target: string;
    targetIds: string[];
    appliedCount: number;
    skippedCount: number;
    version?: string;
    errors?: string[];
    metadata?: unknown;
};

const encode = encodeURIComponent;

export const workflowRunRequest = {
    ensure: (body: EnsureWorkflowRunRequest) => ({ path: "/api/v1/workflow-runs", body }),
    detail: (id: string) => ({ path: `/api/v1/workflow-runs/${encode(id)}` }),
    poll: (id: string, after = 0) => ({ path: `/api/v1/workflow-runs/${encode(id)}/poll`, params: { after } }),
    startStage: (id: string, stageId: string, idempotencyKey: string, options: WorkflowStageStartOptions = {}) => ({ path: `/api/v1/workflow-runs/${encode(id)}/stages/${encode(stageId)}/start`, body: { idempotencyKey, ...(options.mediaBatchId ? { mediaBatchId: options.mediaBatchId } : {}), ...(options.skillVersionId ? { skillVersionId: options.skillVersionId } : {}), ...(options.context !== undefined ? { context: options.context } : {}) } }),
    skillOptions: () => ({ path: "/api/v1/skill-options" }),
    createMediaBatch: (id: string, stageId: string, idempotencyKey: string) => ({ path: `/api/v1/workflow-runs/${encode(id)}/media-batches`, body: { stageId, idempotencyKey } }),
    mediaBatch: (id: string) => ({ path: `/api/v1/workflow-media-batches/${encode(id)}` }),
    cancelStage: (id: string) => ({ path: `/api/v1/workflow-stage-runs/${encode(id)}/cancel`, body: {} }),
    retryStage: (id: string, idempotencyKey: string) => ({ path: `/api/v1/workflow-stage-runs/${encode(id)}/retry`, body: { idempotencyKey } }),
    reviewStage: (id: string, body: WorkflowReviewRequest) => ({ path: `/api/v1/workflow-stage-runs/${encode(id)}/review`, body }),
    applyStage: (id: string, body: WorkflowApplyRequest) => ({ path: `/api/v1/workflow-stage-runs/${encode(id)}/apply`, body }),
    events: (id: string) => ({ path: `/api/v1/workflow-runs/${encode(id)}/events` }),
    health: () => ({ path: "/api/v1/workflow-worker/health" }),
};
