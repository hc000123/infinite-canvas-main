import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationQueuePlan, cancelQueuedItems, failQueueItem, retryFailedQueueItems, startQueueItem, succeedQueueItem, type GenerationQueueItem } from "./generation-queue.ts";
import type { StoryboardGroup, StoryboardShot } from "./storyboard-management.ts";

test("builds video queue items from storyboard shots and video config nodes", () => {
    const plan = buildGenerationQueuePlan({
        projectId: "project-1",
        group: group("group-1"),
        shots: [
            {
                ...shot("shot-1"),
                nodeRefs: [{ nodeId: "config-1", role: "video_config" }],
            },
        ],
        nodes: [
            {
                id: "config-1",
                type: "config" as const,
                title: "视频配置",
                width: 340,
                height: 240,
                position: { x: 0, y: 0 },
                metadata: { generationMode: "video", prompt: "镜头一", seconds: "8" },
            },
        ],
        idFactory: (index) => `queue-${index}`,
    });

    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].storyboardShotId, "shot-1");
    assert.equal(plan.items[0].nodeId, "config-1");
    assert.equal(plan.summary.videoCount, 1);
    assert.equal(plan.summary.totalDurationSeconds, 8);
    assert.equal(plan.summary.totalEstimatedCredits, 8);
    assert.equal(plan.missing.length, 0);
});

test("reports missing queue requirements for storyboard shots", () => {
    const plan = buildGenerationQueuePlan({
        projectId: "project-1",
        group: group("group-1"),
        shots: [shot("shot-1"), { ...shot("shot-2"), nodeRefs: [{ nodeId: "missing-node", role: "video_config" }] }],
        nodes: [],
        idFactory: (index) => `queue-${index}`,
    });

    assert.equal(plan.items.length, 0);
    assert.deepEqual(
        plan.missing.map((item) => item.reason),
        ["缺少视频生成配置节点", "视频生成配置节点不存在"],
    );
});

test("queue state transitions keep task and result metadata", () => {
    const item = queueItem("queue-1");
    const running = startQueueItem(item, "task-1");
    const succeeded = succeedQueueItem(running, { taskId: "task-1", resultAssetId: "asset-1" });

    assert.equal(running.status, "running");
    assert.equal(running.taskId, "task-1");
    assert.equal(succeeded.status, "succeeded");
    assert.equal(succeeded.resultAssetId, "asset-1");
    assert.equal(succeeded.error, undefined);
});

test("failed queue items can be retried and cancelled queued items are cancelled", () => {
    const failed = failQueueItem(startQueueItem(queueItem("queue-1"), "task-1"), "生成失败");
    const queued = queueItem("queue-2");
    const retried = retryFailedQueueItems([failed, queued]);
    const cancelled = cancelQueuedItems(retried);

    assert.equal(retried[0].status, "queued");
    assert.equal(retried[0].error, undefined);
    assert.equal(cancelled[0].status, "cancelled");
    assert.equal(cancelled[1].status, "cancelled");
});

function group(id: string): StoryboardGroup {
    return { id, projectId: "project-1", order: 1, title: id, description: "", preset: {}, shotIds: [], createdAt: "", updatedAt: "" };
}

function shot(id: string): StoryboardShot {
    return {
        id,
        groupId: "group-1",
        order: 1,
        title: id,
        description: "",
        prompt: "",
        effectivePrompt: "",
        assetRefs: [],
        nodeRefs: [],
        resultAssetIds: [],
        status: "draft",
        createdAt: "",
        updatedAt: "",
    };
}

function queueItem(id: string): GenerationQueueItem {
    return {
        id,
        projectId: "project-1",
        storyboardGroupId: "group-1",
        storyboardShotId: "shot-1",
        nodeId: "config-1",
        kind: "video",
        status: "queued",
        priority: 1,
        estimatedCredits: 8,
        createdAt: "",
        updatedAt: "",
    };
}
