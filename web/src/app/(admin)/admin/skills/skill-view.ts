import type { SkillAdminItem, SkillEvaluation, SkillPackage, SkillVersion } from "@/services/api/admin-skills.ts";

export type SkillFilter = {
    search: string;
    capability: string;
    inputArtifactType: string;
    outputArtifactType: string;
    projectTag: string;
    ownerType: "" | "system" | "project";
};

export function canPublishSkill(input: { version: SkillVersion; packageValue: SkillPackage; evaluations: SkillEvaluation[] }) {
    if (input.version.status !== "draft") return false;
    if (input.packageValue.manifest.estimatedCostClass === "none") return true;
    return input.evaluations.some((item) => item.skillVersionId === input.version.id && item.status === "passed" && item.contentHash === input.version.contentHash);
}

export function filterSkillItems(items: SkillAdminItem[], filter: SkillFilter) {
    const search = filter.search.trim().toLowerCase();
    return items
        .filter(({ skill, recommendedPackage }) => {
            const manifest = recommendedPackage?.manifest;
            return (
                (!search || `${skill.name} ${skill.summary}`.toLowerCase().includes(search)) &&
                (!filter.ownerType || skill.ownerType === filter.ownerType) &&
                (!filter.capability || manifest?.capabilities.includes(filter.capability)) &&
                (!filter.inputArtifactType || manifest?.inputArtifactTypes.includes(filter.inputArtifactType)) &&
                (!filter.outputArtifactType || manifest?.outputArtifactTypes.includes(filter.outputArtifactType)) &&
                (!filter.projectTag || manifest?.projectTags.includes(filter.projectTag))
            );
        })
        .sort((left, right) => left.skill.ownerType.localeCompare(right.skill.ownerType) || left.skill.name.localeCompare(right.skill.name, "zh-CN") || right.skill.updatedAt.localeCompare(left.skill.updatedAt));
}

export function latestPassingEvaluation(version: SkillVersion | undefined, evaluations: SkillEvaluation[]) {
    if (!version) return undefined;
    return evaluations.find((item) => item.skillVersionId === version.id && item.status === "passed" && item.contentHash === version.contentHash);
}

export function nextPatchVersion(value: string) {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return "1.0.1";
    return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function nextDraftVersion(sourceVersion?: string) {
    return sourceVersion ? nextPatchVersion(sourceVersion) : "1.0.0";
}

export function shortSkillHash(value: string) {
    return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "未生成";
}

export function resolveRecommendationLabel(item: SkillAdminItem, version?: SkillVersion) {
    if (!version) return "未选择版本";
    if (version.id === item.skill.recommendedVersionId) return "当前推荐版";
    if (version.status === "draft") return "草稿候选版";
    if (version.status === "archived") return "已停用";
    return "可切换推荐版";
}

export function skillLifecycleLabel(version: SkillVersion, hasPassingTrial: boolean, recommended: boolean) {
    if (version.status === "archived") return "已停用";
    if (recommended) return "推荐";
    if (version.status === "published" && hasPassingTrial) return "可使用";
    return "待试跑";
}
