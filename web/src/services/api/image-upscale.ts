import { useUserStore } from "@/stores/use-user-store";
import { apiGet, apiPostEmpty, apiPostForm } from "./request";

export type ImageUpscaleJobStatus = "queued" | "processing" | "downloading" | "succeeded" | "failed";

export type ImageUpscaleCapabilities = {
    enabled: boolean;
    provider: string;
    scales: Array<2 | 4>;
    maxInputBytes: number;
    maxLongEdge: number;
    maxShortEdge: number;
    cloudProcessing: true;
};

export type ImageUpscaleJob = {
    id: string;
    projectId: string;
    canvasId: string;
    sourceNodeId: string;
    sourceAssetId: string;
    provider: string;
    providerRequestId: string;
    model: string;
    strategy: string;
    scale: 2 | 4;
    status: ImageUpscaleJobStatus;
    progress: number;
    attempt: number;
    inputWidth: number;
    inputHeight: number;
    inputMimeType: string;
    inputBytes: number;
    resultUrl: string;
    resultMimeType: string;
    resultBytes: number;
    outputWidth: number;
    outputHeight: number;
    errorCode: string;
    errorMessage: string;
    cloudProcessing: true;
    createdAt: string;
    startedAt: string;
    completedAt: string;
    updatedAt: string;
};

export type CreateImageUpscaleJobInput = {
    file: Blob;
    filename: string;
    scale: 2 | 4;
    projectId: string;
    canvasId: string;
    sourceNodeId: string;
    sourceAssetId?: string;
};

const token = () => useUserStore.getState().token;

export function getImageUpscaleCapabilities() {
    return apiGet<ImageUpscaleCapabilities>("/api/v1/image-upscale/capabilities", undefined, token());
}

export function createImageUpscaleJob(input: CreateImageUpscaleJobInput) {
    const form = new FormData();
    form.append("file", input.file, input.filename);
    form.append("scale", String(input.scale));
    form.append("projectId", input.projectId);
    form.append("canvasId", input.canvasId);
    form.append("sourceNodeId", input.sourceNodeId);
    form.append("sourceAssetId", input.sourceAssetId || "");
    return apiPostForm<ImageUpscaleJob>("/api/v1/image-upscale/jobs", form, token());
}

export function getImageUpscaleJob(jobId: string) {
    return apiGet<ImageUpscaleJob>(`/api/v1/image-upscale/jobs/${encodeURIComponent(jobId)}`, undefined, token());
}

export function retryImageUpscaleJob(jobId: string) {
    return apiPostEmpty<ImageUpscaleJob>(`/api/v1/image-upscale/jobs/${encodeURIComponent(jobId)}/retry`, token());
}
