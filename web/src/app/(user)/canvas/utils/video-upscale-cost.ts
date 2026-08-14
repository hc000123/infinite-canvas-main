import type { VideoInterpolationPricingRules, VideoInterpolationProcessingMode, VideoUpscalePricingRules } from "../../../../services/api/video-upscale.ts";

export type VideoUpscaleCostEstimate = {
    resolutionFactor: number;
    frameRateFactor: number;
    billableMinutes: number;
    costCny: number;
};

export type VideoInterpolationCostEstimate = {
    targetFrameRate: number;
    deltaFrameRate: number;
    resolutionBaseFactor: number;
    frameRateMultiplier: number;
    billableMinutes: number;
    costCny: number;
};

export function estimateVideoUpscaleCost({ durationSeconds, frameRate, outputWidth, outputHeight, pricing }: { durationSeconds: number; frameRate: number; outputWidth: number; outputHeight: number; pricing: VideoUpscalePricingRules }): VideoUpscaleCostEstimate | null {
    if (![durationSeconds, frameRate, outputWidth, outputHeight, pricing.unitPriceCny].every((value) => Number.isFinite(value) && value > 0)) return null;
    const shortEdge = Math.min(outputWidth, outputHeight);
    const resolutionFactor = pricing.resolutionTiers.find((tier) => tier.maxShortEdge === null || shortEdge <= tier.maxShortEdge)?.factor;
    const frameRateFactor = pricing.frameRateTiers.find((tier) => frameRate <= tier.maxFrameRate)?.factor;
    if (!resolutionFactor || !frameRateFactor) return null;
    const billableMinutes = (durationSeconds / 60) * resolutionFactor * frameRateFactor;
    return { resolutionFactor, frameRateFactor, billableMinutes, costCny: pricing.unitPriceCny * billableMinutes };
}

export function estimateVideoInterpolationCost({ durationSeconds, sourceFrameRate, targetFrameRate, outputWidth, outputHeight, processingMode, maxTargetFrameRate = 480, maxSourceMultiplier = 6, pricing }: { durationSeconds: number; sourceFrameRate: number; targetFrameRate: number; outputWidth: number; outputHeight: number; processingMode: VideoInterpolationProcessingMode; maxTargetFrameRate?: number; maxSourceMultiplier?: number; pricing: VideoInterpolationPricingRules }): VideoInterpolationCostEstimate | null {
    if (![durationSeconds, sourceFrameRate, targetFrameRate, outputWidth, outputHeight, maxTargetFrameRate, maxSourceMultiplier, pricing.unitPriceCny].every((value) => Number.isFinite(value) && value > 0) || targetFrameRate <= sourceFrameRate || targetFrameRate > maxTargetFrameRate || targetFrameRate > sourceFrameRate * maxSourceMultiplier) return null;
    const tier = pricing.pixelTiers.find((item) => item.maxPixels === null || outputWidth * outputHeight <= item.maxPixels);
    if (!tier) return null;
    const deltaFrameRate = targetFrameRate - sourceFrameRate;
    const resolutionBaseFactor = processingMode === "medium" ? tier.mediumFactor : tier.fastFactor;
    const frameRateMultiplier = Math.ceil(deltaFrameRate / 30);
    const billableMinutes = (durationSeconds / 60) * resolutionBaseFactor * frameRateMultiplier;
    return { targetFrameRate, deltaFrameRate, resolutionBaseFactor, frameRateMultiplier, billableMinutes, costCny: pricing.unitPriceCny * billableMinutes };
}

export function formatVideoUpscaleCost(value: number) {
    return `¥${value.toFixed(2)}`;
}
