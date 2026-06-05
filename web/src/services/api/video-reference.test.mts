import assert from "node:assert/strict";
import test from "node:test";

import {
    buildSeedanceContent,
    buildSeedanceVideoTaskPayload,
    defaultSeedanceImageRole,
    hasSeedanceAssetIdReference,
    normalizeSeedancePromptReferenceMentions,
    seedanceAssetURIFromImageReference,
    seedanceAssetURIFromVideoReference,
    seedanceReferenceLabel,
    seedanceReferenceLabelRange,
} from "./video-reference.ts";

test("builds Seedance content with typed reference roles", () => {
    const content = buildSeedanceContent("图片1中的主角跟随视频1的运镜，参考音频1的节奏", ["data:image/png;base64,aaa"], ["data:video/mp4;base64,bbb"], ["data:audio/mpeg;base64,ccc"]);

    assert.deepEqual(content, [
        { type: "text", text: "图片 1中的主角跟随视频 1的运镜，参考音频 1的节奏" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aaa" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "data:video/mp4;base64,bbb" }, role: "reference_video" },
        { type: "audio_url", audio_url: { url: "data:audio/mpeg;base64,ccc" }, role: "reference_audio" },
    ]);
});

test("defaults Seedance image references to normal reference mode", () => {
    assert.equal(defaultSeedanceImageRole(0), "reference_image");
    assert.equal(defaultSeedanceImageRole(1), "reference_image");
    assert.equal(defaultSeedanceImageRole(0, "first_frame"), "first_frame");
    assert.equal(defaultSeedanceImageRole(1, "first_frame"), "reference_image");
    assert.equal(defaultSeedanceImageRole(0, "first_last_frame"), "first_frame");
    assert.equal(defaultSeedanceImageRole(1, "first_last_frame"), "last_frame");
    assert.equal(defaultSeedanceImageRole(0, "continue"), "first_frame");
});

test("limits Seedance omni references to 9 images, 3 videos, and 12 files total", () => {
    const images = Array.from({ length: 10 }, (_, index) => `image-${index}`);
    const videos = Array.from({ length: 4 }, (_, index) => `video-${index}`);
    const content = buildSeedanceContent("prompt", images, videos);

    assert.equal(content.filter((item) => item.type === "image_url").length, 9);
    assert.equal(content.filter((item) => item.type === "video_url").length, 3);
    assert.equal(content.length, 13);
});

test("builds Seedance video task payload with image and video references", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-260128",
            seedanceModel: "doubao-seedance-2-0-260128",
            seedanceEndpointId: "ep-20260524233518-kxgt4",
            videoModel: "grok-imagine-video",
            videoSeconds: "11",
            size: "16:9",
            vquality: "720",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            videoSeed: "",
        },
        "prompt",
        ["image-url"],
        ["video-url"],
    );

    assert.deepEqual(payload.content, [
        { type: "text", text: "prompt" },
        { type: "image_url", image_url: { url: "image-url" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "video-url" }, role: "reference_video" },
    ]);
    assert.equal(payload.model, "ep-20260524233518-kxgt4");
    assert.equal(payload.duration, 11);
    assert.equal(payload.ratio, "16:9");
    assert.equal(payload.resolution, "720p");
    assert.equal(payload.generate_audio, true);
});

test("builds Seedance edit payload with the upstream video as source content", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "ep-seedance",
            videoSeconds: "6",
            size: "16:9",
            vquality: "720",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "",
            videoTaskMode: "edit",
            videoEditType: "remove",
        },
        "移除画面里的路牌",
        [
            { type: "video", url: "source-video-url" },
            { type: "image", url: "mask-image-url", role: "reference_image" },
        ],
    );

    assert.equal(payload.task_mode, "edit");
    assert.equal(payload.edit_type, "remove");
    assert.deepEqual(payload.content, [
        { type: "text", text: "移除画面里的路牌" },
        { type: "video_url", video_url: { url: "source-video-url" }, role: "source_video" },
        { type: "image_url", image_url: { url: "mask-image-url" }, role: "reference_image" },
    ]);
});

test("builds Seedance extend payload with source video and direction", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "ep-seedance",
            videoSeconds: "8",
            size: "16:9",
            vquality: "1080",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            videoSeed: "",
            videoTaskMode: "extend",
            videoExtendDirection: "backward",
        },
        "向前补出镜头开始前的街道环境",
        [{ type: "video", url: "source-video-url" }],
    );

    assert.equal(payload.task_mode, "extend");
    assert.equal(payload.extend_direction, "backward");
    assert.deepEqual(payload.content, [
        { type: "text", text: "向前补出镜头开始前的街道环境" },
        { type: "video_url", video_url: { url: "source-video-url" }, role: "source_video" },
    ]);
    assert.equal(payload.resolution, "1080p");
    assert.equal(payload.generate_audio, true);
});

