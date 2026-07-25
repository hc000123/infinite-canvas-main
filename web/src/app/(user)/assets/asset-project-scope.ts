import type { Asset } from "../../../stores/use-asset-store.ts";
import { assetCanvasLibraryEntries, assetInCanvasLibrary } from "./asset-canvas-library.ts";
import { assetGenerationProjectId, assetGenerationRecords, assetGenerationSource, readRecord, readString } from "./asset-generation.ts";
import { assetProjectLibraryEntries } from "./asset-project-library.ts";

export type AssetSourceScope = "all" | "workflow" | "canvas";

export type AssetProjectScopeContext = {
    folderProjectIdByFolderId: ReadonlyMap<string, string>;
    canvasProjectIdByCanvasId: ReadonlyMap<string, string>;
    referencedAssetIdsByProject: ReadonlyMap<string, ReadonlySet<string>>;
};

export function assetProjectIds(asset: Asset, context: AssetProjectScopeContext) {
    const ids = new Set<string>();
    const add = (value: string) => value && ids.add(value);
    add(asset.folderId ? context.folderProjectIdByFolderId.get(asset.folderId) || "" : "");
    assetProjectLibraryEntries(asset).forEach((entry) => add(entry.projectId));
    assetGenerationRecords(asset).forEach((generation) => {
        add(assetGenerationProjectId(generation));
        add(context.canvasProjectIdByCanvasId.get(readString(generation.canvasId)) || "");
    });
    const canvasSource = readRecord(asset.metadata?.canvasSource);
    add(readString(canvasSource?.projectId));
    add(context.canvasProjectIdByCanvasId.get(readString(canvasSource?.canvasId)) || "");
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    add(readString(workflow?.projectId));
    add(readString(workflow?.sourceProjectId));
    assetCanvasLibraryEntries(asset).forEach((entry) => add(context.canvasProjectIdByCanvasId.get(entry.canvasId) || ""));
    context.referencedAssetIdsByProject.forEach((assetIds, projectId) => {
        if (assetIds.has(asset.id)) add(projectId);
    });
    return ids;
}

export function projectAssetIds(assets: Asset[], projectId: string, context: AssetProjectScopeContext) {
    return new Set(assets.filter((asset) => assetProjectIds(asset, context).has(projectId)).map((asset) => asset.id));
}

export function assetMatchesSourceScope(asset: Asset, scope: AssetSourceScope, projectCanvasIds: ReadonlySet<string>, selectedCanvasId: string) {
    if (scope === "all") return true;
    if (scope === "workflow") return hasWorkflowSource(asset);
    if (selectedCanvasId) return assetInCanvasLibrary(asset, selectedCanvasId);
    return assetCanvasIds(asset).some((canvasId) => projectCanvasIds.has(canvasId));
}

function assetCanvasIds(asset: Asset) {
    const ids = new Set(assetCanvasLibraryEntries(asset).map((entry) => entry.canvasId));
    const canvasSource = readRecord(asset.metadata?.canvasSource);
    const sourceCanvasId = readString(canvasSource?.canvasId);
    if (sourceCanvasId) ids.add(sourceCanvasId);
    assetGenerationRecords(asset).forEach((generation) => {
        const canvasId = readString(generation.canvasId);
        if (canvasId) ids.add(canvasId);
    });
    return Array.from(ids);
}

function hasWorkflowSource(asset: Asset) {
    if (readRecord(asset.metadata?.originalWorkflow)) return true;
    const metadataSource = readString(asset.metadata?.source).toLowerCase();
    if (metadataSource.includes("workflow") || metadataSource.includes("工作流")) return true;
    return assetGenerationRecords(asset).some((generation) => {
        const source = assetGenerationSource(generation);
        return Boolean(source && source !== "canvas" && source !== "asset-library");
    });
}
