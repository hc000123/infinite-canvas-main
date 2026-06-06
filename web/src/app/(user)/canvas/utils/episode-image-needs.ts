import type { Asset } from "@/stores/use-asset-store";
import type { AssetBreakdownItem } from "./asset-breakdown";
import type { ImageBrief, ImageBriefKind } from "./image-brief";

export type EpisodeImageNeedKind = "character" | "scene" | "prop" | "costume" | "makeup" | "mood" | "effect";

export type EpisodeImageNeedRow = {
    item: AssetBreakdownItem;
    kind: EpisodeImageNeedKind;
    kindLabel: string;
    sourceLabel: string;
    suggestedBriefKind: ImageBriefKind | "";
    brief?: ImageBrief;
    hasBrief: boolean;
    resultAssetIds: string[];
    resultAssetCount: number;
    primaryAsset?: Asset;
    statusLabel: string;
};

const episodeImageNeedKindLabels: Record<EpisodeImageNeedKind, string> = {
    character: "角色",
    scene: "场景",
    prop: "道具",
    costume: "服装",
    makeup: "妆发",
    mood: "氛围",
    effect: "特效",
};

export function episodeImageNeedKind(item: Pick<AssetBreakdownItem, "kind" | "agentAssetKind">): EpisodeImageNeedKind {
    if (isEpisodeImageNeedKind(item.agentAssetKind)) return item.agentAssetKind;
    if (item.kind === "style") return "mood";
    return item.kind;
}

export function findImageBriefForAssetBreakdown(item: Pick<AssetBreakdownItem, "id" | "briefId">, briefs: ImageBrief[]) {
    return (item.briefId ? briefs.find((brief) => brief.id === item.briefId) : undefined) || briefs.find((brief) => brief.sourceType === "asset_breakdown" && brief.sourceId === item.id);
}

export function buildEpisodeImageNeedRows({ projectId, canvasId, episodeId, items, briefs, assets }: { projectId: string; canvasId?: string; episodeId?: string; items: AssetBreakdownItem[]; briefs: ImageBrief[]; assets: Asset[] }): EpisodeImageNeedRow[] {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    return items
        .filter((item) => item.projectId === projectId && (!canvasId || item.canvasId === canvasId) && (!episodeId || item.episodeId === episodeId))
        .map((item) => {
            const brief = findImageBriefForAssetBreakdown(item, briefs);
            const resultAssetIds = uniqueStrings([...(brief?.resultAssetIds || []), ...(item.assetIds || [])]);
            const primaryAssetId = brief?.primaryAssetId || resultAssetIds[0];
            const kind = episodeImageNeedKind(item);
            return {
                item,
                kind,
                kindLabel: episodeImageNeedKindLabels[kind],
                sourceLabel: episodeImageNeedSourceLabel(item.sourceType),
                suggestedBriefKind: isImageBriefKind(item.suggestedBriefKind) ? item.suggestedBriefKind : "",
                brief,
                hasBrief: Boolean(brief),
                resultAssetIds,
                resultAssetCount: resultAssetIds.length,
                primaryAsset: primaryAssetId ? assetsById.get(primaryAssetId) : undefined,
                statusLabel: episodeImageNeedStatusLabel(item, brief, resultAssetIds.length),
            };
        });
}

export function episodeImageNeedStatusLabel(item: Pick<AssetBreakdownItem, "status">, brief: ImageBrief | undefined, resultAssetCount: number) {
    if (item.status === "generated" || resultAssetCount > 0) return "已生成";
    if (item.status === "linked") return "已关联";
    if (brief || item.status === "brief_ready") return "Brief 已创建";
    return "草稿";
}

export function summarizeEpisodeImageNeed(row: Pick<EpisodeImageNeedRow, "kindLabel" | "sourceLabel" | "resultAssetCount" | "statusLabel" | "primaryAsset">) {
    return {
        title: `${row.kindLabel} · ${row.statusLabel}`,
        sourceLabel: row.sourceLabel,
        resultLabel: row.resultAssetCount ? `结果素材 ${row.resultAssetCount}` : "暂无结果素材",
        primaryAssetTitle: row.primaryAsset?.title || "",
    };
}

export function episodeImageNeedKindLabel(kind: EpisodeImageNeedKind) {
    return episodeImageNeedKindLabels[kind];
}

function episodeImageNeedSourceLabel(sourceType?: string) {
    if (sourceType === "agent_asset_extractor") return "Agent 提取";
    if (sourceType === "manual") return "手动";
    return "资产拆解";
}

function isEpisodeImageNeedKind(value: unknown): value is EpisodeImageNeedKind {
    return value === "character" || value === "scene" || value === "prop" || value === "costume" || value === "makeup" || value === "mood" || value === "effect";
}

function isImageBriefKind(value: unknown): value is ImageBriefKind {
    return value === "scene" || value === "character" || value === "prop" || value === "mood";
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
