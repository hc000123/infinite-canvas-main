import type { Asset, ImageAsset } from "@/stores/use-asset-store";

export type WorkflowReferenceImage = {
    asset: ImageAsset;
    id: string;
    kind: "character" | "scene" | "prop";
    label: string;
    logicalAssetId?: string;
    parentLogicalAssetId?: string;
    variantName?: string;
    version: string;
};

const KIND_ORDER = { character: 0, scene: 1, prop: 2 } as const;

export function workflowReferenceImages(assets: Asset[], projectId: string, episodeId: string) {
    return assets
        .flatMap((asset): WorkflowReferenceImage[] => {
            if (asset.kind !== "image") return [];
            const source = readRecord(asset.metadata?.originalWorkflow);
            if (readString(source?.role) === "continuity_reference") return [];
            const sourceProjectId = readString(source?.projectId) || readString(source?.sourceProjectId);
            const sourceEpisodeId = readString(source?.episode) || readString(source?.sourceEpisodeId);
            const kind = normalizeReferenceKind(readString(source?.kind) || readString(source?.type));
            if (sourceProjectId !== projectId || sourceEpisodeId !== episodeId || !kind) return [];
            return [{
                asset,
                id: asset.id,
                kind,
                label: readString(source?.name) || asset.title,
                logicalAssetId: readString(source?.logicalAssetId) || undefined,
                parentLogicalAssetId: readString(source?.parentLogicalAssetId) || undefined,
                variantName: readString(source?.variantName) || undefined,
                version: readString(source?.version) || asset.updatedAt,
            }];
        })
        .sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || left.label.localeCompare(right.label, "zh-CN") || left.id.localeCompare(right.id))
        .slice(0, 9);
}

export async function workflowReferenceBlob(reference: WorkflowReferenceImage, getStoredImage: (storageKey: string) => Promise<Blob | null>) {
    if (reference.asset.data.storageKey) {
        const stored = await getStoredImage(reference.asset.data.storageKey);
        if (stored) return stored;
    }
    const url = reference.asset.data.dataUrl || reference.asset.coverUrl;
    if (!url) throw new Error(`参考图“${reference.label}”的本地文件已丢失`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`参考图“${reference.label}”读取失败`);
    return response.blob();
}

function normalizeReferenceKind(value: string): WorkflowReferenceImage["kind"] | "" {
    const normalized = value.toLowerCase();
    if (["character", "costume", "角色", "人物", "服装"].includes(normalized)) return "character";
    if (["scene", "场景", "环境"].includes(normalized)) return "scene";
    if (["prop", "道具", "物件"].includes(normalized)) return "prop";
    return "";
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
