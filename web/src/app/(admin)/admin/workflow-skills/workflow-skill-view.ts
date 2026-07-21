import type { WorkflowSkillAdminItem, WorkflowSkillEvaluation, WorkflowSkillStageKey, WorkflowSkillVersion } from "@/services/api/admin-workflow-skills";

export const workflowSkillStageLabels: Record<WorkflowSkillStageKey, string> = {
    script: "剧本整理",
    art: "美术设计",
    assets: "素材准备",
    storyboard: "分镜提示词",
    video: "视频生成",
    delivery: "成片交付",
};

export const workflowSkillStageNumbers: Record<WorkflowSkillStageKey, string> = {
    script: "01",
    art: "02",
    assets: "03",
    storyboard: "04",
    video: "05",
    delivery: "06",
};

const aiStages = new Set<WorkflowSkillStageKey>(["script", "art", "storyboard"]);
const stageOrder: WorkflowSkillStageKey[] = ["script", "art", "assets", "storyboard", "video", "delivery"];

export function sortWorkflowSkillItems(items: WorkflowSkillAdminItem[]) {
    return [...items].sort((left, right) => stageOrder.indexOf(left.skill.stageKey) - stageOrder.indexOf(right.skill.stageKey));
}

export function resolveBindingLabel(binding: { global?: string; project?: string }) {
    if (binding.project) return `项目灰度 · ${binding.project}`;
    if (binding.global) return `全局 · ${binding.global}`;
    return "未绑定";
}

export function canPublishSkill(input: { stageKey: WorkflowSkillStageKey; version: WorkflowSkillVersion; evaluations: WorkflowSkillEvaluation[] }) {
    if (input.version.status !== "draft") return false;
    if (!aiStages.has(input.stageKey)) return true;
    return input.evaluations.some((item) => item.skillVersionId === input.version.id && item.status === "passed" && item.contentHash === input.version.contentHash);
}

export function latestPassingEvaluation(version: WorkflowSkillVersion | undefined, evaluations: WorkflowSkillEvaluation[]) {
    if (!version) return undefined;
    return evaluations.find((item) => item.skillVersionId === version.id && item.status === "passed" && item.contentHash === version.contentHash);
}

export function nextPatchVersion(value: string) {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return "1.0.1";
    return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function shortWorkflowHash(value: string) {
    return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "未生成";
}
