import { getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import { getImageBlob, resolveImageUrl } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";
import type { AssetVersionRecord } from "./asset-version-history";
import type { OutdatedAssetVersionUsage } from "./asset-version-outdated-references";

export type AssetPatch = Partial<Omit<Asset, "id" | "createdAt">>;

export async function resolveRestoredAssetPatch(patch: AssetPatch): Promise<AssetPatch> {
    const data = patch.data as Record<string, unknown> | undefined;
    const storageKey = typeof data?.storageKey === "string" ? data.storageKey : "";
    if (patch.kind === "image" && storageKey) {
        const dataUrl = await resolveImageUrl(storageKey, typeof data?.dataUrl === "string" ? data.dataUrl : "");
        return { ...patch, coverUrl: patch.coverUrl || dataUrl, data: { ...data, dataUrl } } as AssetPatch;
    }
    if ((patch.kind === "video" || patch.kind === "audio") && storageKey) {
        const url = await resolveMediaUrl(storageKey, typeof data?.url === "string" ? data.url : "");
        return { ...patch, data: { ...data, url } } as AssetPatch;
    }
    return patch;
}

export async function resolveAssetVersionDownloadTarget(version: AssetVersionRecord) {
    if (version.kind === "text") return new Blob([readVersionString(version.data.content)], { type: "text/plain;charset=utf-8" });
    const storageKey = readVersionString(version.data.storageKey);
    if (version.kind === "image") {
        if (storageKey) {
            const blob = await getImageBlob(storageKey);
            if (blob) return blob;
        }
        return readVersionString(version.data.dataUrl) || version.coverUrl;
    }
    if (storageKey) {
        const blob = await getMediaBlob(storageKey);
        if (blob) return blob;
    }
    return readVersionString(version.data.url);
}

export function assetVersionFileName(asset: Asset, version: AssetVersionRecord) {
    const mimeType = readVersionString(version.data.mimeType);
    const extension = mimeType.split("/")[1] || (version.kind === "text" ? "txt" : "bin");
    return `${safeFileName(asset.title || version.title || "asset")}-v${version.versionNumber}.${extension}`;
}

export function canvasProjectIdFromUsage(usage: OutdatedAssetVersionUsage) {
    return usage.id.startsWith("canvas:") ? usage.id.split(":")[1] || "" : "";
}

function readVersionString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]+/g, "_").trim() || "asset";
}
