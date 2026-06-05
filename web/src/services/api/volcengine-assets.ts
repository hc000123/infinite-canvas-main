import { apiPost, apiPostForm } from "@/services/api/request";

export type VolcengineAssetStatusValue = "Processing" | "Active" | "Failed" | string;

export type VolcengineAssetSubmission = {
    assetId: string;
    groupId: string;
    projectName: string;
    status: VolcengineAssetStatusValue;
    publicUrl: string;
    submittedAt: string;
    updatedAt: string;
};

export type VolcengineAssetStatus = {
    assetId: string;
    groupId: string;
    projectName: string;
    status: VolcengineAssetStatusValue;
    error?: string;
    publicUrl: string;
    assetType: string;
    updatedAt: string;
};

export async function submitVolcengineImageAsset(token: string, payload: { file: Blob; filename: string; assetTitle: string; groupId?: string; groupName?: string }) {
    return submitVolcengineAssetReview("/api/v1/volcengine/assets/image-review", token, payload);
}

export async function submitVolcengineMediaAsset(token: string, payload: { file: Blob; filename: string; assetTitle: string; groupId?: string; groupName?: string }) {
    return submitVolcengineAssetReview("/api/v1/volcengine/assets/media-review", token, payload);
}

function submitVolcengineAssetReview(endpoint: string, token: string, payload: { file: Blob; filename: string; assetTitle: string; groupId?: string; groupName?: string }) {
    const form = new FormData();
    form.append("file", payload.file, payload.filename);
    form.append("assetTitle", payload.assetTitle);
    if (payload.groupId) form.append("groupId", payload.groupId);
    if (payload.groupName) form.append("groupName", payload.groupName);
    return apiPostForm<VolcengineAssetSubmission>(endpoint, form, token);
}

export async function fetchVolcengineAssetStatus(token: string, payload: { assetId: string; projectName?: string }) {
    return apiPost<VolcengineAssetStatus>("/api/v1/volcengine/assets/status", payload, token);
}
