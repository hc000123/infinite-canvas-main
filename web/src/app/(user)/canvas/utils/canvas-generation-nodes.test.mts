import assert from "node:assert/strict";
import test from "node:test";

import { createImageGenerationNodes, createVideoGenerationNode } from "./canvas-generation-nodes.ts";

test("creates regenerated video variants without a canvas connection", () => {
    const sourceNode = {
        id: "video-source",
        type: "video" as const,
        title: "源视频",
        position: { x: 100, y: 200 },
        width: 420,
        height: 236,
        metadata: { content: "video-url" },
    };
    const result = createVideoGenerationNode({
        nodeId: sourceNode.id,
        sourceNode,
        prompt: "调整后的提示词",
        spec: { width: 420, height: 236 },
        metadata: {
            status: "loading",
            relationType: "variant",
            variantOfNodeId: sourceNode.id,
            sourceVideoNodeId: sourceNode.id,
            videoActionType: "variant",
        },
    });

    assert.deepEqual(result.connections, []);
    assert.equal(result.videoNode.metadata?.relationType, "variant");
    assert.equal(result.videoNode.metadata?.variantOfNodeId, sourceNode.id);
    assert.equal(result.videoNode.position.x, sourceNode.position.x + 48);
    assert.equal(result.videoNode.position.y, sourceNode.position.y + sourceNode.height + 72);
});

test("completed video regeneration targets the existing node", () => {
    const sourceNode = {
        id: "video-source",
        type: "video" as const,
        title: "源视频",
        position: { x: 100, y: 200 },
        width: 420,
        height: 236,
        metadata: { content: "blob:old", storageKey: "video:old", prompt: "旧提示词", status: "success" as const, taskId: "task-old", taskStatus: "succeeded" },
    };
    const result = createVideoGenerationNode({
        nodeId: sourceNode.id,
        sourceNode,
        prompt: "新提示词",
        spec: { width: 420, height: 236 },
        metadata: {
            status: "loading",
            pendingMediaVersion: { prompt: "新提示词", startedAt: "2026-07-22T16:00:00.000Z" },
        },
        replaceExistingResult: true,
    });

    assert.equal(result.videoId, sourceNode.id);
    assert.deepEqual(result.connections, []);
    assert.equal(result.videoNode.metadata?.content, "blob:old");
    assert.equal(result.videoNode.metadata?.prompt, "旧提示词");
    assert.equal(result.videoNode.metadata?.mediaVersions?.length, 1);
    assert.equal(result.videoNode.metadata?.pendingMediaVersion?.prompt, "新提示词");
    assert.equal(result.videoNode.metadata?.taskId, undefined);
    assert.equal(result.videoNode.metadata?.taskStatus, undefined);
});

test("uses short generated image titles while keeping the full prompt in metadata", () => {
    const prompt = "一个非常长的角色设定提示词，会继续描述人物设定、服装、光线、情绪、构图和时代感";
    const result = createImageGenerationNodes({ nodeId: "config-1", prompt, count: 3, metadata: {} });

    assert.equal(result.rootNode.title, "生成图片");
    assert.deepEqual(
        result.childNodes.map((node) => node.title),
        ["生成图片 1", "生成图片 2", "生成图片 3"],
    );
    assert.equal(result.rootNode.metadata.prompt, prompt);
    assert.equal(result.childNodes[0]?.metadata.prompt, prompt);
});
