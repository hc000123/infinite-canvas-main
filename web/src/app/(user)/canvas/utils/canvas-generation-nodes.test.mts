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

test("generated media keeps prompt documents and inherits only used media connections", () => {
    const promptDocument = {
        version: 1 as const,
        blocks: [{ type: "reference" as const, nodeId: "image-ref", kind: "image" as const, label: "图片 1" }],
    };
    const sourceNode = {
        id: "config-1",
        type: "config" as const,
        title: "生成配置",
        position: { x: 0, y: 0 },
        width: 320,
        height: 420,
        metadata: { promptDocument },
    };
    const sourceConnections = [
        { id: "image-link", fromNodeId: "image-ref", toNodeId: "config-1", toHandle: "first_frame" },
        { id: "text-link", fromNodeId: "text-ref", toNodeId: "config-1" },
    ];
    const image = createImageGenerationNodes({
        nodeId: sourceNode.id,
        sourceNode,
        prompt: "图片 1 起飞",
        count: 1,
        metadata: { promptDocument },
        sourceConnections,
        referenceNodeIds: ["image-ref"],
    });
    const video = createVideoGenerationNode({
        nodeId: sourceNode.id,
        sourceNode,
        prompt: "图片 1 起飞",
        spec: { width: 420, height: 236 },
        metadata: { promptDocument },
        sourceConnections,
        referenceNodeIds: ["image-ref"],
    });

    assert.deepEqual(image.rootNode.metadata.promptDocument, promptDocument);
    assert.deepEqual(video.videoNode.metadata?.promptDocument, promptDocument);
    assert.deepEqual(
        image.connections.map(({ fromNodeId, toNodeId, toHandle }) => ({ fromNodeId, toNodeId, toHandle })),
        [
            { fromNodeId: "config-1", toNodeId: image.rootId, toHandle: undefined },
            { fromNodeId: "image-ref", toNodeId: image.rootId, toHandle: "first_frame" },
        ],
    );
    assert.deepEqual(
        video.connections.map(({ fromNodeId, toNodeId, toHandle }) => ({ fromNodeId, toNodeId, toHandle })),
        [
            { fromNodeId: "image-ref", toNodeId: video.videoId, toHandle: "first_frame" },
            { fromNodeId: "config-1", toNodeId: video.videoId, toHandle: undefined },
        ],
    );
});

test("in-place media generation does not duplicate existing reference connections", () => {
    const sourceConnections = [{ id: "image-link", fromNodeId: "image-ref", toNodeId: "media-target", toHandle: "first_frame" }];
    const emptyImageNode = {
        id: "media-target",
        type: "image" as const,
        title: "空图片",
        position: { x: 0, y: 0 },
        width: 420,
        height: 420,
        metadata: {},
    };
    const emptyVideoNode = { ...emptyImageNode, type: "video" as const, title: "空视频", height: 236 };

    const image = createImageGenerationNodes({
        nodeId: emptyImageNode.id,
        sourceNode: emptyImageNode,
        prompt: "生成",
        count: 1,
        metadata: {},
        sourceConnections,
        referenceNodeIds: ["image-ref"],
    });
    const video = createVideoGenerationNode({
        nodeId: emptyVideoNode.id,
        sourceNode: emptyVideoNode,
        prompt: "生成",
        spec: { width: 420, height: 236 },
        metadata: {},
        sourceConnections,
        referenceNodeIds: ["image-ref"],
    });

    assert.deepEqual(image.connections, []);
    assert.deepEqual(video.connections, []);
});
