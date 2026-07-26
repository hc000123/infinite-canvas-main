import { apiGet, apiPatch, apiPost, apiPut } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

import type { SkillManifest, SkillOwnerType } from "./admin-skills";

export type AgentOwnerType = "system" | "project";
export type AgentVersionStatus = "draft" | "published" | "retired";

export type AgentDefinition = {
    id: string;
    name: string;
    summary: string;
    ownerType: AgentOwnerType;
    ownerUserId: string;
    ownerProjectId: string;
    enabled: boolean;
    recommendedVersionId: string;
    createdAt: string;
    updatedAt: string;
};

export type AgentVersion = {
    id: string;
    agentId: string;
    version: string;
    status: AgentVersionStatus;
    plannerMode: "configured_chain";
    contentHash: string;
    createdBy: string;
    publishedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type AgentStepInputBinding = {
    bindingName: string;
    artifactId?: string;
    contentHash?: string;
    fromStepKey?: string;
    fromOutputBinding?: string;
};

export type AgentSkillRef = {
    stepKey: string;
    label: string;
    capability: string;
    skillId: string;
    skillVersionId: string;
    skillVersionConstraint: string;
    required: boolean;
    inputBindings: AgentStepInputBinding[];
    parameters: Record<string, unknown>;
    expectedOutputType: string;
};

export type AgentSkillAccessPolicy = {
    allowedSkillIds: string[];
    allowedCapabilities: string[];
    allowedOwnerTypes: SkillOwnerType[];
};

export type AgentPackage = {
    rolePrompt: string;
    plannerMode: "configured_chain";
    defaultSkillRefs: AgentSkillRef[];
    skillAccessPolicy: AgentSkillAccessPolicy;
    modelPolicy: {
        preferredModel: string;
        allowedModels: string[];
        reasoningLevel: string;
        temperature: number;
        maxOutputTokens: number;
    };
    toolPolicy: { allowedTools: string[] };
    executionPolicy: {
        maxSteps: number;
        allowRuntimeSkillOverride: boolean;
        allowBatch: boolean;
    };
    contentHash: string;
};

export type AgentCreateInput = {
    projectId: string;
    name: string;
    summary: string;
    tags: string[];
    version: string;
    package: AgentPackage;
};

export type AgentDraftInput = Pick<AgentCreateInput, "version" | "package">;
export type AgentVersionDetail = { agent: AgentDefinition; version: AgentVersion; package: AgentPackage; tags: string[] };
export type AgentRegistryItem = { agent: AgentDefinition; tags: string[]; versions: AgentVersion[]; recommendedPackage?: AgentPackage };
export type AgentValidationResult = {
    contentHash: string;
    resolvedSkills: Array<{
        stepKey: string;
        skillId: string;
        skillVersionId: string;
        skillVersion: string;
        skillContentHash: string;
        manifest: SkillManifest;
    }>;
};

const token = () => useUserStore.getState().token;

export function fetchAgents(projectId: string) {
    return apiGet<AgentRegistryItem[]>("/api/v1/agents", { projectId }, token());
}

export function fetchAgent(id: string, projectId: string) {
    return apiGet<AgentRegistryItem>(`/api/v1/agents/${encodeURIComponent(id)}`, { projectId }, token());
}

export function createAgent(input: AgentCreateInput) {
    return apiPost<AgentVersionDetail>("/api/v1/agents", input, token());
}

export function createAgentVersion(agentId: string, input: AgentDraftInput) {
    return apiPost<AgentVersion>(`/api/v1/agents/${encodeURIComponent(agentId)}/versions`, input, token());
}

export function updateAgentVersion(id: string, input: AgentDraftInput) {
    return apiPatch<AgentVersion>(`/api/v1/agent-versions/${encodeURIComponent(id)}`, input, token());
}

export function validateAgentVersion(id: string) {
    return apiPost<AgentValidationResult>(`/api/v1/agent-versions/${encodeURIComponent(id)}/validate`, {}, token());
}

export function publishAgentVersion(id: string) {
    return apiPost<AgentVersionDetail>(`/api/v1/agent-versions/${encodeURIComponent(id)}/publish`, {}, token());
}

export function recommendAgentVersion(agentId: string, agentVersionId: string) {
    return apiPut<AgentVersionDetail>(`/api/v1/agents/${encodeURIComponent(agentId)}/recommended-version`, { agentVersionId }, token());
}
