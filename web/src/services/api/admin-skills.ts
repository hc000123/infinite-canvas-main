import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm, apiPut } from "@/services/api/request";
import { buildSkillFolderFormData, type SkillFolderImportFields } from "./skill-folder-form";

export { buildSkillFolderFormData } from "./skill-folder-form";

export type SkillOwnerType = "system";
export type SkillVersionStatus = "draft" | "published" | "archived";

export type SkillDefinition = {
    id: string;
    name: string;
    summary: string;
    ownerType: SkillOwnerType;
    ownerUserId: string;
    ownerProjectId: string;
    stageKey: string;
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
    sourceKind: string;
    sourceHash: string;
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
    artifactInputs: SkillArtifactInputSpec[];
    imagePolicy: SkillImagePolicy;
};

export type SkillOutputContract = {
    schemaVersion: string;
    schema: Record<string, unknown>;
    artifactOutputs: SkillArtifactOutputSpec[];
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
export type SkillStageTemplate = { key: string; label: string; description: string; executorKind: string; capability: string; inputTypes: string[]; outputType: string; outputMin: number; outputMax: number; fixedAdapter: { adapterId: string; adapterVersion: string } };
export type SkillSourceFile = { path: string; mimeType: string; hash: string; size: number; text: boolean };
export type SkillTrialInput = { inputText: string; inputArtifacts: Array<{ bindingName: string; artifactId: string; contentHash: string }>; parameters: Record<string, unknown>; confirmApiCost: boolean };
export type SkillTrialResult = { evaluation: SkillEvaluation; stageKey: string; raw: Record<string, unknown>; standard: Record<string, unknown>; diff: Record<string, unknown>; gates: Array<{ code: string; message: string; itemId?: string; blocking: boolean }> };
export type SkillDraftInput = { version: string; package: SkillPackage };
export type CreateSkillInput = SkillDraftInput & Pick<SkillDefinition, "name" | "summary">;
export type SkillOption = Pick<SkillDefinition, "ownerType" | "ownerProjectId" | "summary"> & {
    skillId: string;
    skillName: string;
    skillVersionId: string;
    version: string;
    contentHash: string;
    isRecommended: boolean;
    manifest: SkillManifest;
    inputBindings: SkillArtifactInputSpec[];
    outputBindings: SkillArtifactOutputSpec[];
};

const base = "/api/v1/admin";

export function fetchAdminSkillStageTemplates(token: string) {
    return apiGet<SkillStageTemplate[]>(`${base}/skill-stage-templates`, undefined, token);
}

export function importAdminSkillFolder(token: string, files: File[], input: SkillFolderImportFields) {
    return apiPostForm<{ skill: SkillDefinition; version: SkillVersion; package: SkillPackage }>(`${base}/skills/import-folder`, buildSkillFolderFormData(files, input), token);
}

export function importAdminSkillFolderVersion(token: string, skillId: string, files: File[], version?: string) {
    const form = buildSkillFolderFormData(files, { stageKey: "version", version });
    return apiPostForm<SkillVersion>(`${base}/skills/${encodeURIComponent(skillId)}/import-version`, form, token);
}

export function fetchAdminSkillSourceFiles(token: string, versionId: string) {
    return apiGet<SkillSourceFile[]>(`${base}/skill-versions/${encodeURIComponent(versionId)}/source-files`, undefined, token);
}

export function fetchAdminSkillSourceText(token: string, versionId: string, path: string) {
    return apiGet<{ path: string; content: string }>(`${base}/skill-versions/${encodeURIComponent(versionId)}/source-file`, { path }, token);
}

export function trialAdminSkillVersion(token: string, versionId: string, input: SkillTrialInput) {
    return apiPost<SkillTrialResult>(`${base}/skill-versions/${encodeURIComponent(versionId)}/trials`, input, token);
}

export function fetchAdminSkillTrial(token: string, trialId: string) {
    return apiGet<SkillTrialResult>(`${base}/skill-trials/${encodeURIComponent(trialId)}`, undefined, token);
}

export function fetchAdminSkills(token: string) {
    return apiGet<SkillAdminItem[]>(`${base}/skills`, undefined, token);
}

export function createAdminSkill(token: string, input: CreateSkillInput) {
    return apiPost<{ skill: SkillDefinition; version: SkillVersion; package: SkillPackage }>(`${base}/skills`, input, token);
}

export function updateAdminSkill(token: string, id: string, input: Partial<Pick<SkillDefinition, "name" | "summary" | "enabled">>) {
    return apiPatch<SkillDefinition>(`${base}/skills/${encodeURIComponent(id)}`, input, token);
}

export function deleteAdminSkill(token: string, id: string) {
    return apiDelete<void>(`${base}/skills/${encodeURIComponent(id)}`, token);
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

export function deleteAdminSkillVersion(token: string, id: string) {
    return apiDelete<void>(`${base}/skill-versions/${encodeURIComponent(id)}`, token);
}

export function archiveAdminSkillVersion(token: string, id: string) {
    return apiPost<SkillVersion>(`${base}/skill-versions/${encodeURIComponent(id)}/archive`, {}, token);
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
