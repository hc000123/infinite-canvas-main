import { apiGet, apiPost, type ApiParams } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

export type RemoteAgentConfigRecord = {
    id: string;
    userId: string;
    scope: string;
    projectId: string;
    episodeId: string;
    kind: string;
    configJson: string;
    createdAt: string;
    updatedAt: string;
};

export type RemoteAgentRunStatus =
    | "created"
    | "queued"
    | "running"
    | "cancel_requested"
    | "needs_review"
    | "approved"
    | "rejected"
    | "applied"
    | "failed"
    | "cancelled";

export type RemoteAgentRun = {
    id: string;
    userId: string;
    projectId: string;
    episodeId: string;
    workflowRunId: string;
    stageId: string;
    agentKind: string;
    model: string;
    targetModel: string;
    channelId: string;
    targetChannelId: string;
    provider: string;
    protocol: string;
    allowFallback: boolean;
    fallbackUsed: boolean;
    fallbackReason: string;
    estimatedCredits: number;
    timeoutSeconds: number;
    concurrencyLimit: number;
    allowBatch: boolean;
    status: RemoteAgentRunStatus;
    writePolicy: string;
    requiresConfirm: boolean;
    credits: number;
    idempotencyKey?: string;
    attempt: number;
    maxAttempts: number;
    availableAt: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    heartbeatAt: string;
    creditsReserved: number;
    creditsRefunded: number;
    requestJson: string;
    rawOutput: string;
    structuredDraftJson: string;
    reviewJson: string;
    mappingPreviewJson: string;
    errorMessage: string;
    startedAt: string;
    durationMs: number;
    confirmedAt: string;
    appliedAt: string;
    finishedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type RemoteAgentRunList = {
    items: RemoteAgentRun[];
    total: number;
};

export type SaveRemoteAgentConfigInput = {
    scope: "global" | "project" | "episode";
    projectId?: string;
    episodeId?: string;
    kind: string;
    configJson: unknown;
};

export type CreateRemoteAgentRunInput = {
    idempotencyKey?: string;
    projectId?: string;
    episodeId?: string;
    workflowRunId?: string;
    stageId?: string;
    agentKind: string;
    channelId?: string;
    modelPreference?: string;
    allowFallback?: boolean;
    fallbackChannelIds?: string[];
    estimatedCredits?: number;
    allowBatch?: boolean;
    timeoutSeconds?: number;
    concurrencyLimit?: number;
    writePolicy?: string;
    systemPrompt?: string;
    userPrompt?: string;
    messages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxOutputTokens?: number;
    variables?: Record<string, unknown>;
    sourceSnapshot?: Record<string, unknown>;
    reviewJson?: unknown;
    mappingPreviewJson?: unknown;
};

export function listRemoteAgentConfigs(params: ApiParams = {}) {
    return apiGet<RemoteAgentConfigRecord[]>("/api/v1/agent-configs", params, useUserStore.getState().token);
}

export function saveRemoteAgentConfig(input: SaveRemoteAgentConfigInput) {
    return apiPost<RemoteAgentConfigRecord>(
        "/api/v1/agent-configs",
        {
            ...input,
            configJson: input.configJson,
        },
        useUserStore.getState().token,
    );
}

export function listRemoteAgentRuns(params: ApiParams = {}) {
    return apiGet<RemoteAgentRunList>("/api/v1/agent-runs", params, useUserStore.getState().token);
}

export function createRemoteAgentRun(input: CreateRemoteAgentRunInput) {
    return apiPost<RemoteAgentRun>("/api/v1/agent-runs", input, useUserStore.getState().token);
}

export function reviewRemoteAgentRun(id: string, input: { status: "approved" | "rejected" | "applied"; reviewJson?: unknown; mappingPreviewJson?: unknown }) {
    return apiPost<RemoteAgentRun>(`/api/v1/agent-runs/${encodeURIComponent(id)}/review`, input, useUserStore.getState().token);
}
