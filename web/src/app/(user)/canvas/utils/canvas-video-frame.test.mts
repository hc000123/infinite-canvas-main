import assert from "node:assert/strict";
import test from "node:test";

import { buildCapturedVideoFrameNode } from "./canvas-video-frame.ts";

test("builds a current-frame image node beside the source video", () => {
    const result = buildCapturedVideoFrameNode({
        videoNode: {
            id: "video-1",
            type: "video",
            title: "源视频",
            position: { x: 100, y: 80 },
            width: 420,
            height: 236,
            metadata: { content: "blob:video", storageKey: "video:key" },
        },
        image: {
            url: "blob:frame",
            storageKey: "image:frame",
            width: 1280,
            height: 720,
            bytes: 2048,
            mimeType: "image/png",
        },
        imageMetadata: {
            content: "blob:frame",
            storageKey: "image:frame",
            status: "success",
            naturalWidth: 1280,
            naturalHeight: 720,
            bytes: 2048,
            mimeType: "image/png",
        },
        capturedTime: 3.4567,
        capturedAt: "2026-06-02T12:00:00.000Z",
    });

    assert.equal(result.frameNode.type, "image");
    assert.equal(result.frameNode.title, "当前帧");
    assert.equal(result.frameNode.position.x, 592);
    assert.equal(result.frameNode.metadata?.sourceVideoNodeId, "video-1");
    assert.equal(result.frameNode.metadata?.capturedFrameSourceVideoNodeId, "video-1");
    assert.equal(result.frameNode.metadata?.capturedFrameTime, 3.457);
    assert.equal(result.frameNode.metadata?.capturedFrameAt, "2026-06-02T12:00:00.000Z");
    assert.equal(result.frameNode.metadata?.capturedFrameSource, "current_frame");
    assert.deepEqual([result.connection.fromNodeId, result.connection.toNodeId], ["video-1", result.frameNode.id]);
});
