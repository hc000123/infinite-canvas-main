import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/services/api/request";
import type {
    SkillAdminItem,
    SkillDefinition,
    SkillDraftInput,
    SkillEvaluationResult,
    SkillPackage,
    SkillVersion,
    SkillVersionDetail,
} from "@/services/api/admin-skills";

export type ProjectSkillCreateInput = SkillDraftInput & Pick<SkillDefinition, "name" | "summary"> & { projectId: string };
export type ProjectSkillCopyInput = { projectId: string; name: string; version: string };
export type ProjectSkillResolved = { skill: SkillDefinition; version: SkillVersion; package: SkillPackage };
export type ProjectSkillEvaluationInput = { workflowRunId: string; sourceAgentRunId?: string; baselineVersionId?: string; confirmApiCost: boolean };

const skillPath = (id: string) => `/api/v1/skills/${encodeURIComponent(id)}`;
const versionPath = (id: string) => `/api/v1/skill-versions/${encodeURIComponent(id)}`;

export function fetchProjectSkills(token: string, projectId: string) {
    return apiGet<SkillAdminItem[]>("/api/v1/skills", { projectId }, token);
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

export function publishProjectSkillVersion(token: string, id: string) {
    return apiPost<ProjectSkillResolved>(`${versionPath(id)}/publish`, {}, token);
}

export function recommendProjectSkillVersion(token: string, skillId: string, skillVersionId: string) {
    return apiPut<ProjectSkillResolved>(`${skillPath(skillId)}/recommended-version`, { skillVersionId }, token);
}

export function archiveProjectSkillVersion(token: string, id: string) {
    return apiPost<SkillVersion>(`${versionPath(id)}/archive`, {}, token);
}
