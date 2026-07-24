import type { Asset } from "@/stores/use-asset-store";

export type AssetTypeGroup = {
    id: string;
    title: string;
    assets: Asset[];
};

export function buildAssetTypeGroups(assets: Asset[]): AssetTypeGroup[] {
    const groups = new Map<string, AssetTypeGroup>();
    assets.forEach((asset) => {
        const title = workflowAssetType(asset) || assetKindLabel(asset.kind);
        const id = normalizeAssetTypeGroupId(title);
        const group = groups.get(id) || { id, title, assets: [] };
        group.assets.push(asset);
        groups.set(id, group);
    });
    return Array.from(groups.values()).sort((a, b) => assetTypeSortIndex(a.title) - assetTypeSortIndex(b.title) || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

function workflowAssetType(asset: Asset) {
    const workflow = asset.metadata?.originalWorkflow;
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return "";
    const type = (workflow as Record<string, unknown>).type;
    return typeof type === "string" ? type.trim() : "";
}

function assetKindLabel(kind: Asset["kind"]) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "文本";
}

export function assetTypeGroupDomId(projectId: string, typeId: string) {
    return `asset-group-${normalizeAssetTypeGroupId(projectId)}-${normalizeAssetTypeGroupId(typeId)}`;
}

function normalizeAssetTypeGroupId(value: string) {
    return value.replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5-]/g, "") || "asset";
}

function assetTypeSortIndex(title: string) {
    const order = ["角色", "人物", "场景", "环境", "道具", "服装", "妆发", "图片", "视频", "音频", "文本"];
    const index = order.findIndex((item) => title.includes(item));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}
