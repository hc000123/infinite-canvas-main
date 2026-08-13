import { useUserStore } from "@/stores/use-user-store";
import { apiGet, apiPostEmpty, apiPostForm } from "./request";

export type VideoUpscaleJobStatus = "queued" | "uploading" | "processing" | "downloading" | "succeeded" | "failed";

export type VideoUpscaleCapabilities = { enabled: boolean; provider: string; targets: Array<"1080p" | "2k">; maxInputBytes: number; cloudProcessing: true };

export type VideoUpscaleJob = {
    id: string; projectId: string; canvasId: string; sourceNodeId: string; sourceAssetId: string;
    provider: string; vid: string; runId: string; providerRequestId: string; target: "1080p" | "2k"; scenario: "aigc"; enhanceLevel: "Standard";
    status: VideoUpscaleJobStatus; progress: number; attempt: number; inputWidth: number; inputHeight: number; inputDurationSeconds: number; inputMimeType: string; inputBytes: number;
    outputWidth: number; outputHeight: number; resultUrl: string; resultMimeType: string; resultBytes: number; errorCode: string; errorMessage: string; cloudProcessing: true;
    createdAt: string; startedAt: string; completedAt: string; updatedAt: string;
};

export type CreateVideoUpscaleJobInput = { file: Blob; filename: string; target: "1080p" | "2k"; projectId: string; canvasId: string; sourceNodeId: string; sourceAssetId?: string };
const token = () => useUserStore.getState().token;

export function getVideoUpscaleCapabilities() { return apiGet<VideoUpscaleCapabilities>("/api/v1/video-upscale/capabilities", undefined, token()); }
export function createVideoUpscaleJob(input: CreateVideoUpscaleJobInput) {
    const form = new FormData();
    form.append("file", input.file, input.filename); form.append("target", input.target); form.append("projectId", input.projectId); form.append("canvasId", input.canvasId); form.append("sourceNodeId", input.sourceNodeId); form.append("sourceAssetId", input.sourceAssetId || "");
    return apiPostForm<VideoUpscaleJob>("/api/v1/video-upscale/jobs", form, token());
}
export function getVideoUpscaleJob(jobId: string) { return apiGet<VideoUpscaleJob>(`/api/v1/video-upscale/jobs/${encodeURIComponent(jobId)}`, undefined, token()); }
export function retryVideoUpscaleJob(jobId: string) { return apiPostEmpty<VideoUpscaleJob>(`/api/v1/video-upscale/jobs/${encodeURIComponent(jobId)}/retry`, token()); }
