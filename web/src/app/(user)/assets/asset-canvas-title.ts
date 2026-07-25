import type { Asset } from "../../../stores/use-asset-store.ts";
import type { CanvasProject } from "../canvas/stores/use-canvas-store.ts";
import { canvasGeneratedAssetTitle, generatedCanvasAssetVersionNumber } from "../canvas/utils/canvas-asset-name.ts";

type CanvasTitleProject = Pick<CanvasProject, "id" | "title" | "nodes">;

export function normalizeCanvasAssetTitles(assets: Asset[], projects: CanvasTitleProject[]) {
    return assets.map((asset) => {
        if (asset.kind !== "image" && asset.kind !== "video") return asset;
        const generation = readRecord(asset.metadata?.generation);
        if (generation?.source !== "canvas" || typeof generation.nodeId !== "string") return asset;

        for (const project of projects) {
            const node = project.nodes.find((item) => item.id === generation.nodeId && item.type === asset.kind);
            if (!node) continue;
            const linkedVersion = node.metadata?.mediaVersions?.find((version) => version.metadata.sourceAssetId === asset.id);
            if (!linkedVersion && node.metadata?.sourceAssetId !== asset.id) continue;
            const title = canvasGeneratedAssetTitle(node, project.title, project.nodes, linkedVersion?.versionNumber || generatedCanvasAssetVersionNumber(node));
            return title === asset.title ? asset : ({ ...asset, title } as Asset);
        }
        return asset;
    });
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
