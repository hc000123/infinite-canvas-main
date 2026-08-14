import { useUserStore } from "@/stores/use-user-store";
import { apiGet, apiPostEmpty, apiPostForm } from "./request";

export type VideoUpscaleJobStatus = "queued" | "uploading" | "processing" | "downloading" | "succeeded" | "failed";
export type VideoUpscaleProviderID = "volcengine-las" | "tencent-mps";
export type TencentMPSEnhancementScene = "comic" | "live" | "restore";
export type VideoUpscaleTarget = "1080p" | "2k";
export type VideoUpscaleQualityMode = "compatible" | "balanced" | "master";
export type VideoFrameInterpolationMode = "keep" | "to25" | "to30" | "double" | "to60";
export type VideoInterpolationProcessingMode = "ultra-fast" | "fast" | "medium";

export type VideoUpscalePricingRules = {
    unitPriceCny: number;
    ruleVersion: string;
    resolutionTiers: Array<{ maxShortEdge: number | null; factor: number }>;
    frameRateTiers: Array<{ maxFrameRate: number; factor: number }>;
};

export type VideoInterpolationPricingRules = {
    unitPriceCny: number;
    ruleVersion: string;
    pixelTiers: Array<{ maxPixels: number | null; fastFactor: number; mediumFactor: number }>;
};

export type VideoUpscaleCapabilities = {
    enabled: boolean;
    provider: VideoUpscaleProviderID;
    providers: Array<{
        id: VideoUpscaleProviderID;
        name: string;
        targets: VideoUpscaleTarget[];
        enhancementScenes: TencentMPSEnhancementScene[];
        defaultScene: TencentMPSEnhancementScene | "";
        costNotice: string;
        interpolation: boolean;
    }>;
    targets: VideoUpscaleTarget[];
    maxInputBytes: number;
    cloudProcessing: true;
    pricing: VideoUpscalePricingRules;
    outputQualityModes: VideoUpscaleQualityMode[];
    defaultOutputQualityMode: VideoUpscaleQualityMode;
    preserveAudioSupported: boolean;
    frameInterpolation: {
        status: "available" | "unavailable";
        modes: VideoFrameInterpolationMode[];
        processingModes: VideoInterpolationProcessingMode[];
        defaultProcessingMode: VideoInterpolationProcessingMode;
        maxTargetFrameRate: number;
        maxSourceMultiplier: number;
        pricing: VideoInterpolationPricingRules;
    };
};

export type VideoUpscaleJob = {
    id: string; projectId: string; canvasId: string; sourceNodeId: string; sourceAssetId: string;
    provider: VideoUpscaleProviderID; runId: string; providerRequestId: string; target: VideoUpscaleTarget; enhancementScene: TencentMPSEnhancementScene | ""; tencentTemplateId: number;
    status: VideoUpscaleJobStatus; progress: number; attempt: number; processingStage: string; inputWidth: number; inputHeight: number; inputDurationSeconds: number; inputFrameRate: number; inputMimeType: string; inputBytes: number;
    outputWidth: number; outputHeight: number; outputQualityMode: VideoUpscaleQualityMode; preserveAudio: boolean; frameInterpolationMode: VideoFrameInterpolationMode; interpolationMode: VideoInterpolationProcessingMode | ""; interpolationTargetFrameRate: number; interpolationRunId: string;
    estimatedBillableMinutes: number; estimatedCostCny: number; costEstimateAvailable: boolean; pricingRuleVersion: string;
    estimatedInterpolationBillableMinutes: number; estimatedInterpolationCostCny: number; interpolationCostEstimateAvailable: boolean; interpolationPricingRuleVersion: string; estimatedTotalCostCny: number;
    resultUrl: string; resultMimeType: string; resultBytes: number; errorCode: string; errorMessage: string; cloudProcessing: true;
    createdAt: string; startedAt: string; completedAt: string; updatedAt: string;
};

export type VideoUpscaleSubmitOptions = { provider: VideoUpscaleProviderID; enhancementScene?: TencentMPSEnhancementScene; target: VideoUpscaleTarget; outputQualityMode: VideoUpscaleQualityMode; preserveAudio: boolean; frameInterpolationMode: VideoFrameInterpolationMode; interpolationMode: VideoInterpolationProcessingMode };
export type CreateVideoUpscaleJobInput = VideoUpscaleSubmitOptions & { file: Blob; filename: string; projectId: string; canvasId: string; sourceNodeId: string; sourceAssetId?: string };
const token = () => useUserStore.getState().token;

export function getVideoUpscaleCapabilities() { return apiGet<VideoUpscaleCapabilities>("/api/v1/video-upscale/capabilities", undefined, token()); }
export function createVideoUpscaleJob(input: CreateVideoUpscaleJobInput) {
    const form = new FormData();
    form.append("file", input.file, input.filename); form.append("target", input.target); form.append("projectId", input.projectId); form.append("canvasId", input.canvasId); form.append("sourceNodeId", input.sourceNodeId); form.append("sourceAssetId", input.sourceAssetId || "");
    form.append("provider", input.provider); form.append("enhancementScene", input.enhancementScene || "");
    form.append("outputQualityMode", input.outputQualityMode); form.append("preserveAudio", String(input.preserveAudio)); form.append("frameInterpolationMode", input.frameInterpolationMode); form.append("interpolationMode", input.interpolationMode);
    return apiPostForm<VideoUpscaleJob>("/api/v1/video-upscale/jobs", form, token());
}
export function getVideoUpscaleJob(jobId: string) { return apiGet<VideoUpscaleJob>(`/api/v1/video-upscale/jobs/${encodeURIComponent(jobId)}`, undefined, token()); }
export function retryVideoUpscaleJob(jobId: string) { return apiPostEmpty<VideoUpscaleJob>(`/api/v1/video-upscale/jobs/${encodeURIComponent(jobId)}/retry`, token()); }
