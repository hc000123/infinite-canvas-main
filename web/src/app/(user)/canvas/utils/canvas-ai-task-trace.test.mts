import assert from "node:assert/strict";
import test from "node:test";

import { aiTaskIdFromGeneration, aiTaskLedgerNodeMetadata, buildCanvasAiTaskTrace, buildCanvasAiTaskTraceFromNode, buildFrontendArtifactTrace } from "./canvas-ai-task-trace.ts";

test("builds canvas ai task trace from metadata and node context", () => {
    assert.deepEqual(
        buildCanvasAiTaskTrace({
            projectId: "project-1",
            canvasId: "canvas-1",
            nodeId: "video-1",
            metadata: {
                storyboardGroupId: "storyboard-group-1",
                storyboardShotId: "storyboard-shot-1",
                shotGroupId: "shot-group-1",
                shotIds: ["shot-1", "shot-2"],
            },
        }),
        {
            source: "canvas",
            projectId: "project-1",
            canvasId: "canvas-1",
            nodeId: "video-1",
            storyboardGroupId: "storyboard-group-1",
            storyboardShotId: "storyboard-shot-1",
            shotGroupId: "shot-group-1",
            shotIds: ["shot-1", "shot-2"],
        },
    );

    assert.equal(
        buildCanvasAiTaskTraceFromNode({
            projectId: "project-1",
            canvasId: "canvas-1",
            node: {
                id: "image-1",
                type: "image",
                title: "图片",
                position: { x: 0, y: 0 },
                width: 100,
                height: 100,
                metadata: { storyboardShotId: "storyboard-shot-1" },
            },
        }).nodeId,
        "image-1",
    );
});

test("maps ai task ledger to node metadata only when ledger task exists", () => {
    assert.deepEqual(aiTaskLedgerNodeMetadata(undefined), {});
    assert.deepEqual(
        aiTaskLedgerNodeMetadata({
            aiTaskId: "aitask-1",
            upstreamTaskId: "upstream-1",
            aiTaskStatus: "succeeded",
            aiTaskCredits: 6,
            creditLogId: "credit-1",
            creditsRefunded: 0,
            finishedAt: "2026-06-06T00:00:00.000Z",
        }),
        {
            aiTaskId: "aitask-1",
            upstreamTaskId: "upstream-1",
            aiTaskStatus: "succeeded",
            aiTaskCredits: 6,
            creditLogId: "credit-1",
            creditsRefunded: 0,
            refundedAt: undefined,
            finishedAt: "2026-06-06T00:00:00.000Z",
        },
    );
});

test("builds frontend artifact trace from generation metadata", () => {
    const generation = {
        aiTaskId: "aitask-1",
        projectId: "project-1",
        nodeId: "video-1",
        storyboardGroupId: "storyboard-group-1",
        storyboardShotId: "storyboard-shot-1",
        shotGroupId: "shot-group-1",
        shotIds: ["shot-1", 42, "", "shot-2"],
    };

    assert.equal(aiTaskIdFromGeneration(generation), "aitask-1");
    assert.deepEqual(
        buildFrontendArtifactTrace({
            assetId: "asset-1",
            kind: "video",
            generation,
            canvasId: "canvas-1",
            fallbackProjectId: "fallback-project",
            createdAt: "2026-06-06T00:00:00.000Z",
        }),
        {
            assetId: "asset-1",
            kind: "video",
            createdAt: "2026-06-06T00:00:00.000Z",
            projectId: "project-1",
            canvasId: "canvas-1",
            nodeId: "video-1",
            storyboardGroupId: "storyboard-group-1",
            storyboardShotId: "storyboard-shot-1",
            shotGroupId: "shot-group-1",
            shotIds: ["shot-1", "shot-2"],
        },
    );
    assert.equal(buildFrontendArtifactTrace({ assetId: "asset-1", kind: "image", generation: {}, canvasId: "canvas-1", fallbackProjectId: "project-1", createdAt: "now" }), null);
});
