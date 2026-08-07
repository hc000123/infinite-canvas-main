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

export type SkillStageGroupKey = "script" | "asset-extraction" | "asset-brief" | "asset-rendition" | "storyboard" | "video" | "delivery" | "other";

const skillStageDefinitions: Array<{ key: SkillStageGroupKey; label: string }> = [
    { key: "script", label: "剧本与内容分析" },
    { key: "asset-extraction", label: "资产提取" },
    { key: "asset-brief", label: "资产设计 / Brief" },
    { key: "asset-rendition", label: "资产成图" },
    { key: "storyboard", label: "分镜" },
    { key: "video", label: "镜头提示词 / 视频" },
    { key: "delivery", label: "成片交付" },
    { key: "other", label: "其他" },
];

export type SkillStageGroup = (typeof skillStageDefinitions)[number] & {
    items: SkillAdminItem[];
    totalCount: number;
    systemCount: number;
    projectCount: number;
};

function skillStageGroupKey(item: SkillAdminItem): SkillStageGroupKey {
    const stageKey = item.skill.stageKey.trim().toLowerCase();
    if (stageKey === "script" || stageKey === "content-classifier") return "script";
    if (stageKey === "art") return "asset-extraction";
    if (stageKey === "assets" || stageKey.startsWith("asset-brief-")) return "asset-brief";
    if (stageKey.startsWith("asset-rendition-")) return "asset-rendition";
    if (stageKey === "storyboard" || stageKey.startsWith("storyboard-")) return "storyboard";
    if (stageKey === "video") return "video";
    if (stageKey === "delivery") return "delivery";

    const manifest = item.recommendedPackage?.manifest;
    const capabilities = manifest?.capabilities || [];
    const outputs = manifest?.outputArtifactTypes || [];
    if (capabilities.some((value) => value === "workflow.stage.script" || value === "content.classify") || outputs.some((value) => value === "production_script" || value === "content_profile")) return "script";
    if (capabilities.includes("workflow.stage.art") || outputs.includes("asset_catalog")) return "asset-extraction";
    if (capabilities.some((value) => value === "asset.brief.compose" || value.includes(".brief")) || outputs.includes("asset_brief")) return "asset-brief";
    if (capabilities.some((value) => value === "asset.rendition.generate" || value.includes(".rendition")) || outputs.includes("asset_rendition")) return "asset-rendition";
    if (capabilities.some((value) => value === "workflow.stage.storyboard" || value.startsWith("storyboard.")) || outputs.includes("storyboard_package")) return "storyboard";
    if (capabilities.includes("workflow.stage.video") || outputs.includes("video_prompt_package")) return "video";
    if (capabilities.includes("workflow.stage.delivery") || outputs.includes("delivery_report")) return "delivery";
    return "other";
}

export function groupSkillItemsByStage(items: SkillAdminItem[]): SkillStageGroup[] {
    const buckets = new Map<SkillStageGroupKey, SkillAdminItem[]>(skillStageDefinitions.map(({ key }) => [key, []]));
    for (const item of items) buckets.get(skillStageGroupKey(item))!.push(item);
    return skillStageDefinitions.flatMap((definition) => {
        const groupItems = buckets.get(definition.key)!;
        if (!groupItems.length) return [];
        return [{
            ...definition,
            items: groupItems,
            totalCount: groupItems.length,
            systemCount: groupItems.filter((item) => item.skill.ownerType === "system").length,
            projectCount: groupItems.filter((item) => item.skill.ownerType === "project").length,
        }];
    });
}

export function resolveOpenSkillStageKeys(groups: SkillStageGroup[], activeSkillId: string, expandAll: boolean) {
    if (expandAll) return groups.map((group) => group.key);
    const activeGroup = groups.find((group) => group.items.some((item) => item.skill.id === activeSkillId));
    return activeGroup ? [activeGroup.key] : groups[0] ? [groups[0].key] : [];
}
