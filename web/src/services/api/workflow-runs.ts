import { apiGet, apiPost } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

import {
    workflowRunRequest,
    type EnsureWorkflowRunRequest,
    type RemoteWorkflowEvent,
    type RemoteWorkflowRunDetail,
    type RemoteWorkflowStageRun,
    type WorkflowApplyRequest,
    type WorkflowReviewRequest,
    type WorkflowWorkerHealth,
} from "./workflow-runs-contract";

export * from "./workflow-runs-contract";

const token = () => useUserStore.getState().token;

export function ensureWorkflowRun(input: EnsureWorkflowRunRequest) {
    const request = workflowRunRequest.ensure(input);
    return apiPost<RemoteWorkflowRunDetail>(request.path, request.body, token());
}

export function getWorkflowRun(id: string) {
    return apiGet<RemoteWorkflowRunDetail>(workflowRunRequest.detail(id).path, undefined, token());
}

export function startWorkflowStage(id: string, stageId: string, idempotencyKey: string) {
    const request = workflowRunRequest.startStage(id, stageId, idempotencyKey);
    return apiPost<RemoteWorkflowStageRun>(request.path, request.body, token());
}

export function cancelWorkflowStage(id: string) {
    const request = workflowRunRequest.cancelStage(id);
    return apiPost<RemoteWorkflowStageRun>(request.path, request.body, token());
}

export function retryWorkflowStage(id: string, idempotencyKey: string) {
    const request = workflowRunRequest.retryStage(id, idempotencyKey);
    return apiPost<RemoteWorkflowStageRun>(request.path, request.body, token());
}

export function reviewWorkflowStage(id: string, input: WorkflowReviewRequest) {
    const request = workflowRunRequest.reviewStage(id, input);
    return apiPost<RemoteWorkflowStageRun>(request.path, request.body, token());
}

export function applyWorkflowStage(id: string, input: WorkflowApplyRequest) {
    const request = workflowRunRequest.applyStage(id, input);
    return apiPost<RemoteWorkflowStageRun>(request.path, request.body, token());
}

export function listWorkflowEvents(id: string, after = 0, limit = 100) {
    return apiGet<RemoteWorkflowEvent[]>(workflowRunRequest.events(id).path, { after, limit }, token());
}

export function getWorkflowWorkerHealth() {
    return apiGet<WorkflowWorkerHealth>(workflowRunRequest.health().path, undefined, token());
}
