import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CanvasNodeData } from "../types.ts";
import * as mediaDownload from "./canvas-media-download.ts";

function versionedNode(type: "image" | "video", currentMediaVersionId: string): CanvasNodeData {
    return {
        id: "node-1",
        type,
        title: "测试节点",
        position: { x: 0, y: 0 },
        width: 420,
        height: 236,
        metadata: {
            content: type === "video" ? "blob:video" : "data:image/png;base64,AA==",
            currentMediaVersionId,
            mediaVersions: [
                { id: "version-1", versionNumber: 1, kind: type, createdAt: "2026-07-23T00:00:00.000Z", prompt: "第一版", width: 420, height: 236, metadata: {} },
                { id: "version-2", versionNumber: 2, kind: type, createdAt: "2026-07-24T00:00:00.000Z", prompt: "第二版", width: 420, height: 236, metadata: {} },
            ],
        },
    };
}

test("uses the selected media version number in downloads from the same node", () => {
    assert.equal(typeof mediaDownload.canvasMediaDownloadFilename, "function");
    const first = mediaDownload.canvasMediaDownloadFilename?.(versionedNode("image", "version-1"));
    const second = mediaDownload.canvasMediaDownloadFilename?.(versionedNode("image", "version-2"));

    assert.equal(first, "canvas-image-node-1-v1.png");
    assert.equal(second, "canvas-image-node-1-v2.png");
    assert.notEqual(first, second);
});

test("keeps the original filename format for nodes without media versions", () => {
    assert.equal(typeof mediaDownload.canvasMediaDownloadFilename, "function");
    assert.equal(mediaDownload.canvasMediaDownloadFilename?.({ ...versionedNode("video", "version-1"), metadata: { content: "blob:video" } }), "canvas-video-node-1.mp4");
});

test("the canvas download action uses the version-aware filename", () => {
    const hook = readFileSync(new URL("../hooks/use-canvas-media-cache.ts", import.meta.url), "utf8");
    assert.match(hook, /canvasMediaDownloadFilename\(node\)/);
});
