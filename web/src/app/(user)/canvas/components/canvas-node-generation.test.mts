import assert from "node:assert/strict";
import test from "node:test";

import { applyCanvasInputOrder, buildCanvasGenerationContext, buildCanvasGenerationInputIndex, buildCanvasGenerationInputs, buildCanvasGenerationInputsFromIndex, resolveCanvasEffectivePrompt } from "../utils/canvas-generation-inputs.ts";

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
    assert.equal(context.prompt, "雨夜街道\n\n生成一个广告片");
});

test("uses a default refinement request for an empty text target with connected text", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "source", type: "text", title: "原文", metadata: { content: "这是一段需要优化的文本。" } },
            { id: "target", type: "text", title: "优化结果", metadata: {} },
        ],
        [{ fromNodeId: "source", toNodeId: "target" }],
        "",
    );

    assert.equal(
        resolveCanvasEffectivePrompt({ mode: "text", localPrompt: "", editingTextNode: false, context }),
        "这是一段需要优化的文本。\n\n优化要求：保持原意，优化表达，使内容更清晰、自然、完整。",
    );
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

test("persists connected input order without replacing an explicit order", () => {
    const nodes = [
        { id: "image-a", type: "image", title: "A", metadata: { content: "asset://A" } },
        { id: "image-b", type: "image", title: "B", metadata: { content: "asset://B" } },
        { id: "image-c", type: "image", title: "C", metadata: { content: "asset://C" } },
        { id: "target", type: "video", title: "视频", metadata: { inputOrder: ["missing", "image-b", "image-a"] } },
    ];

    const next = applyCanvasInputOrder(nodes, "target", ["image-a", "image-b", "image-c", "image-a"]);

    assert.deepEqual(
        next.find((node) => node.id === "target")?.metadata?.inputOrder,
        ["image-b", "image-a", "image-c"],
    );
});

test("keeps first and last frame roles stable when connection storage order changes", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "image-a", type: "image", title: "A", metadata: { content: "asset://A" } },
            { id: "image-b", type: "image", title: "B", metadata: { content: "asset://B" } },
            {
                id: "target",
                type: "video",
                title: "视频",
                metadata: {
                    inputOrder: ["image-a", "image-b"],
                    videoReferenceImageMode: "first_last_frame",
                },
            },
        ],
        [
            { id: "connection-b", fromNodeId: "image-b", toNodeId: "target" },
            { id: "connection-a", fromNodeId: "image-a", toNodeId: "target" },
        ],
        "生成视频",
    );

    assert.deepEqual(
        context.referenceImages.map((image) => [image.id, image.seedanceRole]),
        [
            ["image-a", "first_frame"],
            ["image-b", "last_frame"],
        ],
    );
});

test("builds the same ordered inputs from a shared topology index", () => {
    const nodes = [
        { id: "text", type: "text", title: "描述", metadata: { content: "雨夜街道" } },
        { id: "image-a", type: "image", title: "首帧", metadata: { content: "asset://A" } },
        { id: "image-b", type: "image", title: "尾帧", metadata: { content: "asset://B" } },
        {
            id: "target",
            type: "config",
            title: "视频配置",
            metadata: {
                inputOrder: ["image-a", "text", "image-b"],
                videoReferenceImageMode: "first_last_frame" as const,
            },
        },
    ];
    const connections = [
        { fromNodeId: "image-b", toNodeId: "target" },
        { fromNodeId: "text", toNodeId: "target" },
        { fromNodeId: "image-a", toNodeId: "target" },
    ];

    const expected = buildCanvasGenerationInputs("target", nodes, connections);
    const indexed = buildCanvasGenerationInputsFromIndex("target", buildCanvasGenerationInputIndex(nodes, connections));

    assert.deepEqual(indexed, expected);
    assert.deepEqual(
        indexed.map((input) => [input.nodeId, input.image?.seedanceRole]),
        [
            ["image-a", "first_frame"],
            ["text", undefined],
            ["image-b", "last_frame"],
        ],
    );
});
