"use client";

import { useMemo } from "react";

import { hasNewerAssetVersion } from "../../assets/asset-version-references";
import type { Asset } from "@/stores/use-asset-store";
import type { CanvasNodeData } from "../types";

export function useCanvasNodeToolbarState({
    nodeById,
    assetById,
    toolbarNodeId,
    infoNodeId,
    cropNodeId,
    angleNodeId,
    previewNodeId,
}: {
    nodeById: Map<string, CanvasNodeData>;
    assetById: Map<string, Asset>;
    toolbarNodeId: string | null;
    infoNodeId: string | null;
    cropNodeId: string | null;
    angleNodeId: string | null;
    previewNodeId: string | null;
}) {
    return useMemo(() => {
        const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
        const hasNewAssetVersion = Boolean(toolbarNode?.metadata?.assetVersion && hasNewerAssetVersion(toolbarNode.metadata.assetVersion, assetById.get(toolbarNode.metadata.sourceAssetId || "")));

        return {
            toolbarNode,
            infoNode: infoNodeId ? nodeById.get(infoNodeId) || null : null,
            cropNode: cropNodeId ? nodeById.get(cropNodeId) || null : null,
            angleNode: angleNodeId ? nodeById.get(angleNodeId) || null : null,
            previewNode: previewNodeId ? nodeById.get(previewNodeId) || null : null,
            hasNewAssetVersion,
        };
    }, [angleNodeId, assetById, cropNodeId, infoNodeId, nodeById, previewNodeId, toolbarNodeId]);
}
