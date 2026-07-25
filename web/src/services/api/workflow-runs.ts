import { apiDelete, apiGet, apiPost, apiPostForm } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

import {
    workflowRunRequest,
    type EnsureWorkflowRunRequest,
    type RemoteWorkflowEvent,
    type RemoteWorkflowRunDetail,
    type RemoteWorkflowStageRun,
    type WorkflowApplyRequest,
    type WorkflowReviewRequest,
    type WorkflowStageStartOptions,
    type WorkflowSkillOption,
    type WorkflowWorkerHealth,
    type WorkflowMediaBatchDetail,
    workflowStageSkillCapability,
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

export async function listWorkflowSkillOptions(stageId: string, projectId: string) {
    const items = await apiGet<Array<{ skillId: string; skillName: string; summary: string; skillVersionId: string; version: string }>>(workflowRunRequest.skillOptions().path, { projectId, capability: workflowStageSkillCapability(stageId) }, token());
    return [
        { stageId, skillId: "", skillName: "使用阶段绑定", description: "项目绑定优先，全局绑定兜底", skillVersionId: "", version: "自动", isDefault: true },
        ...items.map((item): WorkflowSkillOption => ({ stageId, skillId: item.skillId, skillName: item.skillName, description: item.summary, skillVersionId: item.skillVersionId, version: item.version, isDefault: false })),
    ];
}

export function startWorkflowStage(id: string, stageId: string, idempotencyKey: string, options?: WorkflowStageStartOptions) {
    const request = workflowRunRequest.startStage(id, stageId, idempotencyKey, options);
    return apiPost<RemoteWorkflowStageRun>(request.path, request.body, token());
}

export function createWorkflowMediaBatch(id: string, stageId: string, idempotencyKey: string) {
    const request = workflowRunRequest.createMediaBatch(id, stageId, idempotencyKey);
    return apiPost<WorkflowMediaBatchDetail>(request.path, request.body, token());
}

export function uploadWorkflowMedia(batchId: string, input: { file: Blob; filename: string; assetId: string; label: string; kind: "character" | "scene" | "prop"; version: string; order: number }) {
    const form = new FormData();
    form.set("file", input.file, input.filename);
    form.set("assetId", input.assetId);
    form.set("label", input.label);
    form.set("kind", input.kind);
    form.set("version", input.version);
    form.set("order", String(input.order));
    return apiPostForm<WorkflowMediaBatchDetail>(`${workflowRunRequest.mediaBatch(batchId).path}/items`, form, token());
}

export function deleteWorkflowMediaBatch(batchId: string) {
    return apiDelete<boolean>(workflowRunRequest.mediaBatch(batchId).path, token());
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
