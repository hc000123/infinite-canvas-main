import { useUserStore } from "@/stores/use-user-store";
import { apiGet, apiPostEmpty, apiPostForm } from "./request";

export type VideoSubtitleEraseJobStatus = "queued" | "uploading" | "processing" | "downloading" | "succeeded" | "failed";

export type VideoSubtitleEraseCapabilities = {
    enabled: boolean;
    provider: string;
    maxInputBytes: number;
    maxInputWidth: number;
    maxInputHeight: number;
    maxOutputWidth: number;
    maxOutputHeight: number;
    outputFormat: "mp4";
    cloudProcessing: true;
    pricing: { unitPriceCny: number; ruleVersion: string };
};

export type VideoSubtitleEraseJob = {
    id: string;
    projectId: string;
    canvasId: string;
    sourceNodeId: string;
    sourceAssetId: string;
    provider: string;
    runId: string;
    providerRequestId: string;
    processingStage: string;
    status: VideoSubtitleEraseJobStatus;
    progress: number;
    attempt: number;
    inputWidth: number;
    inputHeight: number;
    inputDurationSeconds: number;
    inputMimeType: string;
    inputBytes: number;
    outputWidth: number;
    outputHeight: number;
    outputDurationSeconds: number;
    estimatedBillableMinutes: number;
    estimatedCostCny: number;
    pricingRuleVersion: string;
    costEstimateAvailable: boolean;
    resultUrl: string;
    resultMimeType: string;
    resultBytes: number;
    errorCode: string;
    errorMessage: string;
    cloudProcessing: true;
    createdAt: string;
    startedAt: string;
    completedAt: string;
    updatedAt: string;
};

export type CreateVideoSubtitleEraseJobInput = { file: Blob; filename: string; projectId: string; canvasId: string; sourceNodeId: string; sourceAssetId?: string };

const token = () => useUserStore.getState().token;

export function getVideoSubtitleEraseCapabilities() {
    return apiGet<VideoSubtitleEraseCapabilities>("/api/v1/video-subtitle-erase/capabilities", undefined, token());
}

export function createVideoSubtitleEraseJob(input: CreateVideoSubtitleEraseJobInput) {
    const form = new FormData();
    form.append("file", input.file, input.filename);
    form.append("projectId", input.projectId);
    form.append("canvasId", input.canvasId);
    form.append("sourceNodeId", input.sourceNodeId);
    form.append("sourceAssetId", input.sourceAssetId || "");
    return apiPostForm<VideoSubtitleEraseJob>("/api/v1/video-subtitle-erase/jobs", form, token());
}

export function getVideoSubtitleEraseJob(jobId: string) {
    return apiGet<VideoSubtitleEraseJob>(`/api/v1/video-subtitle-erase/jobs/${encodeURIComponent(jobId)}`, undefined, token());
}

export function retryVideoSubtitleEraseJob(jobId: string) {
    return apiPostEmpty<VideoSubtitleEraseJob>(`/api/v1/video-subtitle-erase/jobs/${encodeURIComponent(jobId)}/retry`, token());
}
