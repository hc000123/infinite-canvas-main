import type { Asset, ImageAsset, VideoAsset } from "../../../stores/use-asset-store.ts";

export type CompactMediaAsset = ImageAsset | VideoAsset;

export function isCompactMediaAssetGroup(assets: Asset[]): assets is CompactMediaAsset[] {
    return assets.length > 0 && assets.every((asset) => asset.kind === "image" || asset.kind === "video");
}
