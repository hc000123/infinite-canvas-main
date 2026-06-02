import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasGenerationContext } from "../utils/canvas-generation-inputs.ts";

test("builds generation context with upstream video references", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "text", type: "text", title: "Text", metadata: { content: "雨夜街道" } },
            { id: "image", type: "image", title: "Image", metadata: { content: "image-url", storageKey: "image:key", mimeType: "image/png" } },
            { id: "video", type: "video", title: "Video", metadata: { content: "video-url", storageKey: "video:key", mimeType: "video/mp4" } },
            { id: "target", type: "video", title: "Target", metadata: {} },
        ],
        [
            { id: "c1", fromNodeId: "text", toNodeId: "target" },
            { id: "c2", fromNodeId: "image", toNodeId: "target" },
            { id: "c3", fromNodeId: "video", toNodeId: "target" },
        ],
        "生成一个广告片",
    );

    assert.equal(context.videoCount, 1);
    assert.deepEqual(context.referenceVideos, [{ id: "video", name: "Video.mp4", url: "video-url", storageKey: "video:key", type: "video/mp4" }]);
    assert.equal(context.prompt, "生成一个广告片\n\n雨夜街道");
});

test("uses upstream Ark video URL for generated video references", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            {
                id: "video",
                type: "video",
                title: "Video",
                metadata: {
                    content: "blob:http://127.0.0.1:3000/local-video",
                    videoUrl: "https://ark.example.com/generated-video.mp4",
                    storageKey: "video:key",
                    mimeType: "video/mp4",
                },
            },
            { id: "target", type: "config", title: "Target", metadata: { generationMode: "video" } },
        ],
        [{ id: "c1", fromNodeId: "video", toNodeId: "target" }],
        "编辑视频",
    );

    assert.equal(context.videoCount, 1);
    assert.deepEqual(context.referenceVideos, [{ id: "video", name: "Video.mp4", url: "https://ark.example.com/generated-video.mp4", storageKey: undefined, type: "video/mp4" }]);
});

test("uses active Volcengine asset URI for Seedance image references", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            {
                id: "image",
                type: "image",
                title: "男配",
                metadata: {
                    content: "image-url",
                    storageKey: "image:key",
                    mimeType: "image/png",
                    volcengineAsset: {
                        assetId: "asset-20260601223331-pjzql",
                        groupId: "group-20260601223330-j85dh",
                        projectName: "default",
                        status: "Active",
                        publicUrl: "https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets/images/man.png",
                        submittedAt: "2026-06-01T14:23:31Z",
                        updatedAt: "2026-06-01T14:23:31Z",
                    },
                },
            },
            { id: "target", type: "video", title: "Target", metadata: {} },
        ],
        [{ id: "c1", fromNodeId: "image", toNodeId: "target" }],
        "生成一个广告片",
    );

    assert.equal(context.referenceImages[0]?.assetUri, "asset://asset-20260601223331-pjzql");
});

test("defaults upstream video image references to normal references", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "image-1", type: "image", title: "角色", metadata: { content: "image-one", storageKey: "image:one", mimeType: "image/png" } },
            { id: "image-2", type: "image", title: "服装", metadata: { content: "image-two", storageKey: "image:two", mimeType: "image/png" } },
            { id: "target", type: "config", title: "Config", metadata: { generationMode: "video" } },
        ],
        [
            { id: "c1", fromNodeId: "image-1", toNodeId: "target" },
            { id: "c2", fromNodeId: "image-2", toNodeId: "target" },
        ],
        "多人物参考生成",
    );

    assert.deepEqual(
        context.referenceImages.map((image) => image.seedanceRole),
        ["reference_image", "reference_image"],
    );
});

test("applies selected video reference image mode before manual role overrides", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "image-1", type: "image", title: "首帧", metadata: { content: "image-one", storageKey: "image:one", mimeType: "image/png" } },
            { id: "image-2", type: "image", title: "参考", metadata: { content: "image-two", storageKey: "image:two", mimeType: "image/png" } },
            {
                id: "target",
                type: "config",
                title: "Config",
                metadata: {
                    generationMode: "video",
                    videoReferenceImageMode: "first_frame",
                    referenceRoles: [{ nodeId: "image-2", kind: "image", role: "last_frame", index: 2 }],
                },
            },
        ],
        [
            { id: "c1", fromNodeId: "image-1", toNodeId: "target" },
            { id: "c2", fromNodeId: "image-2", toNodeId: "target" },
        ],
        "首帧图生视频",
    );

    assert.deepEqual(
        context.referenceImages.map((image) => image.seedanceRole),
        ["first_frame", "last_frame"],
    );
});

test("carries Seedance first and last frame image roles from config node metadata", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "first", type: "image", title: "首帧", metadata: { content: "first-url", storageKey: "image:first", mimeType: "image/png" } },
            { id: "last", type: "image", title: "尾帧", metadata: { content: "last-url", storageKey: "image:last", mimeType: "image/png" } },
            {
                id: "target",
                type: "config",
                title: "Config",
                metadata: {
                    generationMode: "video",
                    referenceRoles: [
                        { nodeId: "first", kind: "image", role: "first_frame", index: 1 },
                        { nodeId: "last", kind: "image", role: "last_frame", index: 2 },
                    ],
                },
            },
        ],
        [
            { id: "c1", fromNodeId: "first", toNodeId: "target" },
            { id: "c2", fromNodeId: "last", toNodeId: "target" },
        ],
        "生成连续视频",
    );

    assert.deepEqual(
        context.referenceImages.map((image) => image.seedanceRole),
        ["first_frame", "last_frame"],
    );
});

test("builds mixed image, video, and audio references in configured input order", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "image", type: "image", title: "首帧", metadata: { content: "image-url", storageKey: "image:first", mimeType: "image/png" } },
            { id: "video", type: "video", title: "运镜", metadata: { content: "video-url", storageKey: "video:ref", mimeType: "video/mp4" } },
            { id: "audio", type: "audio", title: "节奏", metadata: { content: "audio-url", storageKey: "audio:ref", mimeType: "audio/mpeg" } },
            {
                id: "target",
                type: "config",
                title: "Config",
                metadata: {
                    generationMode: "video",
                    inputOrder: ["video", "image", "audio"],
                    referenceRoles: [{ nodeId: "image", kind: "image", role: "first_frame", index: 1 }],
                },
            },
        ],
        [
            { id: "c1", fromNodeId: "image", toNodeId: "target" },
            { id: "c2", fromNodeId: "video", toNodeId: "target" },
            { id: "c3", fromNodeId: "audio", toNodeId: "target" },
        ],
        "生成连续视频",
    );

    assert.equal(context.imageCount, 1);
    assert.equal(context.videoCount, 1);
    assert.equal(context.audioCount, 1);
    assert.deepEqual(
        context.referenceInputs.map((input) => `${input.type}:${input.nodeId}`),
        ["video:video", "image:image", "audio:audio"],
    );
    assert.deepEqual(context.referenceAudios, [{ id: "audio", name: "节奏.mp3", url: "audio-url", storageKey: "audio:ref", type: "audio/mpeg" }]);
});
