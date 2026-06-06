import type { Asset } from "@/stores/use-asset-store";
import { buildAssetVersionReference, preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references.ts";
import type { AssetBreakdownItem } from "./asset-breakdown.ts";
import { episodeImageNeedKind } from "./episode-image-needs.ts";
import type { ImageBrief } from "./image-brief.ts";
import type { ShotGroup, StoryboardAssetKind, StoryboardAssetRef, StoryboardTableShot } from "./storyboard-management.ts";

export type EpisodeReferenceSourceType = "agent_asset_extractor" | "manual" | "independent_image_brief" | "production_bible" | "asset_breakdown" | "unknown";

export type ShotGroupEpisodeReferenceCandidate = {
    assetId: string;
    assetTitle: string;
    kind: StoryboardAssetKind;
    role: string;
    sourceType: EpisodeReferenceSourceType;
    sourceLabel: string;
    defaultSelected: boolean;
    isPrimary: boolean;
    assetBreakdownItemId?: string;
    imageBriefId?: string;
    needName?: string;
    needKind?: string;
    assetVersion?: StoryboardAssetRef["assetVersion"];
    matchReasons: string[];
    score: number;
};

type AssetLike = Pick<Asset, "id" | "kind" | "title" | "updatedAt" | "metadata"> & { coverUrl?: string };

export function buildShotGroupEpisodeReferenceCandidates({
    group,
    shots,
    imageNeeds,
    briefs,
    assets,
}: {
    group: ShotGroup;
    shots: StoryboardTableShot[];
    imageNeeds: AssetBreakdownItem[];
    briefs: ImageBrief[];
    assets: AssetLike[];
}): ShotGroupEpisodeReferenceCandidate[] {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const context = buildShotGroupMatchContext(group, shots);
    return imageNeeds
        .filter((need) => need.projectId === group.projectId && need.episodeId === group.episodeId)
        .flatMap((need) => {
            const brief = findBriefForNeed(need, briefs);
            const resultAssetId = brief?.primaryAssetId || brief?.resultAssetIds[0] || need.assetIds[0];
            const asset = resultAssetId ? assetsById.get(resultAssetId) : undefined;
            if (!asset || asset.kind !== "image") return [];
            const match = matchNeedToShotGroup(need, group, context);
            if (!match.reasons.length) return [];
            const sourceType = episodeReferenceSourceType(need, brief);
            return [
                {
                    assetId: asset.id,
                    assetTitle: asset.title,
                    kind: "image" as const,
                    role: "episode_reference",
                    sourceType,
                    sourceLabel: episodeReferenceSourceLabel(sourceType),
                    defaultSelected: sourceType !== "unknown",
                    isPrimary: Boolean(brief?.primaryAssetId && brief.primaryAssetId === asset.id),
                    assetBreakdownItemId: need.id,
                    imageBriefId: brief?.id,
                    needName: need.name,
                    needKind: episodeImageNeedKind(need),
                    assetVersion: buildAssetVersionReference({ id: asset.id, updatedAt: asset.updatedAt || "", metadata: asset.metadata }),
                    matchReasons: match.reasons,
                    score: match.score + (brief?.primaryAssetId ? 20 : 0) + (brief?.resultAssetIds.length ? 8 : 0),
                },
            ];
        })
        .sort((a, b) => b.score - a.score || Number(b.isPrimary) - Number(a.isPrimary) || a.assetTitle.localeCompare(b.assetTitle));
}

export function selectedEpisodeReferenceRefs(candidates: ShotGroupEpisodeReferenceCandidate[]): StoryboardAssetRef[] {
    return candidates
        .filter((candidate) => candidate.defaultSelected)
        .map((candidate) => ({
            assetId: candidate.assetId,
            kind: candidate.kind,
            role: candidate.role,
            source: candidate.sourceType,
            sourceLabel: candidate.sourceLabel,
            assetVersion: candidate.assetVersion,
            isAutoMatched: true,
            isPrimaryReference: candidate.isPrimary,
            assetBreakdownItemId: candidate.assetBreakdownItemId,
            imageBriefId: candidate.imageBriefId,
            matchReasons: candidate.matchReasons,
        }));
}

export function mergeShotGroupReferenceRefs({ manualRefs, autoRefs, assets }: { manualRefs: StoryboardAssetRef[]; autoRefs: StoryboardAssetRef[]; assets: AssetLike[] }): StoryboardAssetRef[] {
    const refsById = new Map<string, StoryboardAssetRef>();
    for (const ref of preserveOrCreateAssetVersionReferences(manualRefs, assets)) {
        refsById.set(ref.assetId, ref);
    }
    for (const ref of preserveOrCreateAssetVersionReferences(autoRefs, assets)) {
        if (refsById.has(ref.assetId)) continue;
        refsById.set(ref.assetId, ref);
    }
    return Array.from(refsById.values());
}

export function episodeReferenceSourceLabel(sourceType: EpisodeReferenceSourceType) {
    if (sourceType === "agent_asset_extractor") return "Agent 提取";
    if (sourceType === "manual") return "手动";
    if (sourceType === "independent_image_brief") return "独立 Brief";
    if (sourceType === "production_bible") return "设定库";
    if (sourceType === "asset_breakdown") return "资产拆解";
    return "来源待确认";
}

export function summarizeEpisodeReferenceCandidates(candidates: ShotGroupEpisodeReferenceCandidate[]) {
    const selectedCount = candidates.filter((candidate) => candidate.defaultSelected).length;
    return {
        candidateCount: candidates.length,
        selectedCount,
        label: selectedCount ? `将带入 ${selectedCount} 个本集参考资产` : candidates.length ? `${candidates.length} 个参考资产需要确认来源` : "暂无可自动带入的本集参考资产",
    };
}

function buildShotGroupMatchContext(group: ShotGroup, shots: StoryboardTableShot[]) {
    const groupShots = shots.filter((shot) => group.shotIds.includes(shot.id));
    const text = [
        group.sceneName,
        group.prompt,
        group.effectivePrompt,
        ...groupShots.flatMap((shot) => [shot.sceneName, shot.location, shot.scriptText, shot.visualDescription, shot.action, shot.dialogue, shot.emotion, shot.shotSize, shot.cameraMovement, ...(shot.characters || []), ...(shot.assetNeeds || [])]),
    ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
    const needKinds = new Set(groupShots.flatMap((shot) => (shot.assetNeeds || []).map((need) => need.toLowerCase())));
    return { text, needKinds, productionBibleItemIds: new Set([...(group.productionBibleRefs || []).map((ref) => ref.itemId), ...groupShots.flatMap((shot) => (shot.productionBibleRefs || []).map((ref) => ref.itemId))]) };
}

function matchNeedToShotGroup(need: AssetBreakdownItem, group: ShotGroup, context: ReturnType<typeof buildShotGroupMatchContext>) {
    const reasons: string[] = [];
    let score = 0;
    const normalizedName = normalize(need.name);
    if (normalizedName && context.text.includes(normalizedName)) {
        reasons.push(`名称命中：${need.name}`);
        score += 40;
    }
    const kind = episodeImageNeedKind(need);
    if (Array.from(context.needKinds).some((value) => value.includes(kind) || value.includes(kindLabel(kind)))) {
        reasons.push(`类型命中：${kindLabel(kind)}`);
        score += 18;
    }
    if (need.productionBibleItemId && context.productionBibleItemIds.has(need.productionBibleItemId)) {
        reasons.push("设定库引用命中");
        score += 28;
    }
    const descriptionHit = [need.description, need.sourceText, ...need.tags].flatMap((value) => keywords(value)).find((word) => context.text.includes(word));
    if (descriptionHit) {
        reasons.push(`描述命中：${descriptionHit}`);
        score += 12;
    }
    if (need.projectId === group.projectId) score += 10;
    if (need.episodeId === group.episodeId) score += 10;
    return { reasons, score };
}

function findBriefForNeed(need: AssetBreakdownItem, briefs: ImageBrief[]) {
    return (
        (need.briefId ? briefs.find((brief) => brief.id === need.briefId && brief.projectId === need.projectId && brief.episodeId === need.episodeId) : undefined) ||
        briefs.find((brief) => brief.sourceType === "asset_breakdown" && brief.sourceId === need.id && brief.projectId === need.projectId && brief.episodeId === need.episodeId)
    );
}

function episodeReferenceSourceType(need: AssetBreakdownItem, brief?: ImageBrief): EpisodeReferenceSourceType {
    if (need.sourceType === "agent_asset_extractor") return "agent_asset_extractor";
    if (need.sourceType === "manual") return "manual";
    if (need.sourceType === "asset_breakdown") return "asset_breakdown";
    if (brief?.sourceType === "production_bible" || need.productionBibleItemId) return "production_bible";
    if (brief && brief.sourceType !== "asset_breakdown") return "independent_image_brief";
    return "unknown";
}

function kindLabel(kind: string) {
    if (kind === "character" || kind === "costume" || kind === "makeup") return "角色";
    if (kind === "scene") return "场景";
    if (kind === "prop") return "道具";
    return "氛围";
}

function normalize(value: string) {
    return value.trim().toLowerCase();
}

function keywords(value: string | undefined) {
    return (value || "")
        .toLowerCase()
        .split(/[\s,，。；;、：:\n]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 8);
}
