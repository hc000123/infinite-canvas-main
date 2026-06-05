import { formatBytes } from "@/lib/image-utils";
import type { Asset, AssetKind } from "@/stores/use-asset-store";
import { assetGenerationSearchText } from "./asset-generation";
import { projectLibrarySearchText } from "./asset-project-library";

export function volcengineStatusLabel(status: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}

export function volcengineReviewActionLabel(status: string) {
    if (status === "Processing") return "自动刷新中";
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    return "查看状态";
}

export async function fetchImageBlob(url: string) {
    if (!url) return null;
    const response = await fetch(url);
    return response.blob();
}

export function assetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    return assetMediaInfo(asset);
}

export function assetMediaInfo(asset: Asset) {
    if (asset.kind === "text") return "";
    if (asset.kind === "audio") return `${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

export function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType, assetGenerationSearchText(asset), projectLibrarySearchText(asset)].join(" ").toLowerCase();
}

export function assetKindLabel(kind: AssetKind) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "文本";
}

export function assetKindDownloadLabel(kind: AssetKind) {
    if (kind === "video") return "下载视频";
    if (kind === "audio") return "下载音频";
    return "下载图片";
}

export function countFolderAssets(assets: Asset[]) {
    return assets.reduce<Record<string, number>>(
        (counts, asset) => {
            const key = asset.folderId || "root";
            counts[key] = (counts[key] || 0) + 1;
            return counts;
        },
        { root: 0 },
    );
}

export function isImportableAssetFile(file: File) {
    return Boolean(assetFileKind(file)) || isZipFile(file);
}

export function assetFileKind(file: File): "image" | "video" | "audio" | null {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext && ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"].includes(ext)) return "image";
    if (ext && ["mp4", "m4v", "mov", "webm"].includes(ext)) return "video";
    if (ext && ["mp3", "wav", "m4a", "ogg", "aac", "flac"].includes(ext)) return "audio";
    return null;
}

export function isZipFile(file: File) {
    return file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip");
}

export function hasImportableDragItems(dataTransfer: DataTransfer) {
    const items = Array.from(dataTransfer.items || []);
    if (!items.length) return Boolean(dataTransfer.files?.length);
    return items.some((item) => item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/") || item.type.startsWith("audio/") || item.type === "application/zip" || !item.type));
}
