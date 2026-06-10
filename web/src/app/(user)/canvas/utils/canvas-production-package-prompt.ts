import { CanvasNodeType, type CanvasNodeData } from "../types";
import type { CanvasProductionPackageSummary } from "./canvas-production-packages";

export function buildProductionPackagePrompt(productionPackage: CanvasProductionPackageSummary, nodes: CanvasNodeData[]) {
    const relatedText = nodes
        .filter((node) => node.metadata?.productionPackageId === productionPackage.id)
        .filter((node) => node.type === CanvasNodeType.Text || node.metadata?.productionPackageRole === "prompt")
        .map((node) => String(node.metadata?.finalPrompt || node.metadata?.prompt || node.metadata?.content || "").trim())
        .filter(Boolean);
    if (relatedText.length) return relatedText.join("\n\n");
    return [productionPackage.sceneName, productionPackage.title, productionPackage.shotRangeLabel && productionPackage.shotRangeLabel !== "-" ? `镜头 ${productionPackage.shotRangeLabel}` : ""].filter(Boolean).join("\n");
}
