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
    type SeedanceOrderedReferenceInput,
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
    assert.equal(defaultSeedanceImageRole(0, "continue"), "reference_image");
});

test("rejects Seedance 2.0 references beyond the documented limits", () => {
    const images = Array.from({ length: 10 }, (_, index) => `image-${index}`);
    assert.throws(() => buildSeedanceContent("prompt", images), /Seedance 2\.0 最多支持 9 张图片/);
    assert.throws(
        () => buildSeedanceContent("prompt", images.slice(0, 9), ["video-1", "video-2", "video-3"], ["audio-1"]),
        /Seedance 2\.0 最多支持 12 个参考素材/,
    );
});

test("accepts Seedance 2.5 reference boundaries and rejects overflow", () => {
    const images = Array.from({ length: 30 }, (_, index) => `image-${index}`);
    const videos = Array.from({ length: 10 }, (_, index) => `video-${index}`);
    const audios = Array.from({ length: 10 }, (_, index) => `audio-${index}`);
    const content = buildSeedanceContent("prompt", images, videos, audios, "doubao-seedance-2-5");

    assert.equal(content.filter((item) => item.type === "image_url").length, 30);
    assert.equal(content.filter((item) => item.type === "video_url").length, 10);
    assert.equal(content.filter((item) => item.type === "audio_url").length, 10);
    assert.throws(() => buildSeedanceContent("prompt", [...images, "image-30"], [], [], "doubao-seedance-2-5"), /Seedance 2\.5 最多支持 30 张图片/);
    assert.throws(() => buildSeedanceContent("prompt", [], [...videos, "video-10"], [], "doubao-seedance-2-5"), /Seedance 2\.5 最多支持 10 个视频/);
    assert.throws(() => buildSeedanceContent("prompt", [], [], [...audios, "audio-10"], "doubao-seedance-2-5"), /Seedance 2\.5 最多支持 10 个音频/);
});

test("keeps ordered Seedance 2.5 references at the full boundary", () => {
    const references: SeedanceOrderedReferenceInput[] = [
        { type: "video", url: "video-0" },
        { type: "image", url: "image-0", role: "first_frame" },
        { type: "audio", url: "audio-0" },
        ...Array.from({ length: 29 }, (_, index) => ({ type: "image" as const, url: `image-${index + 1}` })),
        ...Array.from({ length: 9 }, (_, index) => ({ type: "video" as const, url: `video-${index + 1}` })),
        ...Array.from({ length: 9 }, (_, index) => ({ type: "audio" as const, url: `audio-${index + 1}` })),
    ];
    const content = buildSeedanceContent("按素材顺序生成", references, [], [], "doubao-seedance-2-5");

    assert.equal(content.length, 51);
    assert.deepEqual(content.slice(1, 4), [
        { type: "video_url", video_url: { url: "video-0" }, role: "reference_video" },
        { type: "image_url", image_url: { url: "image-0" }, role: "first_frame" },
        { type: "audio_url", audio_url: { url: "audio-0" }, role: "reference_audio" },
    ]);
});

test("rejects ordered Seedance 2.5 per-kind overflow", () => {
    const ordered = (type: "image" | "video" | "audio", count: number): SeedanceOrderedReferenceInput[] =>
        Array.from({ length: count }, (_, index): SeedanceOrderedReferenceInput => (type === "image" ? { type, url: `${type}-${index}`, role: "reference_image" } : { type, url: `${type}-${index}` }));

    assert.throws(() => buildSeedanceContent("prompt", ordered("image", 31), [], [], "doubao-seedance-2-5"), /最多支持 30 张图片/);
    assert.throws(() => buildSeedanceContent("prompt", ordered("video", 11), [], [], "doubao-seedance-2-5"), /最多支持 10 个视频/);
    assert.throws(() => buildSeedanceContent("prompt", ordered("audio", 11), [], [], "doubao-seedance-2-5"), /最多支持 10 个音频/);
});

test("accepts empty Seedance 2.5 prompt with audio and rejects empty content", () => {
    assert.deepEqual(buildSeedanceContent("   ", [], [], ["audio-url"], "doubao-seedance-2-5"), [{ type: "audio_url", audio_url: { url: "audio-url" }, role: "reference_audio" }]);
    assert.throws(() => buildSeedanceContent("   ", [], [], [], "doubao-seedance-2-5"), /缺少视频提示词或参考素材/);
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
    assert.equal(payload._seedance_task_mode, "generate");
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

    assert.equal("task_mode" in payload, false);
    assert.equal(payload._seedance_task_mode, "edit");
    assert.equal("edit_type" in payload, false);
    assert.deepEqual(payload.content, [
        { type: "text", text: "移除画面里的路牌" },
        { type: "video_url", video_url: { url: "source-video-url" }, role: "reference_video" },
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

    assert.equal("task_mode" in payload, false);
    assert.equal(payload._seedance_task_mode, "extend");
    assert.equal("extend_direction" in payload, false);
    assert.deepEqual(payload.content, [
        { type: "text", text: "向前补出镜头开始前的街道环境" },
        { type: "video_url", video_url: { url: "source-video-url" }, role: "reference_video" },
    ]);
    assert.equal(payload.resolution, "1080p");
    assert.equal(payload.generate_audio, true);
});

test("caps Seedance Fast model resolution to official 720p maximum", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-fast-260128",
            videoSeconds: "8",
            size: "16:9",
            vquality: "1080",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "",
        },
        "prompt",
        [],
    );

    assert.equal(payload.resolution, "720p");
});

