import { apiGet, apiPatch, apiPost, apiPut } from "@/services/api/request";

export type SkillOwnerType = "system" | "project";
export type SkillVersionStatus = "draft" | "published" | "archived";

export type SkillDefinition = {
    id: string;
    name: string;
    summary: string;
    ownerType: SkillOwnerType;
    ownerProjectId: string;
    enabled: boolean;
    recommendedVersionId: string;
    createdAt: string;
    updatedAt: string;
};

export type SkillVersion = {
    id: string;
    skillId: string;
    version: string;
    status: SkillVersionStatus;
    contentHash: string;
    evaluationSummaryJson: string;
    createdBy: string;
    publishedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type SkillManifest = {
    capabilities: string[];
    inputArtifactTypes: string[];
    outputArtifactTypes: string[];
    projectTags: string[];
    schemaCompatibility: Record<string, string>;
    sideEffects: string[];
    estimatedCostClass: "none" | "text_low" | "text_high" | "image" | "video";
    executorKind?: string;
    requiredTools?: string[];
};

export type SkillArtifactInputSpec = { bindingName: string; artifactType: string; required: boolean; min: number; max: number; schemaConstraint: string; requiresApproval: boolean };
export type SkillArtifactOutputSpec = { bindingName: string; artifactType: string; min: number; max: number; schemaVersion: string };

export type SkillImagePolicy = {
    required: boolean;
    min: number;
    max: number;
    allowTextFallback: boolean;
    allowedTypes: string[];
};

export type SkillInputContract = {
    requiredInputs: string[];
    imagePolicy: SkillImagePolicy;
};

export type SkillOutputContract = {
    schemaVersion: string;
    schema: Record<string, unknown>;
};

export type SkillPackage = {
    manifest: SkillManifest;
    files: Record<string, string>;
    inputContract: SkillInputContract;
    outputContract: SkillOutputContract;
    qualityGateProfile: string[];
    contentHash: string;
};

export type SkillEvaluation = {
    id: string;
    skillVersionId: string;
    baselineVersionId: string;
    contentHash: string;
    projectId: string;
    episodeId: string;
    inputHash: string;
    resultJson: string;
    diffJson: string;
    gateJson: string;
    status: "passed" | "failed" | "running";
    errorMessage: string;
    durationMs: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};

export type SkillAuditLog = {
    id: string;
    adminId: string;
    action: string;
    scope: string;
    scopeId: string;
    skillVersionId: string;
    detailJson: string;
    createdAt: string;
};

export type WorkflowStageSkillBinding = {
    id: string;
    stageKey: string;
    scope: "global" | "project";
    scopeId: string;
    skillVersionId: string;
    createdAt: string;
    updatedAt: string;
};

export type SkillAdminItem = {
    skill: SkillDefinition;
    versions: SkillVersion[];
    recommendedPackage?: SkillPackage;
    bindings: WorkflowStageSkillBinding[];
    evaluations: SkillEvaluation[];
    audits: SkillAuditLog[];
};

export type SkillVersionDetail = { version: SkillVersion; package: SkillPackage };
export type SkillEvaluationResult = {
    evaluation: SkillEvaluation;
    imageCount: number;
    candidate: Record<string, unknown>;
    baseline: Record<string, unknown>;
    diff: Record<string, unknown>;
};
export type SkillDraftInput = { version: string; package: SkillPackage };
export type CreateSkillInput = SkillDraftInput & Pick<SkillDefinition, "name" | "summary" | "ownerType" | "ownerProjectId">;
export type SkillOption = Pick<SkillDefinition, "ownerType" | "ownerProjectId" | "summary"> & {
    skillId: string;
    skillName: string;
    skillVersionId: string;
    version: string;
    isRecommended: boolean;
    manifest: SkillManifest;
    inputBindings: SkillArtifactInputSpec[];
    outputBindings: SkillArtifactOutputSpec[];
};

const base = "/api/v1/admin";

export function fetchAdminSkills(token: string) {
    return apiGet<SkillAdminItem[]>(`${base}/skills`, undefined, token);
}

export function createAdminSkill(token: string, input: CreateSkillInput) {
    return apiPost<{ skill: SkillDefinition; version: SkillVersion; package: SkillPackage }>(`${base}/skills`, input, token);
}

export function updateAdminSkill(token: string, id: string, input: Partial<Pick<SkillDefinition, "name" | "summary" | "enabled">>) {
    return apiPatch<SkillDefinition>(`${base}/skills/${encodeURIComponent(id)}`, input, token);
}

export function fetchAdminSkillVersion(token: string, id: string) {
    return apiGet<SkillVersionDetail>(`${base}/skill-versions/${encodeURIComponent(id)}`, undefined, token);
}

export function createAdminSkillVersion(token: string, skillId: string, input: SkillDraftInput) {
    return apiPost<SkillVersion>(`${base}/skills/${encodeURIComponent(skillId)}/versions`, input, token);
}

export function updateAdminSkillVersion(token: string, id: string, input: SkillDraftInput) {
    return apiPatch<SkillVersion>(`${base}/skill-versions/${encodeURIComponent(id)}`, input, token);
}

export function validateAdminSkillVersion(token: string, id: string) {
    return apiPost<{ valid: boolean; versionId: string; contentHash: string }>(`${base}/skill-versions/${encodeURIComponent(id)}/validate`, {}, token);
}

export function evaluateAdminSkillVersion(token: string, id: string, input: { workflowRunId: string; sourceAgentRunId?: string; baselineVersionId?: string; confirmApiCost: boolean }) {
    return apiPost<SkillEvaluationResult>(`${base}/skill-versions/${encodeURIComponent(id)}/evaluations`, input, token);
}

export function fetchAdminSkillEvaluation(token: string, id: string) {
    return apiGet<SkillEvaluationResult>(`${base}/skill-evaluations/${encodeURIComponent(id)}`, undefined, token);
}

export function publishAdminSkillVersion(token: string, id: string) {
    return apiPost<{ skill: SkillDefinition; version: SkillVersion; package: SkillPackage }>(`${base}/skill-versions/${encodeURIComponent(id)}/publish`, {}, token);
}

export function recommendAdminSkillVersion(token: string, skillId: string, skillVersionId: string) {
    return apiPut<{ skill: SkillDefinition; version: SkillVersion; package: SkillPackage }>(`${base}/skills/${encodeURIComponent(skillId)}/recommended-version`, { skillVersionId }, token);
}

export function fetchAdminWorkflowStageSkillBindings(token: string, stageKey: string) {
    return apiGet<WorkflowStageSkillBinding[]>(`${base}/workflow-stage-skill-bindings/${encodeURIComponent(stageKey)}`, undefined, token);
}

export function updateAdminWorkflowStageSkillBinding(token: string, stageKey: string, input: { scope: "global" | "project"; scopeId?: string; skillVersionId: string }) {
    return apiPut(`${base}/workflow-stage-skill-bindings/${encodeURIComponent(stageKey)}`, input, token);
}

export function fetchSkillOptions(token: string, params: { projectId?: string; capability?: string; inputArtifactType?: string; outputArtifactType?: string }) {
    return apiGet<SkillOption[]>("/api/v1/skill-options", params, token);
}
