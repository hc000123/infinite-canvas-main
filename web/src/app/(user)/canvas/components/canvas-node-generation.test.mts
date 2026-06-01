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
