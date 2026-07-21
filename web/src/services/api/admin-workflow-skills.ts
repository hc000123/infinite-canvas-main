import { apiGet, apiPatch, apiPost, apiPut } from "@/services/api/request";

export type WorkflowSkillStageKey = "script" | "art" | "assets" | "storyboard" | "video" | "delivery";
export type WorkflowSkillVersionStatus = "draft" | "published" | "archived";

export type WorkflowSkill = {
    id: string;
    name: string;
    description: string;
    stageKey: WorkflowSkillStageKey;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type WorkflowSkillVersion = {
    id: string;
    skillId: string;
    version: string;
    status: WorkflowSkillVersionStatus;
    contentHash: string;
    createdBy: string;
    publishedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type WorkflowStageSkillBinding = {
    id: string;
    stageKey: WorkflowSkillStageKey;
    scope: "global" | "project";
    scopeId: string;
    skillVersionId: string;
    createdAt: string;
    updatedAt: string;
};

export type WorkflowSkillImagePolicy = {
    required: boolean;
    min: number;
    max: number;
    allowTextFallback: boolean;
    allowedTypes: string[];
};

export type WorkflowSkillContract = {
    requiredInputs: string[];
    imagePolicy: WorkflowSkillImagePolicy;
    outputSchemaVersion: string;
    outputSchema: Record<string, unknown>;
    qualityGateProfile: string[];
    applyTargets: WorkflowSkillStageKey[];
};

export type WorkflowSkillPackage = {
    files: Record<string, string>;
    contract: WorkflowSkillContract;
    contentHash: string;
};

export type WorkflowSkillEvaluation = {
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

export type WorkflowSkillAdminItem = {
    skill: WorkflowSkill;
    versions: WorkflowSkillVersion[];
    bindings: WorkflowStageSkillBinding[];
    evaluations: WorkflowSkillEvaluation[];
    audits: WorkflowSkillAuditLog[];
};

export type WorkflowSkillAuditLog = {
    id: string;
    adminId: string;
    action: "publish_project" | "promote_global" | "rollback_project" | "rollback_global";
    stageKey: WorkflowSkillStageKey;
    scope: "global" | "project";
    scopeId: string;
    skillVersionId: string;
    detailJson: string;
    createdAt: string;
};

export type WorkflowSkillVersionDetail = { version: WorkflowSkillVersion; package: WorkflowSkillPackage };
export type WorkflowSkillEvaluationResult = {
    evaluation: WorkflowSkillEvaluation;
    imageCount: number;
    candidate: Record<string, unknown>;
    baseline: Record<string, unknown>;
    diff: Record<string, unknown>;
};

export type WorkflowSkillDraftInput = Pick<WorkflowSkillVersion, "version"> & Pick<WorkflowSkillPackage, "files" | "contract">;

const base = "/api/v1/admin";

export function fetchAdminWorkflowSkills(token: string) {
    return apiGet<WorkflowSkillAdminItem[]>(`${base}/workflow-skills`, undefined, token);
}

export function fetchAdminWorkflowSkillVersion(token: string, id: string) {
    return apiGet<WorkflowSkillVersionDetail>(`${base}/workflow-skill-versions/${encodeURIComponent(id)}`, undefined, token);
}

export function createAdminWorkflowSkillVersion(token: string, skillId: string, input: WorkflowSkillDraftInput) {
    return apiPost<WorkflowSkillVersion>(`${base}/workflow-skills/${encodeURIComponent(skillId)}/versions`, input, token);
}

export function updateAdminWorkflowSkillVersion(token: string, id: string, input: WorkflowSkillDraftInput) {
    return apiPatch<WorkflowSkillVersion>(`${base}/workflow-skill-versions/${encodeURIComponent(id)}`, input, token);
}

export function validateAdminWorkflowSkillVersion(token: string, id: string) {
    return apiPost<{ valid: boolean; versionId: string; contentHash: string }>(`${base}/workflow-skill-versions/${encodeURIComponent(id)}/validate`, {}, token);
}

export function evaluateAdminWorkflowSkillVersion(token: string, id: string, input: { workflowRunId: string; sourceAgentRunId?: string; baselineVersionId?: string; confirmApiCost: boolean }) {
    return apiPost<WorkflowSkillEvaluationResult>(`${base}/workflow-skill-versions/${encodeURIComponent(id)}/evaluations`, input, token);
}

export function publishAdminWorkflowSkillVersion(token: string, id: string, input: { scope: "global" | "project"; scopeId?: string }) {
    return apiPost(`${base}/workflow-skill-versions/${encodeURIComponent(id)}/publish`, input, token);
}

export function rollbackAdminWorkflowSkillBinding(token: string, stageKey: WorkflowSkillStageKey, input: { scope: "global" | "project"; scopeId?: string; skillVersionId: string }) {
    return apiPut(`${base}/workflow-stage-skill-bindings/${encodeURIComponent(stageKey)}`, input, token);
}
