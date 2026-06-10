import type { Asset } from "@/stores/use-asset-store";

import { workflowMappingPreviewItemKey } from "../../../../../agent-runner-workflow-apply-common";
import type { AgentWorkflowMappingPreview } from "../../../../../agent-runner-types";
import type { EpisodeAssetFilter, EpisodeAssetRow } from "./episode-assets-module-types";

export function summarizeEpisodeExtractedAssets(assets: EpisodeAssetRow[]) {
    return {
        characters: assets.filter((asset) => asset.type === "角色").length,
        costumes: assets.filter((asset) => asset.type === "服装").length,
        missing: assets.filter((asset) => asset.status === "缺素材" || asset.status === "待生成").length,
        props: assets.filter((asset) => asset.type === "道具").length,
        scenes: assets.filter((asset) => asset.type === "场景").length,
    };
}

export function filterEpisodeExtractedAssets(asset: EpisodeAssetRow, filter: EpisodeAssetFilter) {
    if (filter === "全部") return true;
    if (filter === "角色" || filter === "场景" || filter === "道具" || filter === "服装") return asset.type === filter;
    if (filter === "缺素材") return asset.status === "缺素材" || asset.status === "待生成";
    if (filter === "已绑定") return asset.status === "已绑定";
    if (filter === "待生成") return asset.status === "待生成";
    return true;
}

export function filterAssetCandidates(candidates: Asset[], search: string, kindFilter: "全部" | "图片" | "文本" | "视频") {
    const keyword = search.trim().toLowerCase();
    return candidates.filter((asset) => {
        const kindMatched = kindFilter === "全部" || assetKindDisplay(asset.kind) === kindFilter;
        if (!kindMatched) return false;
        if (!keyword) return true;
        return `${asset.title} ${asset.tags.join(" ")} ${asset.note || ""}`.toLowerCase().includes(keyword);
    });
}

export function assetKindDisplay(kind: Asset["kind"]) {
    const labels: Record<Asset["kind"], string> = {
        audio: "音频",
        image: "图片",
        text: "文本",
        video: "视频",
    };
    return labels[kind];
}

export function assetVersionSummary(asset: Asset) {
    const versions = Array.isArray(asset.metadata?.assetVersions) ? asset.metadata.assetVersions : [];
    return versions.length ? `版本 ${versions.length}` : "版本 1";
}

export function previewCounts(preview: AgentWorkflowMappingPreview, appliedPreviewItemIds: string[]) {
    const creatable = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
    const applied = creatable.filter((item) => appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
    return { total: creatable.length, applied, pending: creatable.length - applied };
}

export function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}
