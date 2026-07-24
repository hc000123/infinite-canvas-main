import assert from "node:assert/strict";
import test from "node:test";

import { copySelectedCanvasItems, pasteCanvasClipboard } from "./canvas-clipboard.ts";

const nodes = [
    {
        id: "text-a",
        type: "text",
        title: "Text",
        position: { x: 10, y: 20 },
        width: 100,
        height: 50,
        metadata: { content: "hello" },
    },
    {
        id: "image-b",
        type: "image",
        title: "Image Copy",
        position: { x: 210, y: 120 },
        width: 80,
        height: 80,
        metadata: { prompt: "cat" },
    },
    {
        id: "video-c",
        type: "video",
        title: "Video",
        position: { x: 400, y: 120 },
        width: 160,
        height: 90,
        metadata: {},
    },
] as any[];

const connections = [
    { id: "conn-a-b", fromNodeId: "text-a", fromHandle: "right", toNodeId: "image-b", toHandle: "left" },
    { id: "conn-b-c", fromNodeId: "image-b", fromHandle: "right", toNodeId: "video-c", toHandle: "left" },
] as any[];

test("copies selected nodes and their incoming connections", () => {
    const clipboard = copySelectedCanvasItems(nodes, connections, new Set(["text-a", "image-b"]));

    assert.equal(clipboard?.nodes.length, 2);
    assert.equal(clipboard?.connections.length, 1);
    assert.equal(clipboard?.connections[0].id, "conn-a-b");
    assert.notEqual(clipboard?.nodes[0].position, nodes[0].position);
    assert.notEqual(clipboard?.nodes[0].metadata, nodes[0].metadata);
});

test("pastes nodes centered at the requested canvas position and remaps connections", () => {
    const clipboard = copySelectedCanvasItems(nodes, connections, new Set(["text-a", "image-b"]));
    const pasted = pasteCanvasClipboard(
        clipboard,
        { x: 500, y: 500 },
        {
            nodeId: (_node, index) => `new-node-${index}`,
            connectionId: (_connection, index) => `new-conn-${index}`,
        },
    );

    assert.deepEqual(
        pasted?.nodes.map((node) => node.id),
        ["new-node-0", "new-node-1"],
    );
    assert.deepEqual(pasted?.connections[0], {
        id: "new-conn-0",
        fromNodeId: "new-node-0",
        fromHandle: "right",
        toNodeId: "new-node-1",
        toHandle: "left",
    });
    assert.equal(pasted?.nodes[0].title, "Text Copy");
    assert.equal(pasted?.nodes[1].title, "Image Copy");
    assert.equal(pasted?.nodes[0].position.x, 360);
    assert.equal(pasted?.nodes[0].position.y, 410);
});

test("offsets pasted nodes when the requested position is already occupied", () => {
    const clipboard = copySelectedCanvasItems(nodes, connections, new Set(["text-a"]));
    const pasted = pasteCanvasClipboard(
        clipboard,
        { x: 60, y: 45 },
        {
            nodeId: () => "new-node",
            connectionId: () => "new-connection",
        },
        [{ ...nodes[0], position: { x: 10.0001, y: 19.9999 } }],
    );

    assert.deepEqual(pasted?.nodes[0].position, { x: 42, y: 52 });
});

