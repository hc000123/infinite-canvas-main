import assert from "node:assert/strict";
import test from "node:test";

import { appendSeedanceImageReviewDiagnostic, appendSeedanceMediaReviewDiagnostic, seedanceImageReviewBlockingError, seedanceMediaReviewBlockingError } from "./canvas-volcengine-review-diagnostics.ts";

test("blocks Seedance video generation when a submitted image review is not active yet", () => {
    const message = seedanceImageReviewBlockingError([
        { id: "image-1", name: "角色.png", type: "image/png", dataUrl: "blob:image", volcengineAssetId: "asset-1", volcengineAssetStatus: "Processing" },
        { id: "image-2", name: "已加白.png", type: "image/png", dataUrl: "blob:image", assetUri: "asset://asset-2", volcengineAssetId: "asset-2", volcengineAssetStatus: "Active" },
    ]);

    assert.match(message, /角色\.png/);
    assert.match(message, /Processing/);
    assert.doesNotMatch(message, /已加白\.png/);
});

test("adds review diagnostics to sensitive Ark image errors", () => {
    const message = appendSeedanceImageReviewDiagnostic("InputImageSensitiveContentDetected.PrivacyInformation", [
        { id: "image-1", name: "未加白.png", type: "image/png", dataUrl: "blob:image" },
        { id: "image-2", name: "已加白.png", type: "image/png", dataUrl: "blob:image", assetUri: "asset://asset-2" },
    ]);

    assert.match(message, /本次参考图加白诊断/);
    assert.match(message, /未加白\.png/);
    assert.doesNotMatch(message, /已加白\.png/);
});

test("blocks Seedance video generation when a submitted video review is not active yet", () => {
    const message = seedanceMediaReviewBlockingError(
        [],
        [
            { id: "video-1", name: "人物参考.mp4", type: "video/mp4", url: "blob:video", volcengineAssetId: "asset-video", volcengineAssetStatus: "Processing" },
            { id: "video-2", name: "已加白视频.mp4", type: "video/mp4", url: "blob:video", assetUri: "asset://asset-video-active", volcengineAssetId: "asset-video-active", volcengineAssetStatus: "Active" },
        ],
    );

    assert.match(message, /人物参考\.mp4/);
    assert.match(message, /Processing/);
    assert.doesNotMatch(message, /已加白视频\.mp4/);
});

test("adds video review diagnostics to sensitive Ark image errors", () => {
    const message = appendSeedanceMediaReviewDiagnostic("InputImageSensitiveContentDetected.PrivacyInformation", [], [{ id: "video-1", name: "未加白视频.mp4", type: "video/mp4", url: "blob:video" }]);

    assert.match(message, /本次参考素材加白诊断/);
    assert.match(message, /未加白视频\.mp4/);
});
