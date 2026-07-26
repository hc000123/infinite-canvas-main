import { apiGet, apiPost, apiPostEmpty } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

import type { AgentSkillRef, AgentStepInputBinding } from "./agent-registry";
import type { ArtifactRefInput, InvocationLifecycleResponse } from "./invocations-contract";

export type AgentPlanStatus = "draft" | "preflight" | "awaiting_confirmation" | "running" | "needs_review" | "completed" | "blocked" | "failed" | "cancelled";
export type AgentPlanStepStatus = "pending" | "ready" | "queued" | "running" | "needs_review" | "approved" | "completed" | "failed" | "cancelled";

export type AgentPlanCreateInput = {
    projectId: string;
    episodeId?: string;
    agentId: string;
    agentVersionId: string;
    goal: string;
    sourceArtifactRefs: ArtifactRefInput[];
    skillOverrides?: AgentSkillRef[];
    idempotencyKey: string;
};

export type AgentPlanRevisionInput = {
    agentVersionId: string;
    goal: string;
    sourceArtifactRefs: ArtifactRefInput[];
    skillOverrides?: AgentSkillRef[];
};

export type AgentPlanConfirmInput = {
    revision: number;
    fingerprint: string;
    requirementCodes: string[];
};

export type AgentPlan = {
    id: string;
    projectId: string;
    episodeId: string;
    agentId: string;
    agentVersionId: string;
    goal: string;
    status: AgentPlanStatus;
    currentRevision: number;
    estimatedCredits: number;
    confirmationFingerprint: string;
    createdAt: string;
    updatedAt: string;
};

export type AgentPlanRevision = {
    id: string;
    agentPlanId: string;
    revision: number;
    agentVersionId: string;
    agentContentHash: string;
    goal: string;
    confirmationFingerprint: string;
    estimatedCredits: number;
    createdAt: string;
};

export type AgentPlanStep = {
    id: string;
    agentPlanId: string;
    revision: number;
    ordinal: number;
    stepKey: string;
    label: string;
    capability: string;
    skillId: string;
    skillVersionId: string;
    skillVersion: string;
    skillContentHash: string;
    expectedOutputType: string;
    invocationId: string;
    status: AgentPlanStepStatus;
    errorCode: string;
    errorMessage: string;
    createdAt: string;
    updatedAt: string;
};

export type AgentPlanStepDetail = {
    step: AgentPlanStep;
    inputBindings: AgentStepInputBinding[];
    parameters: Record<string, unknown>;
    outputArtifactRefs: ArtifactRefInput[];
};

export type AgentPlanConfirmation = {
    id: string;
    agentPlanId: string;
    revision: number;
    fingerprint: string;
    estimatedCredits: number;
    confirmedAt: string;
};

export type AgentPlanDetail = {
    plan: AgentPlan;
    revision: AgentPlanRevision;
    steps: AgentPlanStepDetail[];
    confirmation?: AgentPlanConfirmation;
};

export type AgentPlanConfirmationRequirement = { code: string; message: string };
export type AgentPlanPreflightResult = AgentPlanDetail & { confirmationRequirements: AgentPlanConfirmationRequirement[] };
export type AgentPlanContinueResult = AgentPlanDetail & { activeStep?: AgentPlanStepDetail; invocation?: InvocationLifecycleResponse };

const token = () => useUserStore.getState().token;

export function createAgentPlan(input: AgentPlanCreateInput) {
    return apiPost<AgentPlanDetail>("/api/v1/agent-plans", input, token());
}

export function fetchAgentPlan(id: string) {
    return apiGet<AgentPlanDetail>(`/api/v1/agent-plans/${encodeURIComponent(id)}`, undefined, token());
}

export function createAgentPlanRevision(id: string, input: AgentPlanRevisionInput) {
    return apiPost<AgentPlanDetail>(`/api/v1/agent-plans/${encodeURIComponent(id)}/revisions`, input, token());
}

export function preflightAgentPlan(id: string) {
    return apiPostEmpty<AgentPlanPreflightResult>(`/api/v1/agent-plans/${encodeURIComponent(id)}/preflight`, token());
}

export function confirmAgentPlan(id: string, input: AgentPlanConfirmInput) {
    return apiPost<AgentPlanDetail>(`/api/v1/agent-plans/${encodeURIComponent(id)}/confirm`, input, token());
}

export function continueAgentPlan(id: string) {
    return apiPostEmpty<AgentPlanContinueResult>(`/api/v1/agent-plans/${encodeURIComponent(id)}/continue`, token());
}

export function cancelAgentPlan(id: string) {
    return apiPostEmpty<AgentPlanDetail>(`/api/v1/agent-plans/${encodeURIComponent(id)}/cancel`, token());
}
