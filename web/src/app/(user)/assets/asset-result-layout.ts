import type { Asset, VideoAsset } from "../../../stores/use-asset-store.ts";

export function isCompactVideoAssetGroup(assets: Asset[]): assets is VideoAsset[] {
    return assets.length > 0 && assets.every((asset) => asset.kind === "video");
}