test("keeps official Seedance 21:9 ratio", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-260128",
            videoSeconds: "8",
            size: "21:9",
            vquality: "720",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "",
        },
        "prompt",
        [],
    );

    assert.equal(payload.ratio, "21:9");
});

test("rejects unsupported Seedance audio-only references", () => {
    assert.throws(
        () =>
            buildSeedanceVideoTaskPayload(
                {
                    model: "doubao-seedance-2-0-260128",
                    videoSeconds: "8",
                    size: "16:9",
                    vquality: "720",
                    videoGenerateAudio: "true",
                    videoWatermark: "false",
                    videoSeed: "",
                },
                "只参考音频生成",
                [],
                [],
                ["audio-url"],
            ),
        /不支持纯音频或文本加音频输入/,
    );
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

test("builds Seedance 2.5 audio-only payload with 30 seconds and 480p", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "ep-seedance-25",
            seedanceModel: "doubao-seedance-2-5",
            seedanceEndpointId: "ep-seedance-25",
            videoSeconds: "30",
            size: "16:9",
            vquality: "480",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            videoSeed: "42",
        },
        "",
        [],
        [],
        ["audio-url"],
    );

    assert.deepEqual(payload.content, [{ type: "audio_url", audio_url: { url: "audio-url" }, role: "reference_audio" }]);
    assert.equal(payload.model, "ep-seedance-25");
    assert.equal(payload.duration, 30);
    assert.equal(payload.resolution, "480p");
    assert.equal(payload.seed, 42);
});

test("builds Seedance 2.5 edit and extend payloads with adaptive derived settings", () => {
    const baseConfig = {
        model: "doubao-seedance-2-5",
        videoSeconds: "20",
        size: "16:9",
        vquality: "1080",
        videoGenerateAudio: "false",
        videoWatermark: "false",
        videoSeed: "",
    };
    const edit = buildSeedanceVideoTaskPayload({ ...baseConfig, videoTaskMode: "edit" }, "edit", [{ type: "video", url: "source-video" }]);
    const extend = buildSeedanceVideoTaskPayload({ ...baseConfig, videoTaskMode: "extend" }, "extend", [{ type: "video", url: "source-video" }]);

    assert.equal(edit.duration, -1);
    assert.equal(edit._seedance_task_mode, "edit");
    assert.equal(edit.ratio, "adaptive");
    assert.equal(edit.resolution, "720p");
    assert.equal(extend.duration, 20);
    assert.equal(extend._seedance_task_mode, "extend");
    assert.equal(extend.ratio, "adaptive");
});

test("forces Seedance 2.5 frame content to adaptive without relying on config mode", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-5",
            videoSeconds: "12",
            size: "16:9",
            vquality: "720",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "",
        },
        "首帧继续运动",
        [{ url: "first-frame", role: "first_frame" }],
    );

    assert.equal(payload.ratio, "adaptive");
});

test("does not grant Seedance 2.5 payload capabilities to 2.50", () => {
    assert.throws(
        () =>
            buildSeedanceVideoTaskPayload(
                {
                    model: "doubao-seedance-2-50",
                    videoSeconds: "30",
                    size: "16:9",
                    vquality: "480",
                    videoGenerateAudio: "true",
                    videoWatermark: "false",
                    videoSeed: "",
                },
                "audio only",
                [],
                [],
                ["audio-url"],
            ),
        /Seedance 2\.0 不支持纯音频/,
    );
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
    assert.equal(normalizeSeedancePromptReferenceMentions("图片1、图片10、图片12、图片30，视频1、视频10，音频1、音频10"), "图片 1、图片 10、图片 12、图片 30，视频 1、视频 10，音频 1、音频 10");
    assert.equal(normalizeSeedancePromptReferenceMentions("视频2026年度质感，不要改写图片31、视频11、音频11"), "视频2026年度质感，不要改写图片31、视频11、音频11");
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

test("selects active Seedance asset URI before public video URL", () => {
    assert.equal(seedanceAssetURIFromVideoReference({ volcenginePublicUrl: "https://example.com/reference.mp4", assetUri: "asset://asset-video", url: "blob:video" }), "asset://asset-video");
    assert.equal(seedanceAssetURIFromVideoReference({ assetUri: "asset://asset-video", url: "blob:video" }), "asset://asset-video");
    assert.equal(seedanceAssetURIFromVideoReference({ url: "asset://asset-video" }), "asset://asset-video");
    assert.equal(seedanceAssetURIFromVideoReference({ url: "blob:video" }), "");
});
