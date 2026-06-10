import { useCallback, type Dispatch, type SetStateAction } from "react";

import { recordAiTaskFrontendArtifact } from "@/services/api/ai-task-trace";
import type { AiConfig } from "@/stores/use-config-store";
import { useAssetStore, type AssetWriteInput } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import type { CanvasNodeData } from "../types";
import { aiTaskIdFromGeneration, buildFrontendArtifactTrace } from "../utils/canvas-ai-task-trace";
import type { CanvasEpisodeContext } from "../utils/canvas-episode-context";
import { buildGeneratedVideoAsset } from "../utils/canvas-generated-asset";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { buildImageBriefResultPatch, buildProductionBibleBriefAssetRefs } from "../utils/image-brief";

export function useCanvasGeneratedAssetArchive({
    addAssetOnce,
    canvasEpisodeContext,
    canvasId,
    ensureProjectFolder,
    projectPreset,
    setNodes,
    workspaceProjectId,
    workspaceProjectTitle,
}: {
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    canvasEpisodeContext?: CanvasEpisodeContext;
    canvasId: string;
    ensureProjectFolder: (projectId: string, name: string) => string;
    projectPreset?: CanvasProjectPreset;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    workspaceProjectId: string;
    workspaceProjectTitle: string;
}) {
    const archiveGeneratedAsset = useCallback(
        async (asset: AssetWriteInput) => {
            const archivedAsset = asset.kind === "video" ? { ...asset, folderId: asset.folderId || ensureProjectFolder(workspaceProjectId, workspaceProjectTitle) } : asset;
            const assetId = await addAssetOnce(archivedAsset);
            const generation = asset.metadata?.generation as Record<string, unknown> | undefined;
            const aiTaskId = aiTaskIdFromGeneration(generation);
            if (aiTaskId) {
                const artifact = buildFrontendArtifactTrace({
                    assetId,
                    kind: asset.kind,
                    createdAt: new Date().toISOString(),
                    generation,
                    canvasId,
                    fallbackProjectId: workspaceProjectId,
                });
                if (artifact) void recordAiTaskFrontendArtifact(aiTaskId, artifact).catch(() => undefined);
            }
            const briefId = typeof generation?.briefId === "string" ? generation.briefId : "";
            if (briefId) {
                useImageBriefStore.getState().addResultAsset(briefId, assetId, "generated");
                const assetBreakdownItemId = typeof generation?.assetBreakdownItemId === "string" ? generation.assetBreakdownItemId : "";
                const productionBibleItemId = typeof generation?.productionBibleItemId === "string" ? generation.productionBibleItemId : "";
                if (assetBreakdownItemId) {
                    const item = useAssetBreakdownStore.getState().items.find((entry) => entry.id === assetBreakdownItemId);
                    if (item) useAssetBreakdownStore.getState().updateItem(item.id, buildImageBriefResultPatch(item, assetId));
                }
                if (productionBibleItemId) {
                    const item = useProductionBibleStore.getState().items.find((entry) => entry.id === productionBibleItemId);
                    if (item) {
                        const refs = buildProductionBibleBriefAssetRefs(item, assetId).assetRefs;
                        useProductionBibleStore.getState().updateItem(item.id, { assetRefs: preserveOrCreateAssetVersionReferences(refs, useAssetStore.getState().assets, item.assetRefs) });
                    }
                }
            }
            return assetId;
        },
        [addAssetOnce, canvasId, ensureProjectFolder, workspaceProjectId, workspaceProjectTitle],
    );

    const archiveGeneratedVideoNode = useCallback(
        async (node: CanvasNodeData, generationConfig: AiConfig, prompt = node.metadata?.prompt || "") => {
            const effectivePrompt = node.metadata?.finalPrompt || prompt;
            const asset = buildGeneratedVideoAsset(node, {
                projectId: workspaceProjectId,
                projectTitle: workspaceProjectTitle,
                projectPreset,
                episodeContext: canvasEpisodeContext,
                prompt,
                effectivePrompt,
                config: generationConfig,
                createdAt: node.metadata?.finishedAt || node.metadata?.localStoredAt || new Date().toISOString(),
            });
            const assetId = asset ? await archiveGeneratedAsset(asset).catch(() => undefined) : undefined;
            if (typeof assetId === "string") setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, sourceAssetId: assetId } } : item)));
            return assetId;
        },
        [archiveGeneratedAsset, canvasEpisodeContext, projectPreset, setNodes, workspaceProjectId, workspaceProjectTitle],
    );

    return { archiveGeneratedAsset, archiveGeneratedVideoNode };
}
