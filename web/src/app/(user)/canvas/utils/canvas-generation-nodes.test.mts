import assert from "node:assert/strict";
import test from "node:test";

import { createVideoGenerationNode } from "./canvas-generation-nodes.ts";

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
