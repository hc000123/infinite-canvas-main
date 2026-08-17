import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CanvasNodeData } from "../types.ts";
import * as retryState from "./canvas-generation-retry-state.ts";
import { shouldShowCanvasNodeProgress } from "./canvas-node-status.ts";

const startedAt = Date.parse("2026-07-23T08:00:00.000Z");
const failedVideo: CanvasNodeData = {
    id: "video-1",
    type: "video",
    title: "失败视频",
    position: { x: 0, y: 0 },
    width: 420,
    height: 236,
    metadata: {
        content: "blob:old-video",
        storageKey: "video:old",
        status: "error",
        taskId: "task-old",
        taskStatus: "failed",
        taskDuration: "6",
        lastFrameStorageKey: "image:last-frame-old",
        prompt: "旧提示词",
        promptDraft: "修改后的提示词",
        errorDetails: "参考素材尚未加白",
    },
};

test("starts retrying completed media as a fresh pending version", () => {
    assert.equal(typeof retryState.startCanvasNodeRetry, "function");
    const retrying = retryState.startCanvasNodeRetry?.(failedVideo, "修改后的提示词", startedAt);

    assert.equal(retrying?.metadata?.status, "loading");
    assert.equal(retrying?.metadata?.taskId, undefined);
    assert.equal(retrying?.metadata?.taskStatus, undefined);
    assert.equal(retrying?.metadata?.taskDuration, undefined);
    assert.equal(retrying?.metadata?.lastFrameStorageKey, undefined);
    assert.equal(retrying?.metadata?.generationStartedAt, startedAt);
    assert.equal(retrying?.metadata?.errorDetails, undefined);
    assert.equal(retrying?.metadata?.pendingMediaVersion?.prompt, "修改后的提示词");
    assert.equal(shouldShowCanvasNodeProgress(retrying!), true);
});

test("completes or rolls back a retried media version without losing its draft", () => {
    assert.equal(typeof retryState.completeCanvasNodeRetry, "function");
    assert.equal(typeof retryState.failCanvasNodeRetry, "function");
    const retrying = retryState.startCanvasNodeRetry(failedVideo, "修改后的提示词", startedAt);
    const completed = { ...retrying, metadata: { ...retrying.metadata, content: "blob:new-video", storageKey: "video:new", status: "success" as const, taskId: "task-new", taskStatus: "succeeded" } };
    const success = retryState.completeCanvasNodeRetry?.(retrying, completed, "2026-07-23T08:03:00.000Z");
    const failed = retryState.failCanvasNodeRetry?.(retrying, "仍然没有加白", startedAt + 10_000);

    assert.equal(success?.metadata?.content, "blob:new-video");
    assert.equal(success?.metadata?.mediaVersions?.length, 2);
    assert.equal(success?.metadata?.pendingMediaVersion, undefined);
    assert.equal(failed?.metadata?.content, "blob:old-video");
    assert.equal(failed?.metadata?.status, "error");
    assert.equal(failed?.metadata?.promptDraft, "修改后的提示词");
    assert.equal(failed?.metadata?.errorDetails, "仍然没有加白");
});

test("uses the latest prompt draft when retrying", () => {
    assert.equal(typeof retryState.canvasNodeRetryPrompt, "function");
    assert.equal(retryState.canvasNodeRetryPrompt?.(failedVideo, undefined), "修改后的提示词");
});

test("retry serializes structured references against the latest input order", () => {
    const sourceNode: CanvasNodeData = {
        ...failedVideo,
        id: "config-1",
        type: "config",
        metadata: {
            prompt: "旧文本",
            promptDocument: {
                version: 1,
                blocks: [
                    { type: "reference", nodeId: "image-a", kind: "image", label: "@旧图片甲" },
                    { type: "text", text: "看向" },
                    { type: "reference", nodeId: "image-b", kind: "image", label: "@旧图片乙" },
                ],
            },
        },
    };
    const inputs = [
        { nodeId: "image-b", type: "image" as const, title: "乙", image: { id: "image-b", name: "b.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,Yg==" } },
        { nodeId: "image-a", type: "image" as const, title: "甲", image: { id: "image-a", name: "a.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,YQ==" } },
    ];

    assert.equal(retryState.canvasNodeRetryPrompt(failedVideo, sourceNode, inputs), "@图片2看向@图片1");
});

test("retry wiring refreshes assets and rebuilds video preflight from current state", () => {
    const hook = readFileSync(new URL("../hooks/use-canvas-generation-retry-actions.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../[id]/canvas-client-page.tsx", import.meta.url), "utf8");

    assert.match(hook, /syncCanvasVolcengineAssetsFromLibrary/);
    assert.match(hook, /buildVideoGenerationPlan/);
    assert.match(hook, /buildNodeGenerationInputs\(sourceNode\.id, retryNodes, connectionsRef\.current\)/);
    assert.match(hook, /startCanvasNodeRetry/);
    assert.match(page, /retry:\s*\{\s*assets,/);
});
