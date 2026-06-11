import assert from "node:assert/strict";
import test from "node:test";

import { buildUploadedAudioFileNode, buildUploadedImageFileNode, buildUploadedVideoFileNode, replaceNodeWithUploadedImageFile, replaceNodeWithUploadedVideoFile } from "./canvas-uploaded-file-node.ts";

const baseNode = {
    id: "node-1",
    type: "image",
    title: "旧节点",
    position: { x: 100, y: 100 },
    width: 300,
    height: 200,
        metadata: {
            status: "error",
            errorDetails: "旧错误",
            sourceAssetId: "old-asset",
            assetReferenceMode: "fixed-version",
            volcengineAsset: {
                assetId: "old-volcengine-asset",
                groupId: "group",
                projectName: "default",
                status: "Active",
                publicUrl: "https://example.com/old.png",
                submittedAt: "2026-06-01T00:00:00Z",
                updatedAt: "2026-06-01T00:00:00Z",
            },
            isBatchRoot: true,
            model: "old-model",
            primaryImageId: "image-old",
    },
};

test("builds centered uploaded image, video and audio nodes", () => {
    const imageNode = buildUploadedImageFileNode({
        id: "image-node",
        title: "图片",
        center: { x: 500, y: 300 },
        file: { width: 800, height: 400 } as never,
        metadata: { content: "image-url" },
    });
    const videoNode = buildUploadedVideoFileNode({
        id: "video-node",
        title: "视频",
        center: { x: 500, y: 300 },
        file: { width: 1920, height: 1080 } as never,
        metadata: { content: "video-url" },
    });
    const audioNode = buildUploadedAudioFileNode({
        id: "audio-node",
        title: "音频",
        center: { x: 500, y: 300 },
        file: {} as never,
        metadata: { content: "audio-url" },
    });

    assert.deepEqual([imageNode.width, imageNode.height, imageNode.position.x, imageNode.position.y], [640, 320, 180, 140]);
    assert.deepEqual([videoNode.width, videoNode.height, videoNode.position.x, videoNode.position.y], [420, 236.25, 290, 181.875]);
    assert.deepEqual([audioNode.width, audioNode.height, audioNode.position.x, audioNode.position.y], [340, 120, 330, 240]);
});

test("replaces image nodes without moving and clears image generation metadata", () => {
    const next = replaceNodeWithUploadedImageFile({
        currentNode: baseNode as never,
        title: "新图片",
        file: { width: 400, height: 400 } as never,
        metadata: { content: "new-image", status: "success" },
    });

    assert.equal(next.title, "新图片");
    assert.deepEqual(next.position, baseNode.position);
    assert.deepEqual([next.width, next.height], [400, 400]);
    assert.equal(next.metadata?.errorDetails, undefined);
    assert.equal(next.metadata?.isBatchRoot, undefined);
    assert.equal(next.metadata?.model, undefined);
    assert.equal(next.metadata?.sourceAssetId, undefined);
    assert.equal(next.metadata?.assetReferenceMode, undefined);
    assert.equal(next.metadata?.volcengineAsset, undefined);
});

test("replaces video nodes around the original node center", () => {
    const next = replaceNodeWithUploadedVideoFile({
        currentNode: baseNode as never,
        title: "新视频",
        file: { width: 1920, height: 1080 } as never,
        metadata: { content: "new-video", status: "success" },
    });

    assert.equal(next.type, "video");
    assert.deepEqual([next.width, next.height], [420, 236.25]);
    assert.deepEqual(next.position, { x: 40, y: 81.875 });
    assert.equal(next.metadata?.errorDetails, undefined);
    assert.equal(next.metadata?.sourceAssetId, undefined);
    assert.equal(next.metadata?.assetReferenceMode, undefined);
    assert.equal(next.metadata?.volcengineAsset, undefined);
});
