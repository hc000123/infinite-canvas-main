import type { AssetVersionReference } from "../../assets/asset-version-references.ts";
import type { CanvasNodeMetadata } from "../types.ts";

export type CanvasAssetReferenceMetadata = Pick<CanvasNodeMetadata, "sourceAssetId" | "assetVersion" | "assetReferenceMode">;

export function canvasAssetReferenceMetadata(input: { sourceAssetId?: string; assetVersion?: AssetVersionReference }): CanvasAssetReferenceMetadata {
    const sourceAssetId = input.sourceAssetId || input.assetVersion?.assetId;
    return {
        ...(sourceAssetId ? { sourceAssetId } : {}),
        ...(input.assetVersion ? { assetVersion: input.assetVersion, assetReferenceMode: "fixed-version" as const } : {}),
    };
}
