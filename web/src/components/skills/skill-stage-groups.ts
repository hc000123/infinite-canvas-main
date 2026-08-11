import type { SkillAdminItem } from "@/services/api/admin-skills.ts";

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
        }];
    });
}

export function resolveOpenSkillStageKeys(groups: SkillStageGroup[], activeSkillId: string, expandAll: boolean) {
    if (expandAll) return groups.map((group) => group.key);
    const activeGroup = groups.find((group) => group.items.some((item) => item.skill.id === activeSkillId));
    return activeGroup ? [activeGroup.key] : groups[0] ? [groups[0].key] : [];
}
