import assert from "node:assert/strict";
import test from "node:test";

import { estimateVideoInterpolationCost, estimateVideoUpscaleCost, formatVideoUpscaleCost } from "./video-upscale-cost.ts";

const pricing = {
    unitPriceCny: 2.2,
    ruleVersion: "las-2026-08",
    resolutionTiers: [
        { maxShortEdge: 720, factor: 1 },
        { maxShortEdge: 1080, factor: 3 },
        { maxShortEdge: 1440, factor: 5 },
        { maxShortEdge: null, factor: 11 },
    ],
    frameRateTiers: [
        { maxFrameRate: 30, factor: 1 },
        { maxFrameRate: 60, factor: 2 },
        { maxFrameRate: 90, factor: 3 },
        { maxFrameRate: 120, factor: 4 },
    ],
};

test("estimates the official LAS 1080p 24fps example", () => {
    const estimate = estimateVideoUpscaleCost({ durationSeconds: 10, frameRate: 24, outputWidth: 1920, outputHeight: 1080, pricing });
    assert.ok(estimate);
    assert.equal(estimate.resolutionFactor, 3);
    assert.equal(estimate.frameRateFactor, 1);
    assert.equal(formatVideoUpscaleCost(estimate.costCny), "¥1.10");
});

test("uses the 2K short-edge factor and frame-rate boundaries", () => {
    const estimate = estimateVideoUpscaleCost({ durationSeconds: 60, frameRate: 60, outputWidth: 2560, outputHeight: 1440, pricing });
    assert.deepEqual(estimate, { resolutionFactor: 5, frameRateFactor: 2, billableMinutes: 10, costCny: 22 });
});

test("does not invent a price without reliable metadata", () => {
    assert.equal(estimateVideoUpscaleCost({ durationSeconds: 0, frameRate: 24, outputWidth: 1920, outputHeight: 1080, pricing }), null);
    assert.equal(estimateVideoUpscaleCost({ durationSeconds: 10, frameRate: 0, outputWidth: 1920, outputHeight: 1080, pricing }), null);
    assert.equal(estimateVideoUpscaleCost({ durationSeconds: 10, frameRate: 121, outputWidth: 1920, outputHeight: 1080, pricing }), null);
});

const interpolationPricing = {
    unitPriceCny: 0.5,
    ruleVersion: "las-interpolation-2026-08",
    pixelTiers: [
        { maxPixels: 927408, fastFactor: 1, mediumFactor: 4 },
        { maxPixels: 2086876, fastFactor: 3, mediumFactor: 8 },
        { maxPixels: 3709632, fastFactor: 4, mediumFactor: 14 },
        { maxPixels: null, fastFactor: 10, mediumFactor: 24 },
    ],
};

test("estimates the official interpolation billing example", () => {
    const estimate = estimateVideoInterpolationCost({ durationSeconds: 300, sourceFrameRate: 60, targetFrameRate: 120, outputWidth: 1280, outputHeight: 720, processingMode: "medium", pricing: interpolationPricing });
    assert.deepEqual(estimate, { targetFrameRate: 120, deltaFrameRate: 60, resolutionBaseFactor: 4, frameRateMultiplier: 2, billableMinutes: 40, costCny: 20 });
});

test("interpolation uses total pixels and fast coefficients", () => {
    const estimate = estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 24, targetFrameRate: 48, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", pricing: interpolationPricing });
    assert.deepEqual(estimate, { targetFrameRate: 48, deltaFrameRate: 24, resolutionBaseFactor: 3, frameRateMultiplier: 1, billableMinutes: 3, costCny: 1.5 });
});

test("interpolation does not estimate invalid or unknown targets", () => {
    assert.equal(estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 0, targetFrameRate: 60, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", pricing: interpolationPricing }), null);
    assert.equal(estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 60, targetFrameRate: 60, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", pricing: interpolationPricing }), null);
    assert.equal(estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 24, targetFrameRate: 481, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", pricing: interpolationPricing }), null);
    assert.equal(estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 5, targetFrameRate: 60, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", pricing: interpolationPricing }), null);
});

test("interpolation target limits come from server capabilities", () => {
    assert.ok(estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 24, targetFrameRate: 100, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", maxTargetFrameRate: 120, maxSourceMultiplier: 6, pricing: interpolationPricing }));
    assert.equal(estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 24, targetFrameRate: 100, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", maxTargetFrameRate: 90, maxSourceMultiplier: 6, pricing: interpolationPricing }), null);
    assert.equal(estimateVideoInterpolationCost({ durationSeconds: 60, sourceFrameRate: 24, targetFrameRate: 100, outputWidth: 1920, outputHeight: 1080, processingMode: "fast", maxTargetFrameRate: 120, maxSourceMultiplier: 4, pricing: interpolationPricing }), null);
});
