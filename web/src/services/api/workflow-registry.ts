import { apiGet, apiPatch, apiPost, apiPostEmpty, apiPut, type ApiParams } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

import type { ArtifactRefInput } from "./invocations-contract";

export type WorkflowOwnerType = "system" | "project";
export type WorkflowVersionStatus = "draft" | "published" | "retired";
export type WorkflowExecutorType = "skill" | "agent";
export type WorkflowSkillBindingMode = "fixed" | "tag_route" | "manual_before_run";
export type WorkflowExecutionStatus = "preflight" | "awaiting_confirmation" | "running" | "needs_review" | "completed" | "blocked" | "partial" | "failed" | "cancelled";
export type WorkflowNodeExecutionStatus = "blocked" | "ready" | "queued" | "running" | "needs_review" | "approved" | "completed" | "skipped" | "failed" | "cancelled";

export type WorkflowDefinition = {
    id: string;
    name: string;
    summary: string;
    ownerType: WorkflowOwnerType;
    ownerUserId: string;
    ownerProjectId: string;
    enabled: boolean;
    recommendedVersionId: string;
    createdAt: string;
    updatedAt: string;
};

export type WorkflowVersion = {
    id: string;
    workflowId: string;
    version: string;
    status: WorkflowVersionStatus;
    contentHash: string;
    createdBy: string;
    publishedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type WorkflowSkillBinding = {
    mode: WorkflowSkillBindingMode;
    skillId: string;
    skillVersionId: string;
    skillVersionConstraint: string;
    capability: string;
    expectedOutputArtifactType: string;
    projectTags: string[];
    candidateSkillIds: string[];
};

export type WorkflowAgentRef = { agentId: string; agentVersionId: string; agentVersionConstraint: string };
export type WorkflowNodeInputBinding = {
    bindingName: string;
    artifactType: string;
    source: "workflow_input" | "node_output";
    workflowInputName?: string;
    fromNodeKey?: string;
    fromOutputBinding?: string;
    required: boolean;
};
export type WorkflowCondition = { source: "workflow_input" | "node_output"; key: string; operator: "equals" | "not_equals" | "contains" | "exists"; value?: unknown };
export type WorkflowNodeSpec = {
    nodeKey: string;
    name: string;
    executorType: WorkflowExecutorType;
    agentRef?: WorkflowAgentRef;
    skillBinding?: WorkflowSkillBinding;
    inputBindings: WorkflowNodeInputBinding[];
    outputArtifactType: string;
    dependsOn: string[];
    condition?: WorkflowCondition;
    confirmationPolicy: { requireBeforeRun: boolean; requireReview: boolean };
    retryPolicy: { maxAttempts: number };
};
export type WorkflowPackage = { inputArtifactTypes: string[]; nodes: WorkflowNodeSpec[]; contentHash: string };
export type WorkflowVersionDetail = { workflow: WorkflowDefinition; version: WorkflowVersion; package: WorkflowPackage; tags: string[] };
export type WorkflowRegistryItem = { workflow: WorkflowDefinition; tags: string[]; versions: WorkflowVersion[]; recommendedPackage?: WorkflowPackage };
export type WorkflowCreateInput = { projectId: string; name: string; summary: string; tags: string[]; version: string; package: WorkflowPackage };
export type WorkflowDraftInput = Pick<WorkflowCreateInput, "version" | "package">;
export type WorkflowValidationResult = { contentHash: string; resolvedNodes: Array<{ nodeKey: string; executorType: WorkflowExecutorType; agentId?: string; agentVersionId?: string; skillId?: string; skillVersionId?: string; skillContentHash?: string }> };

export type WorkflowRouteCandidate = { skillId: string; skillVersionId: string; accepted: boolean; score: number; reasons: string[] };
export type WorkflowRouteTrace = { capability: string; candidates: WorkflowRouteCandidate[]; finalSkillVersionId: string; selectedModel: string };
export type WorkflowNodeRoutePreview = {
    nodeKey: string;
    name: string;
    executorType: WorkflowExecutorType;
    agentVersionId?: string;
    skillVersionId?: string;
    skillContentHash?: string;
    routeTrace: WorkflowRouteTrace;
    estimatedCredits: number;
    confirmationCodes: string[];
    blockCode?: string;
    blockMessage?: string;
};
export type WorkflowRoutePreview = { workflowVersionId: string; contentHash: string; executable: boolean; estimatedCredits: number; confirmationRequirements: string[]; nodes: WorkflowNodeRoutePreview[] };
export type WorkflowPreviewInput = { projectId: string; episodeId?: string; inputArtifactRefs: ArtifactRefInput[]; manualSelections: Record<string, string>; projectTags: string[]; parameters: Record<string, unknown> };

export type WorkflowExecutionPreflightInput = WorkflowPreviewInput & { workflowVersionId: string; idempotencyKey: string };
export type WorkflowExecutionConfirmationInput = { revision: number; fingerprint: string; requirementCodes: string[] };
export type WorkflowExecutionRun = {
    id: string;
    projectId: string;
    episodeId: string;
    workflowId: string;
    workflowVersionId: string;
    workflowContentHash: string;
    status: WorkflowExecutionStatus;
    revision: number;
    estimatedCredits: number;
    confirmationFingerprint: string;
    createdAt: string;
    updatedAt: string;
};
export type WorkflowExecutionRevision = {
    id: string;
    workflowExecutionId: string;
    revision: number;
    workflowVersionId: string;
    workflowContentHash: string;
    inputArtifactRefs: ArtifactRefInput[];
    manualSelections: Record<string, string>;
    parameters: Record<string, unknown> | null;
    estimatedCredits: number;
    confirmationFingerprint: string;
    createdAt: string;
};
export type WorkflowNodeExecution = {
    id: string;
    workflowExecutionId: string;
    revision: number;
    ordinal: number;
    nodeKey: string;
    executorType: WorkflowExecutorType;
    invocationId?: string;
    agentPlanId?: string;
    status: WorkflowNodeExecutionStatus;
    outputArtifactRefs: ArtifactRefInput[];
    errorCode?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
};
export type WorkflowExecutionConfirmation = { id: string; workflowExecutionId: string; revision: number; fingerprint: string; estimatedCredits: number; confirmedAt: string };
export type WorkflowExecutionResponse = {
    run: WorkflowExecutionRun;
    revision: WorkflowExecutionRevision;
    nodes: WorkflowNodeExecution[];
    preview: WorkflowRoutePreview;
    confirmationRequirements: string[];
    confirmation?: WorkflowExecutionConfirmation;
};

export type WorkflowApiGet = <T>(url: string, params?: ApiParams, token?: string) => Promise<T>;
export type WorkflowApiPost = <T>(url: string, body?: unknown, token?: string) => Promise<T>;
export type WorkflowApiPostEmpty = <T>(url: string, token?: string) => Promise<T>;
export type WorkflowApiPatch = <T>(url: string, body?: unknown, token?: string) => Promise<T>;
export type WorkflowApiPut = <T>(url: string, body?: unknown, token?: string) => Promise<T>;

export function createWorkflowRegistryClient(deps: { apiGet: WorkflowApiGet; apiPost: WorkflowApiPost; apiPostEmpty: WorkflowApiPostEmpty; apiPatch: WorkflowApiPatch; apiPut: WorkflowApiPut; token: () => string }) {
    const auth = () => deps.token();
    const id = encodeURIComponent;
    return {
        fetchWorkflows: (projectId: string) => deps.apiGet<WorkflowRegistryItem[]>("/api/v1/workflows", { projectId }, auth()),
        fetchWorkflow: (workflowId: string, projectId: string) => deps.apiGet<WorkflowRegistryItem>(`/api/v1/workflows/${id(workflowId)}`, { projectId }, auth()),
        createWorkflow: (input: WorkflowCreateInput) => deps.apiPost<WorkflowVersionDetail>("/api/v1/workflows", input, auth()),
        copyWorkflow: (workflowId: string, projectId: string, name: string) => deps.apiPost<WorkflowVersionDetail>(`/api/v1/workflows/${id(workflowId)}/copy`, { projectId, name }, auth()),
        createWorkflowVersion: (workflowId: string, input: WorkflowDraftInput) => deps.apiPost<WorkflowVersion>(`/api/v1/workflows/${id(workflowId)}/versions`, input, auth()),
        fetchWorkflowVersion: (versionId: string) => deps.apiGet<WorkflowVersionDetail>(`/api/v1/workflow-versions/${id(versionId)}`, undefined, auth()),
        updateWorkflowVersion: (versionId: string, input: WorkflowDraftInput) => deps.apiPatch<WorkflowVersion>(`/api/v1/workflow-versions/${id(versionId)}`, input, auth()),
        validateWorkflowVersion: (versionId: string) => deps.apiPostEmpty<WorkflowValidationResult>(`/api/v1/workflow-versions/${id(versionId)}/validate`, auth()),
        previewWorkflowVersion: (versionId: string, input: WorkflowPreviewInput) => deps.apiPost<WorkflowRoutePreview>(`/api/v1/workflow-versions/${id(versionId)}/preview`, input, auth()),
        publishWorkflowVersion: (versionId: string) => deps.apiPostEmpty<WorkflowVersionDetail>(`/api/v1/workflow-versions/${id(versionId)}/publish`, auth()),
        recommendWorkflowVersion: (workflowId: string, workflowVersionId: string) => deps.apiPut<WorkflowVersionDetail>(`/api/v1/workflows/${id(workflowId)}/recommended-version`, { workflowVersionId }, auth()),
        preflightWorkflowExecution: (input: WorkflowExecutionPreflightInput) => deps.apiPost<WorkflowExecutionResponse>("/api/v1/workflow-executions/preflight", input, auth()),
        fetchWorkflowExecution: (executionId: string) => deps.apiGet<WorkflowExecutionResponse>(`/api/v1/workflow-executions/${id(executionId)}`, undefined, auth()),
        confirmWorkflowExecution: (executionId: string, input: WorkflowExecutionConfirmationInput) => deps.apiPost<WorkflowExecutionResponse>(`/api/v1/workflow-executions/${id(executionId)}/confirm`, input, auth()),
        continueWorkflowExecution: (executionId: string) => deps.apiPostEmpty<WorkflowExecutionResponse>(`/api/v1/workflow-executions/${id(executionId)}/continue`, auth()),
        cancelWorkflowExecution: (executionId: string) => deps.apiPostEmpty<WorkflowExecutionResponse>(`/api/v1/workflow-executions/${id(executionId)}/cancel`, auth()),
    };
}

export const workflowRegistryClient = createWorkflowRegistryClient({ apiGet, apiPost, apiPostEmpty, apiPatch, apiPut, token: () => useUserStore.getState().token });
export const {
    fetchWorkflows, fetchWorkflow, createWorkflow, copyWorkflow, createWorkflowVersion, fetchWorkflowVersion, updateWorkflowVersion,
    validateWorkflowVersion, previewWorkflowVersion, publishWorkflowVersion, recommendWorkflowVersion,
    preflightWorkflowExecution, fetchWorkflowExecution, confirmWorkflowExecution, continueWorkflowExecution, cancelWorkflowExecution,
} = workflowRegistryClient;
