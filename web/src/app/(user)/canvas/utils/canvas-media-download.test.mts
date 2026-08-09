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
            assetNodeNumber: 7,
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
    const firstNode = versionedNode("image", "version-1");
    const secondNode = versionedNode("image", "version-2");
    const first = mediaDownload.canvasMediaDownloadFilename?.(firstNode, "毕业/典礼画布", [firstNode]);
    const second = mediaDownload.canvasMediaDownloadFilename?.(secondNode, "毕业/典礼画布", [secondNode]);

    assert.equal(first, "毕业-典礼画布-节点007-v1.png");
    assert.equal(second, "毕业-典礼画布-节点007-v2.png");
    assert.notEqual(first, second);
});

test("uses v1 in the canonical filename when a node has no media versions", () => {
    assert.equal(typeof mediaDownload.canvasMediaDownloadFilename, "function");
    const node = { ...versionedNode("video", "version-1"), metadata: { assetNodeNumber: 7, content: "blob:video" } };
    assert.equal(mediaDownload.canvasMediaDownloadFilename?.(node, "毕业典礼画布", [node]), "毕业典礼画布-节点007-v1.mp4");
});

test("the canvas download action uses the version-aware filename", () => {
    const hook = readFileSync(new URL("../hooks/use-canvas-media-cache.ts", import.meta.url), "utf8");
    assert.match(hook, /canvasMediaDownloadFilename\(node, canvasTitle, getNodes\(\)\)/);
});

test("generated canvas media cache owns the semantic filename instead of accepting internal IDs", () => {
    const cacheHook = readFileSync(new URL("../hooks/use-canvas-media-cache.ts", import.meta.url), "utf8");
    const actionFiles = [
        "../hooks/use-canvas-video-generation-actions.ts",
        "../hooks/use-canvas-video-task-refresh.ts",
        "../hooks/use-canvas-video-task-recovery.ts",
        "../hooks/use-canvas-generation-retry-actions.ts",
    ];

    assert.equal((cacheHook.match(/canvasMediaDownloadFilename\(node, canvasTitle, getNodes\(\)\)/g) || []).length, 2);
    assert.doesNotMatch(cacheHook, /cacheUploadedCanvasMedia: \(file: UploadedFile, filename: string,/);
    for (const file of actionFiles) {
        const source = readFileSync(new URL(file, import.meta.url), "utf8");
        assert.doesNotMatch(source, /cacheUploadedCanvasMedia\(video, `\$\{(?:videoId|node\.id)\}\.mp4`,/);
    }
});

test("semantic filename calculation does not mutate asset identity or reference metadata", () => {
    const node = versionedNode("video", "version-2");
    node.metadata = {
        ...node.metadata,
        storageKey: "media:stable-storage-key",
        sourceAssetId: "asset-stable-id",
        referenceAssets: [{ assetId: "reference-asset", assetVersionId: "reference-version" }],
        volcengineAsset: { assetId: "volcengine-asset", groupId: "volcengine-group", status: "Active", publicUrl: "https://example.com/reference.png" },
        projectCache: { fileId: "cache-file-id", relativePath: "videos/original.mp4", status: "ready" },
    };
    const before = structuredClone(node);

    assert.equal(mediaDownload.canvasMediaDownloadFilename(node, "毕业典礼画布", [node]), "毕业典礼画布-节点007-v2.mp4");
    assert.deepEqual(node, before);
});

test("generated canvas media always requires its source node for cache classification", () => {
    const hook = readFileSync(new URL("../hooks/use-canvas-media-cache.ts", import.meta.url), "utf8");
    assert.doesNotMatch(hook, /node\?: CanvasNodeData/);
    assert.match(hook, /const context = nodeProjectCacheContext\(node,/);
});
