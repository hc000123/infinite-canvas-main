import assert from "node:assert/strict";
import test from "node:test";

import { buildGeneratedImageAsset, buildGeneratedVideoAsset, buildGeneratedVideoStoryboardMetadata } from "./canvas-generated-asset.ts";
import type { CanvasNodeData } from "../types.ts";

const config = {
    model: "image-model",
    videoProtocol: "volcengine-ark",
    size: "16:9",
    quality: "high",
    count: "1",
    videoSeconds: "8",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoSeed: "123",
    videoTaskMode: "generate",
    videoEditType: "replace",
    videoExtendDirection: "forward",
    videoReferenceImageMode: "reference",
};

const context = {
    projectId: "project-1",
    projectTitle: "毕业典礼画布",
    prompt: "原始提示词",
    effectivePrompt: "带上下文的有效提示词",
    config: config as any,
    createdAt: "2026-06-03T00:00:00.000Z",
    projectPreset: { resolution: "720", ratio: "16:9", fps: "24", defaultDuration: "8" },
};

test("builds generated image asset with canvas generation metadata", () => {
    const asset = buildGeneratedImageAsset(
        {
            id: "image-1",
            type: "image",
            title: "生成图片",
            position: { x: 0, y: 0 },
            width: 320,
            height: 180,
            metadata: {
                content: "blob:image",
                storageKey: "image:one",
                status: "success",
                prompt: "节点提示词",
                model: "node-image-model",
                generationType: "edit",
                briefId: "brief-1",
                assetBreakdownItemId: "need-1",
                agentRunId: "run-1",
                agentConfigId: "asset-extractor",
                agentConfigVersion: "3",
                episodeId: "episode-1",
                episodeTitle: "第一集",
                aiTaskId: "aitask-image",
                upstreamTaskId: "upstream-image",
                aiTaskStatus: "succeeded",
                aiTaskCredits: 2,
                creditLogId: "credit-image",
                references: ["image:ref"],
                naturalWidth: 640,
                naturalHeight: 360,
                bytes: 123,
                mimeType: "image/png",
            },
        },
        context,
    );

    assert.equal(asset?.kind, "image");
    assert.equal(asset?.data.storageKey, "image:one");
    const generation = asset?.metadata?.generation as Record<string, any>;
    assert.equal(generation.source, "canvas");
    assert.equal(generation.projectId, "project-1");
    assert.equal(generation.projectTitle, "毕业典礼画布");
    assert.equal(generation.nodeId, "image-1");
    assert.equal(generation.prompt, "原始提示词");
    assert.equal(generation.effectivePrompt, "带上下文的有效提示词");
    assert.equal(generation.model, "node-image-model");
    assert.equal(generation.provider, "openai");
    assert.equal(generation.actionType, "edit");
    assert.equal(generation.briefId, "brief-1");
    assert.equal(generation.assetBreakdownItemId, "need-1");
    assert.equal(generation.agentRunId, "run-1");
    assert.equal(generation.agentConfigId, "asset-extractor");
    assert.equal(generation.agentConfigVersion, "3");
    assert.equal(generation.episodeId, "episode-1");
    assert.equal(generation.episodeTitle, "第一集");
    assert.equal(generation.aiTaskId, "aitask-image");
    assert.equal(generation.upstreamTaskId, "upstream-image");
    assert.equal(generation.aiTaskStatus, "succeeded");
    assert.equal(generation.aiTaskCredits, 2);
    assert.equal(generation.creditLogId, "credit-image");
    assert.deepEqual(generation.references.images, ["image:ref"]);
    assert.deepEqual(generation.productionBibleRefs, []);
    assert.equal(generation.config.quality, "high");
    assert.deepEqual(generation.config.projectPreset, { resolution: "720", ratio: "16:9", fps: "24", defaultDuration: "8" });
    assert.equal(generation.createdAt, "2026-06-03T00:00:00.000Z");
});

