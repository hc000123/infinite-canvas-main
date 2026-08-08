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

export function syncCanvasNodeAssetTitles<T extends { title: string; metadata?: { sourceAssetId?: string } }>(nodes: T[], assetTitleById: ReadonlyMap<string, string>): T[] {
    let changed = false;
    const next = nodes.map((node) => {
        const title = node.metadata?.sourceAssetId ? assetTitleById.get(node.metadata.sourceAssetId)?.trim() : "";
        if (!title || title === node.title) return node;
        changed = true;
        return { ...node, title };
    });
    return changed ? next : nodes;
}
