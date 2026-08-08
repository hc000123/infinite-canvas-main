import type { Asset } from "../../../stores/use-asset-store.ts";
import { isGalleryMediaAsset, type GalleryMediaAsset } from "./asset-gallery.ts";

export type CompactMediaAsset = GalleryMediaAsset;

export function isCompactMediaAssetGroup(assets: Asset[]): assets is CompactMediaAsset[] {
    return assets.length > 0 && assets.every(isGalleryMediaAsset);
}
