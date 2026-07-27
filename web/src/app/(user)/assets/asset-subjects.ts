import type { Asset, AssetBinding, AssetCategory, AssetSubject } from "@/stores/use-asset-store";

const CATEGORY_PREFIX: Record<AssetCategory, string> = { character: "CHAR", scene: "SCENE", prop: "PROP", other: "OTHER" };

export function assetCategoryLabel(category: AssetCategory) {
    if (category === "character") return "角色";
    if (category === "scene") return "场景";
    if (category === "prop") return "道具";
    return "其他";
}

export function nextAssetSubjectCode(subjects: AssetSubject[], projectId: string, category: AssetCategory) {
    const prefix = CATEGORY_PREFIX[category];
    const max = subjects.filter((subject) => subject.projectId === projectId && subject.category === category).reduce((value, subject) => Math.max(value, Number(subject.code.match(/(\d+)$/)?.[1] || 0)), 0);
    return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function normalizeAssetBinding(binding: AssetBinding, subjects: AssetSubject[], projectEpisodeIds: ReadonlySet<string>) {
    const subject = subjects.find((item) => item.id === binding.subjectId && item.projectId === binding.projectId && item.category === binding.category);
    if (!subject) throw new Error("请选择当前项目中的资产主体");
    const variantName = binding.variantName.trim();
    if (!variantName) throw new Error("请填写图片形态名称");
    const episodeIds = binding.allEpisodes ? [] : Array.from(new Set(binding.episodeIds.filter((id) => projectEpisodeIds.has(id))));
    if (!binding.allEpisodes && !episodeIds.length) throw new Error("请选择至少一个适用集数");
    return { ...binding, variantName, allEpisodes: binding.allEpisodes, episodeIds };
}

export function ensureAssetSubject(subjects: AssetSubject[], input: { projectId: string; category: AssetCategory; code?: string; sourceKey?: string; name: string; tags?: string[] }, id: string, now: string) {
    const code = input.code?.trim().toUpperCase();
    const name = input.name.trim();
    const existing = subjects.find((subject) => subject.projectId === input.projectId && subject.category === input.category && ((input.sourceKey && subject.sourceKey === input.sourceKey) || (code && subject.code === code) || subject.name === name));
    if (existing) return { created: false, subject: existing };
    return {
        created: true,
        subject: {
            id,
            projectId: input.projectId,
            category: input.category,
            code: code || nextAssetSubjectCode(subjects, input.projectId, input.category),
            name,
            tags: Array.from(new Set(input.tags || [])),
            createdAt: now,
            updatedAt: now,
        } satisfies AssetSubject,
    };
}

export function assetsForEpisode(assets: Asset[], projectId: string, episodeId: string) {
    return assets.filter((asset) => asset.kind === "image" && asset.assetBinding?.projectId === projectId && (asset.assetBinding.allEpisodes || asset.assetBinding.episodeIds.includes(episodeId)));
}

export function subjectAssetGroups(subjects: AssetSubject[], assets: Asset[], projectId: string) {
    return subjects
        .filter((subject) => subject.projectId === projectId)
        .map((subject) => ({ subject, assets: assets.filter((asset) => asset.kind === "image" && asset.assetBinding?.subjectId === subject.id) }))
        .filter((group) => group.assets.length);
}

export function defaultAssetVariantName(category: AssetCategory) {
    return category === "character" ? "基础形象" : "基础状态";
}
