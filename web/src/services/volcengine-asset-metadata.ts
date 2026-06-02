import type { VolcengineAssetStatus, VolcengineAssetSubmission } from "@/services/api/volcengine-assets";

export type VolcengineReviewMetadata = {
    assetId: string;
    groupId: string;
    projectName: string;
    status: "Processing" | "Active" | "Failed" | string;
    error?: string;
    publicUrl: string;
    submittedAt: string;
    updatedAt: string;
};

export function volcengineReviewMetadataFromSubmission(submission: VolcengineAssetSubmission): VolcengineReviewMetadata {
    return {
        assetId: submission.assetId,
        groupId: submission.groupId,
        projectName: submission.projectName,
        status: submission.status,
        error: "",
        publicUrl: submission.publicUrl,
        submittedAt: submission.submittedAt,
        updatedAt: submission.updatedAt,
    };
}

export function mergeVolcengineReviewStatus(saved: VolcengineReviewMetadata, status: VolcengineAssetStatus): VolcengineReviewMetadata {
    return {
        ...saved,
        assetId: status.assetId || saved.assetId,
        groupId: status.groupId || saved.groupId,
        projectName: status.projectName || saved.projectName,
        status: status.status || saved.status,
        error: status.error || (status.status === "Failed" ? saved.error : ""),
        publicUrl: status.publicUrl || saved.publicUrl,
        updatedAt: status.updatedAt || new Date().toISOString(),
    };
}

export function buildVolcengineImageFilename(title: string, fallbackId: string, mimeType?: string) {
    const safeBase = (title || fallbackId || "image").trim().replace(/[\\/:*?"<>|]+/g, "_") || "image";
    const ext = mimeType?.split("/")[1] || "png";
    return `${safeBase}.${ext}`;
}

export function buildVolcengineAssetURI(assetId?: string) {
    const id = assetId?.trim();
    return id ? `asset://${id}` : "";
}

export function activeVolcengineAssetURI(metadata?: { assetId?: string; status?: string }) {
    return metadata?.status === "Active" ? buildVolcengineAssetURI(metadata.assetId) : "";
}

export function isVolcengineReviewProcessing(metadata?: { assetId?: string; status?: string }) {
    return Boolean(metadata?.assetId?.trim() && metadata.status === "Processing");
}

export function volcengineReviewPollingKey(items: Array<{ id: string; metadata?: { volcengineAsset?: { assetId?: string; status?: string } } }>) {
    return items
        .filter((item) => isVolcengineReviewProcessing(item.metadata?.volcengineAsset))
        .map((item) => `${item.id}:${item.metadata?.volcengineAsset?.assetId}`)
        .join("|");
}

export function shouldShowVolcengineReviewAction(kind: string) {
    return kind === "image";
}
