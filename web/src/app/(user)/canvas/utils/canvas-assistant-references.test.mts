import assert from "node:assert/strict";
import test from "node:test";

import { buildAssistantReferences } from "./canvas-assistant-references.ts";

test("builds assistant references from selected node upstream inputs", () => {
    const references = buildAssistantReferences(
        [
            { id: "text", type: "text", title: "提示词", position: { x: 0, y: 0 }, width: 120, height: 80, metadata: { content: "雨夜街道" } },
            { id: "image", type: "image", title: "角色图", position: { x: 0, y: 0 }, width: 120, height: 80, metadata: { content: "image-url", storageKey: "image:key" } },
            { id: "video", type: "video", title: "运镜", position: { x: 0, y: 0 }, width: 120, height: 80, metadata: { content: "video-url", storageKey: "video:key" } },
            { id: "target", type: "config", title: "生成配置", position: { x: 0, y: 0 }, width: 120, height: 80, metadata: { inputOrder: ["image", "text"] } },
        ],
        new Set(["target"]),
        [
            { id: "c1", fromNodeId: "text", toNodeId: "target" },
            { id: "c2", fromNodeId: "image", toNodeId: "target" },
            { id: "c3", fromNodeId: "video", toNodeId: "target" },
        ],
    );

    assert.deepEqual(references, [
        { id: "image", type: "image", title: "角色图", dataUrl: "image-url", storageKey: "image:key" },
        { id: "text", type: "text", title: "提示词", text: "雨夜街道" },
    ]);
});

test("keeps generated image prompt context from its upstream config node", () => {
    const references = buildAssistantReferences(
        [
            { id: "config", type: "config", title: "生成配置", position: { x: 0, y: 0 }, width: 120, height: 80, metadata: { prompt: "生成雨夜角色海报" } },
            { id: "result", type: "image", title: "结果图", position: { x: 0, y: 0 }, width: 120, height: 80, metadata: { content: "result-url", storageKey: "result:key" } },
        ],
        new Set(["result"]),
        [{ id: "c1", fromNodeId: "config", toNodeId: "result" }],
    );

    assert.deepEqual(references, [
        { id: "result", type: "image", title: "结果图", dataUrl: "result-url", storageKey: "result:key" },
        { id: "config", type: "config", title: "生成配置", text: "生成雨夜角色海报" },
    ]);
});
