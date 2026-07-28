import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { freezeCanvasConnectionSources, planCanvasBatchConnections } from "./canvas-batch-connections.ts";

const node = (id, type) => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: {},
});

test("freezes every selected node for an ordinary source drag", () => {
    assert.deepEqual(
        freezeCanvasConnectionSources(
            { nodeId: "image-2", handleType: "source" },
            new Set(["image-1", "image-2", "image-3"]),
            [node("image-1", "image"), node("image-2", "image"), node("image-3", "image")],
        ).map((source) => source.nodeId),
        ["image-1", "image-2", "image-3"],
    );
});

test("keeps input, specialized, and unselected drags single-source", () => {
    const selected = new Set(["image-1", "image-2"]);
    const nodes = [node("image-1", "image"), node("image-2", "image"), node("image-3", "image")];

    assert.deepEqual(freezeCanvasConnectionSources({ nodeId: "image-1", handleType: "target" }, selected, nodes), [{ nodeId: "image-1", handleType: "target" }]);
    assert.deepEqual(freezeCanvasConnectionSources({ nodeId: "image-1", handleType: "source", handleId: "first_frame" }, selected, nodes), [{ nodeId: "image-1", handleType: "source", handleId: "first_frame" }]);
    assert.deepEqual(freezeCanvasConnectionSources({ nodeId: "image-3", handleType: "source" }, selected, nodes), [{ nodeId: "image-3", handleType: "source" }]);
});

test("plans valid connections while skipping invalid and duplicate sources", () => {
    const result = planCanvasBatchConnections({
        sources: [
            { nodeId: "image-1", handleType: "source" },
            { nodeId: "image-2", handleType: "source" },
            { nodeId: "config-1", handleType: "source" },
        ],
        targetNodeId: "video-1",
        nodes: [node("image-1", "image"), node("image-2", "image"), node("config-1", "config"), node("video-1", "video")],
        existingConnections: [{ id: "existing", fromNodeId: "image-1", toNodeId: "video-1" }],
        normalizeConnection: (fromNodeId, toNodeId) => (fromNodeId === "config-1" ? null : { fromNodeId, toNodeId }),
    });

    assert.deepEqual(result.connections, [{ fromNodeId: "image-2", toNodeId: "video-1" }]);
    assert.equal(result.skippedDuplicate, 1);
    assert.equal(result.skippedInvalid, 1);
});

test("reuses frozen sources when one new target is created", () => {
    const sourceNodes = [node("image-1", "image"), node("image-2", "image")];
    const frozen = freezeCanvasConnectionSources({ nodeId: "image-1", handleType: "source" }, new Set(sourceNodes.map((item) => item.id)), sourceNodes);
    const target = node("video-new", "video");
    const result = planCanvasBatchConnections({
        sources: frozen,
        targetNodeId: target.id,
        nodes: [...sourceNodes, target],
        existingConnections: [],
        normalizeConnection: (fromNodeId, toNodeId) => ({ fromNodeId, toNodeId }),
    });

    assert.deepEqual(result.connections.map((item) => item.fromNodeId), ["image-1", "image-2"]);
});

test("the connection hook freezes selected sources and the page supplies the selection ref", () => {
    const hook = readFileSync(new URL("../hooks/use-canvas-connections.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../[id]/canvas-client-page.tsx", import.meta.url), "utf8");

    assert.match(hook, /freezeCanvasConnectionSources\(anchor, selectedNodeIdsRef\.current, nodesRef\.current\)/);
    assert.match(hook, /connections:\s*connectingSourcesRef\.current/);
    assert.match(hook, /planCanvasBatchConnections\(/);
    assert.match(hook, /applyCanvasInputOrder/);
    assert.match(hook, /nextInputSourceIds/);
    assert.match(hook, /setSelectedNodeIds\(new Set\(\[toNodeId\]\)\)/);
    assert.match(hook, /openConnectedTargetPanel\(toNodeId, nodesRef\.current, setDialogNodeId\)/);
    assert.match(hook, /type !== CanvasNodeType\.Audio/);
    assert.match(page, /useCanvasConnections\([\s\S]*?selectedNodeIdsRef,/);
});

test("the text image shortcut creates an image target without starting generation", () => {
    const derivatives = readFileSync(new URL("../hooks/use-canvas-node-derivative-actions.ts", import.meta.url), "utf8");
    const shortcut = derivatives.slice(derivatives.indexOf("const generateImageFromTextNode"), derivatives.indexOf("return {", derivatives.indexOf("const generateImageFromTextNode")));

    assert.match(shortcut, /const nodeSize = getNodeSpec\(CanvasNodeType\.Image\)/);
    assert.match(shortcut, /createNode\(\s*CanvasNodeType\.Image,/);
    assert.doesNotMatch(shortcut, /handleGenerateNode|requestImage|requestEdit/);
});
