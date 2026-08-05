import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm, apiPut } from "@/services/api/request";
import type {
    SkillAdminItem,
    SkillDefinition,
    SkillDraftInput,
    SkillEvaluationResult,
    SkillPackage,
    SkillVersion,
    SkillVersionDetail,
    SkillSourceFile,
    SkillStageTemplate,
    SkillTrialInput,
    SkillTrialResult,
} from "@/services/api/admin-skills";
import { buildSkillFolderFormData, type SkillFolderImportFields } from "./skill-folder-form";

export type ProjectSkillCreateInput = SkillDraftInput & Pick<SkillDefinition, "name" | "summary"> & { projectId: string };
export type ProjectSkillCopyInput = { projectId: string; name: string; version: string };
export type ProjectSkillResolved = { skill: SkillDefinition; version: SkillVersion; package: SkillPackage };
export type ProjectSkillEvaluationInput = { workflowRunId: string; sourceAgentRunId?: string; baselineVersionId?: string; confirmApiCost: boolean };

const skillPath = (id: string) => `/api/v1/skills/${encodeURIComponent(id)}`;
const versionPath = (id: string) => `/api/v1/skill-versions/${encodeURIComponent(id)}`;

export function fetchProjectSkills(token: string, projectId: string) {
    return apiGet<SkillAdminItem[]>("/api/v1/skills", { projectId }, token);
}

export function fetchProjectSkillStageTemplates(token: string) {
    return apiGet<SkillStageTemplate[]>("/api/v1/skill-stage-templates", undefined, token);
}

export function importProjectSkillFolder(token: string, files: File[], input: SkillFolderImportFields) {
    return apiPostForm<ProjectSkillResolved>("/api/v1/skills/import-folder", buildSkillFolderFormData(files, input), token);
}

export function importProjectSkillFolderVersion(token: string, skillId: string, files: File[], version?: string) {
    return apiPostForm<SkillVersion>(`${skillPath(skillId)}/import-version`, buildSkillFolderFormData(files, { ownerType: "project", stageKey: "version", version }), token);
}

export function createProjectSkill(token: string, input: ProjectSkillCreateInput) {
    return apiPost<ProjectSkillResolved>("/api/v1/skills", input, token);
}

export function updateProjectSkill(token: string, id: string, input: Partial<Pick<SkillDefinition, "name" | "summary" | "enabled">>) {
    return apiPatch<SkillDefinition>(skillPath(id), input, token);
}

export function deleteProjectSkill(token: string, id: string) {
    return apiDelete<{ deleted: boolean }>(skillPath(id), token);
}

export function copySystemSkillToProject(token: string, id: string, input: ProjectSkillCopyInput) {
    return apiPost<ProjectSkillResolved>(`${skillPath(id)}/copy`, input, token);
}

export function createProjectSkillVersion(token: string, skillId: string, input: SkillDraftInput) {
    return apiPost<SkillVersion>(`${skillPath(skillId)}/versions`, input, token);
}

export function fetchProjectSkillVersion(token: string, id: string) {
    return apiGet<SkillVersionDetail>(versionPath(id), undefined, token);
}

export function fetchProjectSkillSourceFiles(token: string, id: string) {
    return apiGet<SkillSourceFile[]>(`${versionPath(id)}/source-files`, undefined, token);
}

export function fetchProjectSkillSourceText(token: string, id: string, path: string) {
    return apiGet<{ path: string; content: string }>(`${versionPath(id)}/source-file`, { path }, token);
}

export function updateProjectSkillVersion(token: string, id: string, input: SkillDraftInput) {
    return apiPatch<SkillVersion>(versionPath(id), input, token);
}

export function deleteProjectSkillVersion(token: string, id: string) {
    return apiDelete<{ deleted: boolean }>(versionPath(id), token);
}

export function validateProjectSkillVersion(token: string, id: string) {
    return apiPost<{ valid: boolean; versionId: string; contentHash: string }>(`${versionPath(id)}/validate`, {}, token);
}

export function evaluateProjectSkillVersion(token: string, id: string, input: ProjectSkillEvaluationInput) {
    return apiPost<SkillEvaluationResult>(`${versionPath(id)}/evaluations`, input, token);
}

export function trialProjectSkillVersion(token: string, id: string, input: SkillTrialInput) {
    return apiPost<SkillTrialResult>(`${versionPath(id)}/trials`, input, token);
}

export function fetchProjectSkillTrial(token: string, id: string) {
    return apiGet<SkillTrialResult>(`/api/v1/skill-trials/${encodeURIComponent(id)}`, undefined, token);
}

export function publishProjectSkillVersion(token: string, id: string) {
    return apiPost<ProjectSkillResolved>(`${versionPath(id)}/publish`, {}, token);
}

export function recommendProjectSkillVersion(token: string, skillId: string, skillVersionId: string) {
    return apiPut<ProjectSkillResolved>(`${skillPath(skillId)}/recommended-version`, { skillVersionId }, token);
}

export function archiveProjectSkillVersion(token: string, id: string) {
    return apiPost<SkillVersion>(`${versionPath(id)}/archive`, {}, token);
}
