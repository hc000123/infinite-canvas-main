import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasConnectedMedia } from "./canvas-connected-media.ts";

test("builds direct upstream media items with exact connection identities", () => {
    const nodes = [
        { id: "image-1", type: "image", title: "角色图", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "image-url" } },
        { id: "video-1", type: "video", title: "动作参考", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "video-url" } },
        { id: "audio-1", type: "audio", title: "节奏参考", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "audio-url" } },
        { id: "text-1", type: "text", title: "文本", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "提示词" } },
        { id: "target", type: "video", title: "目标", position: { x: 0, y: 0 }, width: 100, height: 100 },
        { id: "other", type: "video", title: "其他", position: { x: 0, y: 0 }, width: 100, height: 100 },
    ];
    const connections = [
        { id: "connection-image", fromNodeId: "image-1", toNodeId: "target", toHandle: "first_frame" },
        { id: "connection-video", fromNodeId: "video-1", toNodeId: "target" },
        { id: "connection-audio", fromNodeId: "audio-1", toNodeId: "target" },
        { id: "connection-text", fromNodeId: "text-1", toNodeId: "target" },
        { id: "connection-indirect", fromNodeId: "image-1", toNodeId: "other" },
        { id: "connection-missing", fromNodeId: "missing", toNodeId: "target" },
    ];

    assert.deepEqual(buildCanvasConnectedMedia("target", nodes, connections), [
        { connectionId: "connection-image", nodeId: "image-1", type: "image", label: "首帧 · 图片 1", title: "角色图", previewUrl: "image-url", role: "first_frame" },
        { connectionId: "connection-video", nodeId: "video-1", type: "video", label: "视频 1", title: "动作参考", previewUrl: "video-url" },
        { connectionId: "connection-audio", nodeId: "audio-1", type: "audio", label: "音频 1", title: "节奏参考", previewUrl: "audio-url" },
    ]);
});
