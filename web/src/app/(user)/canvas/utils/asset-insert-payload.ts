import type { Asset, VolcengineAssetMetadata } from "@/stores/use-asset-store";
import { buildAssetVersionReference, type AssetVersionReference } from "../../assets/asset-version-references.ts";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string; sourceAssetId?: string; assetVersion?: AssetVersionReference }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string; sourceAssetId?: string; assetVersion?: AssetVersionReference; volcengineAsset?: VolcengineAssetMetadata }
    | { kind: "video"; url: string; title: string; storageKey?: string; sourceAssetId?: string; assetVersion?: AssetVersionReference; width?: number; height?: number; volcengineAsset?: VolcengineAssetMetadata }
    | { kind: "audio"; url: string; title: string; storageKey?: string; sourceAssetId?: string; assetVersion?: AssetVersionReference; bytes?: number; mimeType?: string };

export function buildInsertAssetPayload(asset: Asset): InsertAssetPayload {
    const assetVersion = buildAssetVersionReference(asset);
    if (asset.kind === "text") return { kind: "text", content: asset.data.content, title: asset.title, sourceAssetId: asset.id, assetVersion };
    if (asset.kind === "image")
        return {
            kind: "image",
            dataUrl: asset.data.dataUrl,
            storageKey: asset.data.storageKey,
            sourceAssetId: asset.id,
            assetVersion,
            title: asset.title,
            volcengineAsset: asset.metadata?.volcengineAsset,
        };
    if (asset.kind === "video")
        return {
            kind: "video",
            url: asset.data.url,
            storageKey: asset.data.storageKey,
            sourceAssetId: asset.id,
            assetVersion,
            title: asset.title,
            width: asset.data.width,
            height: asset.data.height,
            volcengineAsset: asset.metadata?.volcengineAsset,
        };
    return {
        kind: "audio",
        url: asset.data.url,
        storageKey: asset.data.storageKey,
        sourceAssetId: asset.id,
        assetVersion,
        title: asset.title,
        bytes: asset.data.bytes,
        mimeType: asset.data.mimeType,
    };
}
