import assert from "node:assert/strict";
import test from "node:test";

import { buildInsertedMediaAssetNode } from "./canvas-inserted-media-node.ts";

const assetVersion = {
    assetId: "asset-1",
    assetVersionId: "version-1",
    versionNumber: 1,
    mode: "fixed-version" as const,
};

test("builds a centered video node from an inserted asset payload", () => {
    const node = buildInsertedMediaAssetNode(
        {
            kind: "video",
            title: "参考视频",
            url: "/video.mp4",
            storageKey: "video:v1",
            sourceAssetId: "asset-1",
            assetVersion,
            width: 1920,
            height: 1080,
        },
        "video-node",
        { x: 1000, y: 500 },
    );

    assert.equal(node.type, "video");
    assert.equal(node.width, 420);
    assert.equal(node.height, 236.25);
    assert.deepEqual(node.position, { x: 790, y: 381.875 });
    assert.equal(node.metadata?.content, "/video.mp4");
    assert.equal(node.metadata?.sourceAssetId, "asset-1");
    assert.equal(node.metadata?.assetReferenceMode, "fixed-version");
    assert.equal(node.metadata?.naturalWidth, 1920);
});

test("builds a centered audio node with default mime type", () => {
    const node = buildInsertedMediaAssetNode(
        {
            kind: "audio",
            title: "旁白",
            url: "/audio.mp3",
            storageKey: "audio:v1",
            sourceAssetId: "asset-1",
            assetVersion,
            bytes: 2048,
        },
        "audio-node",
        { x: 500, y: 300 },
    );

    assert.equal(node.type, "audio");
    assert.deepEqual([node.width, node.height], [340, 120]);
    assert.deepEqual(node.position, { x: 330, y: 240 });
    assert.equal(node.metadata?.mimeType, "audio/mpeg");
    assert.equal(node.metadata?.bytes, 2048);
    assert.equal(node.metadata?.assetReferenceMode, "fixed-version");
});
