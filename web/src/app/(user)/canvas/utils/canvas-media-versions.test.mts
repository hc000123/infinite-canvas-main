import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasNodeData } from "../types.ts";
import { appendCanvasMediaVersion, applyCanvasPromptDraft, canvasMediaVersionNavigation, canvasPromptEditorValue, completePendingCanvasMediaVersion, hydrateCanvasMediaVersionUrls, patchCurrentCanvasMediaVersion, rollbackPendingCanvasMediaVersion, switchCanvasMediaVersion } from "./canvas-media-versions.ts";

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

test("uses a saved draft before the current version prompt", () => {
    const node = applyCanvasPromptDraft(legacyImageNode, "未生成草稿");
    assert.equal(canvasPromptEditorValue(node), "未生成草稿");
    assert.equal(canvasPromptEditorValue(legacyImageNode), "旧提示词");
});

test("hydrates every version storage key", async () => {
    const completed: CanvasNodeData = {
        ...legacyImageNode,
        metadata: { ...legacyImageNode.metadata, content: "blob:stale-new", storageKey: "image:new" },
    };
    const versionedNode = appendCanvasMediaVersion(legacyImageNode, completed, "新的提示词", now);

    const hydrated = await hydrateCanvasMediaVersionUrls(
        versionedNode,
        async (storageKey) => `blob:resolved-${storageKey.split(":")[1]}`,
        async (storageKey) => `blob:video-${storageKey}`,
    );

    assert.equal(hydrated.metadata?.mediaVersions?.[0]?.metadata.content, "blob:resolved-old");
    assert.equal(hydrated.metadata?.mediaVersions?.[1]?.metadata.content, "blob:resolved-new");
    assert.equal(hydrated.metadata?.content, "blob:stale-new");
});

test("patches archived asset identity into the selected version", () => {
    const completed: CanvasNodeData = {
        ...legacyImageNode,
        metadata: { ...legacyImageNode.metadata, content: "blob:new", storageKey: "image:new" },
    };
    const versionedNode = appendCanvasMediaVersion(legacyImageNode, completed, "新的提示词", now);

    const patched = patchCurrentCanvasMediaVersion(versionedNode, { sourceAssetId: "asset-new" });

    assert.equal(patched.metadata?.sourceAssetId, "asset-new");
    assert.equal(patched.metadata?.mediaVersions?.[1]?.metadata.sourceAssetId, "asset-new");
    assert.equal(patched.metadata?.mediaVersions?.[0]?.metadata.sourceAssetId, undefined);
});

test("completes a pending video as a new version", () => {
    const pendingNode: CanvasNodeData = {
        ...legacyImageNode,
        type: "video" as CanvasNodeData["type"],
        metadata: {
            ...legacyImageNode.metadata,
            mediaVersions: undefined,
            pendingMediaVersion: { prompt: "新视频提示词", startedAt: now },
        },
    };
    const completedNode: CanvasNodeData = {
        ...pendingNode,
        metadata: { ...pendingNode.metadata, content: "blob:video-new", storageKey: "video:new", taskId: "task-2", taskStatus: "succeeded", status: "success" },
    };

    const completed = completePendingCanvasMediaVersion(pendingNode, completedNode, "2026-07-22T16:01:00.000Z");

    assert.equal(completed.metadata?.mediaVersions?.length, 2);
    assert.equal(completed.metadata?.mediaVersions?.[1]?.prompt, "新视频提示词");
    assert.equal(completed.metadata?.pendingMediaVersion, undefined);
    assert.equal(completed.metadata?.promptDraft, undefined);
});

test("rolls back a failed pending video and keeps its prompt draft", () => {
    const source: CanvasNodeData = { ...legacyImageNode, type: "video" as CanvasNodeData["type"] };
    const versioned = appendCanvasMediaVersion(source, { ...source, metadata: { ...source.metadata, content: "blob:current" } }, "当前提示词", now);
    const pending: CanvasNodeData = {
        ...versioned,
        metadata: { ...versioned.metadata, status: "loading", pendingMediaVersion: { prompt: "失败草稿", startedAt: now }, taskId: "task-failed" },
    };

    const rolledBack = rollbackPendingCanvasMediaVersion(pending, "视频生成失败");

    assert.equal(rolledBack.metadata?.content, "blob:current");
    assert.equal(rolledBack.metadata?.status, "success");
    assert.equal(rolledBack.metadata?.pendingMediaVersion, undefined);
    assert.equal(rolledBack.metadata?.promptDraft, "失败草稿");
    assert.equal(rolledBack.metadata?.errorDetails, "视频生成失败");
});

test("builds bounded previous and next version navigation", () => {
    const completed: CanvasNodeData = { ...legacyImageNode, metadata: { ...legacyImageNode.metadata, content: "blob:new" } };
    const versioned = appendCanvasMediaVersion(legacyImageNode, completed, "新提示词", now);
    const current = canvasMediaVersionNavigation(versioned);

    assert.equal(current.label, "v2 / 2");
    assert.equal(current.previousId, versioned.metadata?.mediaVersions?.[0]?.id);
    assert.equal(current.nextId, undefined);

    const first = canvasMediaVersionNavigation(switchCanvasMediaVersion(versioned, versioned.metadata!.mediaVersions![0]!.id));
    assert.equal(first.label, "v1 / 2");
    assert.equal(first.previousId, undefined);
    assert.equal(first.nextId, versioned.metadata?.mediaVersions?.[1]?.id);
});
