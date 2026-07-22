import type { Asset } from "../../../stores/use-asset-store.ts";

type AssetBlobReaders = {
    getImageBlob: (storageKey: string) => Promise<Blob | null>;
    getMediaBlob: (storageKey: string) => Promise<Blob | null>;
};

export async function resolveAssetDownloadTarget(asset: Asset, readers: AssetBlobReaders) {
    if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return null;
    if (asset.data.storageKey) {
        const blob = await (asset.kind === "image" ? readers.getImageBlob(asset.data.storageKey) : readers.getMediaBlob(asset.data.storageKey));
        if (blob) return blob;
    }
    return asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
}