test("normalizes Seedance duration to the supported 4 to 15 second range", () => {
    const baseConfig = {
        model: "doubao-seedance-2-0-260128",
        size: "16:9",
        vquality: "720",
        videoGenerateAudio: "false",
        videoWatermark: "false",
        videoSeed: "",
    };

    assert.equal(buildSeedanceVideoTaskPayload({ ...baseConfig, videoSeconds: "3" }, "prompt", []).duration, 4);
    assert.equal(buildSeedanceVideoTaskPayload({ ...baseConfig, videoSeconds: "11" }, "prompt", []).duration, 11);
    assert.equal(buildSeedanceVideoTaskPayload({ ...baseConfig, videoSeconds: "20" }, "prompt", []).duration, 15);
});

test("normalizes legacy pixel size and low resolution to Seedance ratio and resolution", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-260128",
            videoSeconds: "6",
            size: "1280x720",
            vquality: "480",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "",
        },
        "prompt",
        [],
    );

    assert.equal(payload.ratio, "16:9");
    assert.equal(payload.resolution, "720p");
});

test("normalizes portrait UI ratios to Seedance portrait ratio", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-260128",
            videoSeconds: "6",
            size: "2:3",
            vquality: "720",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "",
        },
        "prompt",
        [],
    );

    assert.equal(payload.ratio, "9:16");
});

test("builds Seedance payload with first and last frame references", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-260128",
            videoSeconds: "10",
            size: "16:9",
            vquality: "720",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "",
            returnLastFrame: "true",
        },
        "图片1作为首帧，图片2作为尾帧",
        [
            { url: "first-frame-url", role: "first_frame" },
            { url: "last-frame-url", role: "last_frame" },
        ],
        [],
    );

    assert.deepEqual(payload.content, [
        { type: "text", text: "图片 1作为首帧，图片 2作为尾帧" },
        { type: "image_url", image_url: { url: "first-frame-url" }, role: "first_frame" },
        { type: "image_url", image_url: { url: "last-frame-url" }, role: "last_frame" },
    ]);
    assert.equal(payload.return_last_frame, true);
});

test("builds Seedance content in mixed multimodal input order", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-260128",
            videoSeconds: "10",
            size: "16:9",
            vquality: "720",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            videoSeed: "",
            returnLastFrame: "true",
        },
        "参考视频1、图片1和音频1生成",
        [
            { type: "video", url: "video-url" },
            { type: "image", url: "first-image-url", role: "first_frame" },
            { type: "audio", url: "audio-url" },
            { type: "image", url: "last-image-url", role: "last_frame" },
        ],
        [],
    );

    assert.deepEqual(payload.content, [
        { type: "text", text: "参考视频 1、图片 1和音频 1生成" },
        { type: "video_url", video_url: { url: "video-url" }, role: "reference_video" },
        { type: "image_url", image_url: { url: "first-image-url" }, role: "first_frame" },
        { type: "audio_url", audio_url: { url: "audio-url" }, role: "reference_audio" },
        { type: "image_url", image_url: { url: "last-image-url" }, role: "last_frame" },
    ]);
});

test("builds Seedance reference labels by material type and one-based index", () => {
    assert.equal(seedanceReferenceLabel("image", 1), "图片 1");
    assert.equal(seedanceReferenceLabel("video", 2), "视频 2");
    assert.equal(seedanceReferenceLabel("audio", 3), "音频 3");
});

test("builds compact label ranges for Seedance reference previews", () => {
    assert.equal(seedanceReferenceLabelRange("image", 0), "");
    assert.equal(seedanceReferenceLabelRange("image", 1), "图片 1");
    assert.equal(seedanceReferenceLabelRange("video", 3), "视频 1-3");
});

test("normalizes compact Seedance reference mentions in prompt text", () => {
    assert.equal(normalizeSeedancePromptReferenceMentions("图片1参考视频2并匹配音频3"), "图片 1参考视频 2并匹配音频 3");
    assert.equal(normalizeSeedancePromptReferenceMentions("视频2026年度质感，不要改写图片13"), "视频2026年度质感，不要改写图片13");
});

test("detects Asset ID references in prompt text", () => {
    assert.equal(hasSeedanceAssetIdReference("不要使用 asset://asset-20260224185115-hnjhb 指代素材"), true);
    assert.equal(hasSeedanceAssetIdReference("使用图片 1和视频 1"), false);
});

test("selects Seedance asset URI before regular image URL", () => {
    assert.equal(seedanceAssetURIFromImageReference({ assetUri: "asset://asset-20260601223331-pjzql", dataUrl: "data:image/png;base64,aaa" }), "asset://asset-20260601223331-pjzql");
    assert.equal(seedanceAssetURIFromImageReference({ dataUrl: "asset://asset-20260601223331-pjzql" }), "asset://asset-20260601223331-pjzql");
    assert.equal(seedanceAssetURIFromImageReference({ dataUrl: "data:image/png;base64,aaa" }), "");
});

test("selects Seedance asset URI before regular video URL", () => {
    assert.equal(seedanceAssetURIFromVideoReference({ assetUri: "asset://asset-video", url: "blob:video" }), "asset://asset-video");
    assert.equal(seedanceAssetURIFromVideoReference({ url: "asset://asset-video" }), "asset://asset-video");
    assert.equal(seedanceAssetURIFromVideoReference({ url: "blob:video" }), "");
});
