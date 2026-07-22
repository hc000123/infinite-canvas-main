import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasNodeData } from "../types.ts";
import { appendCanvasMediaVersion, applyCanvasPromptDraft, switchCanvasMediaVersion } from "./canvas-media-versions.ts";

const now = "2026-07-22T16:00:00.000Z";

const legacyImageNode: CanvasNodeData = {
    id: "image-1",
    type: "image" as CanvasNodeData["type"],
    title: "结果图",
    position: { x: 120, y: 80 },
    width: 640,
    height: 360,
    metadata: {
        content: "blob:old",
        storageKey: "image:old",
        prompt: "旧提示词",
        model: "image-model-old",
        ratio: "16:9",
        status: "success",
        productionPackageId: "P01",
    },
};

test("appends v2 to a legacy generated node without changing node identity", () => {
    const completed: CanvasNodeData = {
        ...legacyImageNode,
        width: 1024,
        height: 1024,
        metadata: {
            ...legacyImageNode.metadata,
            content: "blob:new",
            storageKey: "image:new",
            model: "image-model-new",
            ratio: "1:1",
            status: "success",
        },
    };

    const next = appendCanvasMediaVersion(legacyImageNode, completed, "新的提示词", now);

    assert.equal(next.id, legacyImageNode.id);
    assert.deepEqual(
        next.metadata?.mediaVersions?.map((item) => [item.versionNumber, item.prompt]),
        [
            [1, "旧提示词"],
            [2, "新的提示词"],
        ],
    );
    assert.equal(next.metadata?.currentMediaVersionId, next.metadata?.mediaVersions?.[1]?.id);
    assert.equal(next.metadata?.prompt, "新的提示词");
});

test("switching versions restores generated fields but preserves canvas bindings", () => {
    const completed: CanvasNodeData = {
        ...legacyImageNode,
        metadata: { ...legacyImageNode.metadata, content: "blob:new", storageKey: "image:new", model: "image-model-new", ratio: "1:1" },
    };
    const versionedNode = appendCanvasMediaVersion(legacyImageNode, completed, "新的提示词", now);
    const firstVersionId = versionedNode.metadata?.mediaVersions?.[0]?.id;
    assert.ok(firstVersionId);

    const switched = switchCanvasMediaVersion(versionedNode, firstVersionId);

    assert.equal(switched.metadata?.content, "blob:old");
    assert.equal(switched.metadata?.prompt, "旧提示词");
    assert.equal(switched.metadata?.model, "image-model-old");
    assert.equal(switched.metadata?.productionPackageId, "P01");
    assert.deepEqual(switched.position, legacyImageNode.position);
});

test("prompt drafts do not mutate the current version prompt", () => {
    const completed: CanvasNodeData = {
        ...legacyImageNode,
        metadata: { ...legacyImageNode.metadata, content: "blob:new", storageKey: "image:new" },
    };
    const versionedNode = appendCanvasMediaVersion(legacyImageNode, completed, "当前版本提示词", now);

    const edited = applyCanvasPromptDraft(versionedNode, "草稿提示词");

    assert.equal(edited.metadata?.prompt, "当前版本提示词");
    assert.equal(edited.metadata?.promptDraft, "草稿提示词");
    assert.equal(edited.metadata?.mediaVersions?.[1]?.prompt, "当前版本提示词");
});
