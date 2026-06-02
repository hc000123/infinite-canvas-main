import assert from "node:assert/strict";
import test from "node:test";

import { buildContinuousVideoChain } from "./canvas-video-chain.ts";

test("builds a last-frame image and next video node for continuous Seedance chains", () => {
    const chain = buildContinuousVideoChain({
        videoNode: {
            id: "video-1",
            type: "video",
            title: "第一段",
            position: { x: 100, y: 120 },
            width: 420,
            height: 236,
            metadata: { status: "success" },
        },
        lastFrameImage: {
            url: "blob:last-frame",
            storageKey: "image:last-frame",
            width: 1280,
            height: 720,
            bytes: 1024,
            mimeType: "image/png",
        },
        lastFrameMetadata: {
            content: "blob:last-frame",
            storageKey: "image:last-frame",
            status: "success",
            naturalWidth: 1280,
            naturalHeight: 720,
            bytes: 1024,
            mimeType: "image/png",
        },
        config: {
            model: "ep-seedance",
            size: "16:9",
            videoProtocol: "volcengine-ark",
            videoSeconds: "6",
            vquality: "720",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoSeed: "42",
            returnLastFrame: "true",
        },
    });

    assert.equal(chain.lastFrameNode.type, "image");
    assert.equal(chain.lastFrameNode.title, "上一段尾帧");
    assert.equal(chain.lastFrameNode.metadata?.prompt, "Seedance return_last_frame");
    assert.equal(chain.nextVideoNode.type, "video");
    assert.equal(chain.nextVideoNode.title, "下一段视频");
    assert.equal(chain.nextVideoNode.metadata?.model, "ep-seedance");
    assert.equal(chain.nextVideoNode.metadata?.actionType, "continue");
    assert.equal(chain.nextVideoNode.metadata?.videoActionType, "continue");
    assert.equal(chain.nextVideoNode.metadata?.sourceVideoNodeId, "video-1");
    assert.equal(chain.nextVideoNode.metadata?.continuationOfNodeId, "video-1");
    assert.equal(chain.nextVideoNode.metadata?.variantOfNodeId, undefined);
    assert.equal(chain.nextVideoNode.metadata?.videoReferenceImageMode, "continue");
    assert.equal(chain.nextVideoNode.metadata?.referenceRoles?.[0]?.nodeId, chain.lastFrameNode.id);
    assert.equal(chain.nextVideoNode.metadata?.referenceRoles?.[0]?.role, "first_frame");
    assert.deepEqual(
        chain.connections.map((connection) => [connection.fromNodeId, connection.toNodeId]),
        [
            ["video-1", chain.lastFrameNode.id],
            [chain.lastFrameNode.id, chain.nextVideoNode.id],
        ],
    );
});
