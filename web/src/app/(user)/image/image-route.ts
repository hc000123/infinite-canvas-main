import type { Asset } from "../../../stores/use-asset-store.ts";

export function legacyImageDestination(params: Pick<URLSearchParams, "get">, assets: Asset[]) {
    const projectId = params.get("projectId")?.trim();
    const logicalAssetId = params.get("assetId")?.trim();
    const asset = assets.find((item) => item.id === params.get("libraryAssetId")) || assets.find((item) => {
        const raw = item.metadata?.originalWorkflow;
        if (!logicalAssetId || !raw || typeof raw !== "object" || Array.isArray(raw)) return false;
        const workflow = raw as Record<string, unknown>;
        const candidateId = typeof workflow.assetId === "string" ? workflow.assetId : typeof workflow.logicalAssetId === "string" ? workflow.logicalAssetId : "";
        const candidateProjectId = item.assetBinding?.projectId || (typeof workflow.sourceProjectId === "string" ? workflow.sourceProjectId : "");
        return candidateId === logicalAssetId && (!projectId || candidateProjectId === projectId);
    });
    const subjectId = asset?.assetBinding?.subjectId;
    if (subjectId) {
        const variantId = asset.assetBinding?.variantId;
        return `/assets/${encodeURIComponent(subjectId)}${variantId ? `?variantId=${encodeURIComponent(variantId)}` : ""}`;
    }
    return projectId ? `/assets?projectId=${encodeURIComponent(projectId)}` : "/assets";
}