test("does not build generated image asset for failed nodes", () => {
    const asset = buildGeneratedImageAsset(
        {
            id: "image-failed",
            type: "image",
            title: "失败图片",
            position: { x: 0, y: 0 },
            width: 320,
            height: 180,
            metadata: { content: "blob:image", status: "error" },
        },
        context,
    );

    assert.equal(asset, null);
});

test("builds generated video asset with task and relation metadata", () => {
    const asset = buildGeneratedVideoAsset(
        videoNode({
            videoActionType: "variant",
            relationType: "variant",
            provider: "volcengine-ark",
            model: "seedance-endpoint",
            taskId: "task-1",
            aiTaskId: "aitask-video",
            upstreamTaskId: "upstream-video",
            aiTaskStatus: "queued",
            aiTaskCredits: 5,
            creditLogId: "credit-video",
            references: ["image:ref"],
            videoReferences: ["media:video-ref"],
            audioReferences: ["media:audio-ref"],
            referenceOrder: [{ kind: "image", index: 1, nodeId: "image-ref" }],
        }),
        context,
    );

    assert.equal(asset?.kind, "video");
    assert.equal(asset?.data.storageKey, "media:video");
    const generation = asset?.metadata?.generation as Record<string, any>;
    assert.equal(generation.actionType, "variant");
    assert.equal(generation.taskId, "task-1");
    assert.equal(generation.aiTaskId, "aitask-video");
    assert.equal(generation.upstreamTaskId, "upstream-video");
    assert.equal(generation.aiTaskStatus, "queued");
    assert.equal(generation.aiTaskCredits, 5);
    assert.equal(generation.creditLogId, "credit-video");
    assert.equal(generation.storyboardGroupId, null);
    assert.equal(generation.storyboardShotId, null);
    assert.equal(generation.provider, "volcengine-ark");
    assert.equal(generation.model, "seedance-endpoint");
    assert.deepEqual(generation.references.images, ["image:ref"]);
    assert.deepEqual(generation.references.videos, ["media:video-ref"]);
    assert.deepEqual(generation.references.audios, ["media:audio-ref"]);
    assert.deepEqual(generation.references.order, [{ kind: "image", index: 1, nodeId: "image-ref" }]);
});

test("builds generated video storyboard and shot group metadata extension", () => {
    assert.deepEqual(
        buildGeneratedVideoStoryboardMetadata({
            storyboardGroupId: "storyboard-group-1",
            storyboardShotId: "storyboard-shot-1",
            shotGroupId: "shot-group-1",
            shotIds: ["shot-1", "shot-2"],
        }),
        {
            storyboardGroupId: "storyboard-group-1",
            storyboardShotId: "storyboard-shot-1",
            shotGroupId: "shot-group-1",
            shotIds: ["shot-1", "shot-2"],
        },
    );
    assert.deepEqual(buildGeneratedVideoStoryboardMetadata({}), {
        storyboardGroupId: null,
        storyboardShotId: null,
        shotGroupId: null,
        shotIds: [],
    });
});

test("maps video action type from edit, extend and continuation metadata", () => {
    assert.equal((buildGeneratedVideoAsset(videoNode({ videoTaskMode: "edit" }), context)?.metadata?.generation as Record<string, any>).actionType, "edit");
    assert.equal((buildGeneratedVideoAsset(videoNode({ videoTaskMode: "extend" }), context)?.metadata?.generation as Record<string, any>).actionType, "extend");
    assert.equal((buildGeneratedVideoAsset(videoNode({ actionType: "continue" }), context)?.metadata?.generation as Record<string, any>).actionType, "continue");
});

function videoNode(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id: "video-1",
        type: "video",
        title: "生成视频",
        position: { x: 0, y: 0 },
        width: 420,
        height: 236,
        metadata: {
            content: "blob:video",
            storageKey: "media:video",
            status: "success",
            prompt: "节点视频提示词",
            bytes: 456,
            mimeType: "video/mp4",
            ...metadata,
        },
    };
}
