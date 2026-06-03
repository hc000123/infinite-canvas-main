import assert from "node:assert/strict";
import test from "node:test";

import { applyGeneratedImageToNodes, applyImageGenerationFinalStatus, applyImageGenerationStartNodes, applyImageTargetError, buildCompletedVideoNode } from "./canvas-node-status.ts";
import type { CanvasNodeData } from "../types.ts";

const node = (id: string, type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 10, y: 20 },
    width: 100,
    height: 80,
    metadata,
});

test("starts image generation by updating source node and appending generated nodes", () => {
    const rootNode = node("root", "image", { status: "loading", prompt: "画一张图" });
    const childNode = node("child", "image", { status: "loading", batchRootId: "root" });
    const result = applyImageGenerationStartNodes({
        nodes: [node("config", "config")],
        nodeId: "config",
        prompt: "画一张图",
        isConfigNode: true,
        isEmptyImageNode: false,
        isImageNode: false,
        parentConfig: { width: 260, height: 150 },
        rootNode,
        childNodes: [childNode],
    });

    assert.equal(result.length, 3);
    assert.equal(result[0].metadata?.status, "loading");
    assert.equal(result[0].metadata?.prompt, "画一张图");
    assert.equal(result[1].id, "root");
    assert.equal(result[2].id, "child");
});

test("writes generated image metadata to target and tracks primary image on root", () => {
    const result = applyGeneratedImageToNodes({
        nodes: [node("root", "image"), node("child", "image")],
        rootId: "root",
        targetId: "child",
        imageSize: { width: 240, height: 160 },
        imageMetadata: { content: "blob:image", storageKey: "image:1", status: "success" },
    });

    const root = result.find((item) => item.id === "root");
    const child = result.find((item) => item.id === "child");
    assert.equal(root?.metadata?.primaryImageId, "child");
    assert.equal(root?.width, 240);
    assert.equal(child?.metadata?.content, "blob:image");
    assert.equal(child?.width, 240);
});

test("marks failed image target and final batch status without touching unrelated nodes", () => {
    const errored = applyImageTargetError([node("root", "image"), node("other", "text")], "root", "生成失败");
    assert.equal(errored[0].metadata?.status, "error");
    assert.equal(errored[0].metadata?.errorDetails, "生成失败");
    assert.equal(errored[1].metadata?.status, undefined);

    const finalNodes = applyImageGenerationFinalStatus({
        nodes: errored,
        nodeId: "config",
        rootId: "root",
        isConfigNode: false,
        isEmptyImageNode: false,
        hasSuccess: false,
    });
    assert.equal(finalNodes[0].metadata?.status, "error");
    assert.equal(finalNodes[0].metadata?.errorDetails, "全部图片生成失败");
});

test("builds completed video node with centered size and merged metadata", () => {
    const videoNode = { ...node("video", "video", { status: "loading", taskStatus: "running" }), width: 420, height: 236 };
    const result = buildCompletedVideoNode({
        videoNode,
        videoSize: { width: 320, height: 180 },
        videoMetadata: { content: "blob:video", storageKey: "video:1", status: "success", mimeType: "video/mp4" },
        cachedVideoMetadata: { cacheUrl: "/api/canvas/media-cache/video.mp4", cacheFilename: "video.mp4" },
        taskMetadata: { taskId: "task-1", taskStatus: "succeeded", videoUrl: "https://example.com/video.mp4" },
        generationMetadata: { model: "seedance", provider: "volcengine-ark", relationType: "variant", videoActionType: "variant" },
        prompt: "新的提示词",
    });

    assert.equal(result.width, 320);
    assert.equal(result.height, 180);
    assert.equal(result.position.x, 60);
    assert.equal(result.position.y, 48);
    assert.equal(result.metadata?.content, "blob:video");
    assert.equal(result.metadata?.cacheFilename, "video.mp4");
    assert.equal(result.metadata?.taskId, "task-1");
    assert.equal(result.metadata?.taskStatus, "succeeded");
    assert.equal(result.metadata?.prompt, "新的提示词");
    assert.equal(result.metadata?.relationType, "variant");
    assert.equal(result.metadata?.errorDetails, undefined);
});
