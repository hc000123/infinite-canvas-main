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

test("copies only selected nodes and internal connections", () => {
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