test("duplicates a generated node with upstream connections but without generated results", () => {
    const draftDocument = {
        version: 1 as const,
        blocks: [
            { type: "reference" as const, nodeId: "image-first", kind: "image" as const, label: "图片 1" },
            { type: "text" as const, text: " 修改后的提示词" },
        ],
    };
    const sourceNodes = [
        { id: "image-first", type: "image", title: "首帧", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "first" } },
        { id: "image-last", type: "image", title: "尾帧", position: { x: 0, y: 160 }, width: 100, height: 100, metadata: { content: "last" } },
        {
            id: "video-result",
            type: "video",
            title: "视频结果",
            position: { x: 240, y: 0 },
            width: 420,
            height: 236,
            metadata: {
                prompt: "旧提示词",
                promptDocument: { version: 1, blocks: [{ type: "text", text: "旧提示词" }] },
                promptDraft: "修改后的提示词",
                promptDraftDocument: draftDocument,
                model: "seedance-2.0",
                ratio: "16:9",
                content: "blob:video-result",
                storageKey: "video:result",
                videoUrl: "https://example.com/result.mp4",
                mediaVersions: [{ id: "v1" }, { id: "v2" }],
                currentMediaVersionId: "v2",
                pendingMediaVersion: { prompt: "下一版", startedAt: "2026-07-24T00:00:00.000Z" },
                taskId: "task-old",
                taskStatus: "succeeded",
                status: "success",
                sourceAssetId: "asset-old",
                errorDetails: "旧错误",
                actionType: "variant",
                videoActionType: "variant",
                relationType: "variant",
                variantOfNodeId: "video-source",
            },
        },
        { id: "downstream", type: "config", title: "下游", position: { x: 760, y: 0 }, width: 340, height: 240, metadata: {} },
    ] as any[];
    const sourceConnections = [
        { id: "first-link", fromNodeId: "image-first", toNodeId: "video-result", fromHandle: "right", toHandle: "first_frame" },
        { id: "last-link", fromNodeId: "image-last", toNodeId: "video-result", fromHandle: "right", toHandle: "last_frame" },
        { id: "downstream-link", fromNodeId: "video-result", toNodeId: "downstream", fromHandle: "right", toHandle: "left" },
    ] as any[];
    const clipboard = copySelectedCanvasItems(sourceNodes, sourceConnections, new Set(["video-result"]));
    const pasted = pasteCanvasClipboard(clipboard, { x: 900, y: 400 }, {
        nodeId: () => "video-copy",
        connectionId: (_connection, index) => `copied-link-${index}`,
    });
    const copy = pasted?.nodes[0];

    assert.deepEqual(
        pasted?.connections.map(({ fromNodeId, toNodeId, toHandle }) => [fromNodeId, toNodeId, toHandle]),
        [
            ["image-first", "video-copy", "first_frame"],
            ["image-last", "video-copy", "last_frame"],
        ],
    );
    assert.equal(copy?.metadata?.prompt, "修改后的提示词");
    assert.deepEqual(copy?.metadata?.promptDocument, draftDocument);
    assert.equal(copy?.metadata?.model, "seedance-2.0");
    assert.equal(copy?.metadata?.ratio, "16:9");
    assert.equal(copy?.metadata?.content, undefined);
    assert.equal(copy?.metadata?.storageKey, undefined);
    assert.equal(copy?.metadata?.mediaVersions, undefined);
    assert.equal(copy?.metadata?.currentMediaVersionId, undefined);
    assert.equal(copy?.metadata?.pendingMediaVersion, undefined);
    assert.equal(copy?.metadata?.taskId, undefined);
    assert.equal(copy?.metadata?.sourceAssetId, undefined);
    assert.equal(copy?.metadata?.errorDetails, undefined);
    assert.equal(copy?.metadata?.actionType, undefined);
    assert.equal(copy?.metadata?.videoActionType, undefined);
    assert.equal(copy?.metadata?.relationType, undefined);
    assert.equal(copy?.metadata?.variantOfNodeId, undefined);
    assert.equal(copy?.metadata?.status, "idle");
});

test("remaps selected upstream nodes while keeping external upstream connections", () => {
    const sourceNodes = [
        { id: "external-image", type: "image", title: "外部素材", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "external" } },
        { id: "config", type: "config", title: "配置", position: { x: 200, y: 0 }, width: 340, height: 240, metadata: { inputOrder: ["external-image"], status: "success", aiTaskCredits: 18, creditLogId: "credit-old" } },
        {
            id: "video",
            type: "video",
            title: "视频",
            position: { x: 640, y: 0 },
            width: 420,
            height: 236,
            metadata: {
                promptDocument: { version: 1, blocks: [{ type: "reference", nodeId: "config", kind: "image", label: "配置引用" }] },
                referenceRoles: [{ nodeId: "config", kind: "image", role: "reference_image", index: 1 }],
                referenceOrder: [{ nodeId: "config", kind: "image", index: 1 }],
            },
        },
        { id: "downstream", type: "text", title: "下游", position: { x: 1160, y: 0 }, width: 340, height: 240, metadata: {} },
    ] as any[];
    const sourceConnections = [
        { id: "external-config", fromNodeId: "external-image", toNodeId: "config" },
        { id: "config-video", fromNodeId: "config", toNodeId: "video" },
        { id: "video-downstream", fromNodeId: "video", toNodeId: "downstream" },
    ] as any[];
    const clipboard = copySelectedCanvasItems(sourceNodes, sourceConnections, new Set(["config", "video"]));
    const pasted = pasteCanvasClipboard(clipboard, { x: 900, y: 500 }, {
        nodeId: (node) => `${node.id}-copy`,
        connectionId: (_connection, index) => `connection-copy-${index}`,
    });
    const pastedConfig = pasted?.nodes.find((node) => node.id === "config-copy");
    const pastedVideo = pasted?.nodes.find((node) => node.id === "video-copy");

    assert.deepEqual(
        pasted?.connections.map((item) => [item.fromNodeId, item.toNodeId]),
        [
            ["external-image", "config-copy"],
            ["config-copy", "video-copy"],
        ],
    );
    assert.deepEqual(pastedConfig?.metadata?.inputOrder, ["external-image"]);
    assert.equal(pastedConfig?.metadata?.status, "idle");
    assert.equal(pastedConfig?.metadata?.aiTaskCredits, undefined);
    assert.equal(pastedConfig?.metadata?.creditLogId, undefined);
    assert.equal(pastedVideo?.metadata?.promptDocument?.blocks[0]?.type, "reference");
    assert.equal((pastedVideo?.metadata?.promptDocument?.blocks[0] as any)?.nodeId, "config-copy");
    assert.equal(pastedVideo?.metadata?.referenceRoles?.[0]?.nodeId, "config-copy");
    assert.equal(pastedVideo?.metadata?.referenceOrder?.[0]?.nodeId, "config-copy");
});
