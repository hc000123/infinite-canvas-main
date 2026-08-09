import { useCallback, type Dispatch, type SetStateAction } from "react";

import { recordAiTaskFrontendArtifact } from "@/services/api/ai-task-trace";
import { archiveLocalMediaToProjectCache } from "@/services/project-cache-archive";
import { projectCacheContextFromGeneration } from "@/services/project-cache-context";
import type { AiConfig } from "@/stores/use-config-store";
import { useAssetStore, type AssetWriteInput } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import type { CanvasNodeData } from "../types";
import { aiTaskIdFromGeneration, buildFrontendArtifactTrace } from "../utils/canvas-ai-task-trace";
import type { CanvasEpisodeContext } from "../utils/canvas-episode-context";
import { buildGeneratedVideoAsset, numberCanvasAssetNode } from "../utils/canvas-generated-asset";
import { generatedSourceAssetId, inheritGeneratedAssetBinding, shouldWriteGeneratedAsset } from "../utils/canvas-generated-asset-writeback";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { buildImageBriefResultPatch, buildProductionBibleBriefAssetRefs } from "../utils/image-brief";

export function useCanvasGeneratedAssetArchive({
    addAssetOnce,
    canvasEpisodeContext,
    canvasId,
    canvasTitle,
    ensureProjectFolder,
    getNodes,
    projectPreset,
    setNodes,
    workspaceProjectId,
    workspaceProjectTitle,
    token,
}: {
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    canvasEpisodeContext?: CanvasEpisodeContext;
    canvasId: string;
    canvasTitle: string;
    ensureProjectFolder: (projectId: string, name: string) => string;
    getNodes: () => CanvasNodeData[];
    projectPreset?: CanvasProjectPreset;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    workspaceProjectId: string;
    workspaceProjectTitle: string;
    token?: string;
}) {
    const prepareGeneratedAssetNode = useCallback(
        (node: CanvasNodeData) => {
            const numberedNode = numberCanvasAssetNode(node, getNodes());
            const assetNodeNumber = numberedNode.metadata?.assetNodeNumber;
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, assetNodeNumber } } : item)));
            return numberedNode;
        },
        [getNodes, setNodes],
    );

    const archiveGeneratedAsset = useCallback(
        async (asset: AssetWriteInput) => {
            const sourceAsset = useAssetStore.getState().assets.find((item) => item.id === generatedSourceAssetId(asset));
            const linkedAsset = inheritGeneratedAssetBinding(asset, sourceAsset);
            const generation = linkedAsset.metadata?.generation as Record<string, unknown> | undefined;
            const shouldWriteAsset = shouldWriteGeneratedAsset(linkedAsset);
            const archivedAsset = shouldWriteAsset && linkedAsset.kind === "video" ? { ...linkedAsset, folderId: linkedAsset.folderId || ensureProjectFolder(workspaceProjectId, workspaceProjectTitle) } : linkedAsset;
            const assetId = shouldWriteAsset ? await addAssetOnce(archivedAsset) : undefined;
            if (assetId && linkedAsset.kind === "image" && sourceAsset?.assetBinding) {
                const variants = useAssetStore.getState().variants;
                const variantId = sourceAsset.assetBinding.variantId || variants.find((variant) => variant.subjectId === sourceAsset.assetBinding?.subjectId && variant.name === sourceAsset.assetBinding?.variantName)?.id;
                if (variantId) useAssetStore.getState().setVariantCurrentAsset(variantId, assetId);
            }
            if (token && linkedAsset.kind === "image" && linkedAsset.data.storageKey) {
                const context = projectCacheContextFromGeneration({
                    assetId: assetId || "",
                    canvasId,
                    canvasName: String(generation?.canvasTitle || canvasTitle),
                    episodeId: String(generation?.episodeId || ""),
                    episodeName: String(generation?.episodeTitle || ""),
                    freeCanvas: !generation?.episodeId,
                    kind: "image",
                    metadata: { ...linkedAsset.metadata, assetBinding: linkedAsset.assetBinding },
                    nodeId: String(linkedAsset.metadata?.nodeId || generation?.nodeId || ""),
                    projectId: String(generation?.projectId || workspaceProjectId),
                    projectName: String(generation?.projectTitle || workspaceProjectTitle),
                    source: "canvas",
                    versionId: String(generation?.assetVersionNumber || ""),
                });
                const cacheId = assetId ? `asset:${assetId}:${context.versionId}` : `canvas:${canvasId}:${context.nodeId || linkedAsset.data.storageKey}:${context.versionId || "result"}`;
                void archiveLocalMediaToProjectCache({ id: cacheId, storageKey: linkedAsset.data.storageKey, kind: "image", filename: `${linkedAsset.title || context.nodeId || "生成图片"}.png`, context, token }).catch(() => undefined);
            }
            if (!assetId) return undefined;
            const aiTaskId = aiTaskIdFromGeneration(generation);
            if (aiTaskId) {
                const artifact = buildFrontendArtifactTrace({
                    assetId,
                    kind: linkedAsset.kind,
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
        [addAssetOnce, canvasId, canvasTitle, ensureProjectFolder, token, workspaceProjectId, workspaceProjectTitle],
    );

    const archiveGeneratedVideoNode = useCallback(
        async (node: CanvasNodeData, generationConfig: AiConfig, prompt = node.metadata?.prompt || "") => {
            const effectivePrompt = node.metadata?.finalPrompt || prompt;
            const asset = buildGeneratedVideoAsset(prepareGeneratedAssetNode(node), {
                projectId: workspaceProjectId,
                canvasId,
                canvasTitle,
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
        [archiveGeneratedAsset, canvasEpisodeContext, canvasId, canvasTitle, prepareGeneratedAssetNode, projectPreset, setNodes, workspaceProjectId, workspaceProjectTitle],
    );

    return { archiveGeneratedAsset, archiveGeneratedVideoNode, prepareGeneratedAssetNode };
}
