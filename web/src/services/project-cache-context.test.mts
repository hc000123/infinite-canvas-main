import assert from "node:assert/strict";
import test from "node:test";

import { projectCacheContextFromGeneration, projectCacheRetryFailure, recoverProjectCacheRetryingItems } from "./project-cache-context.ts";

test("classifies storyboard video inside its episode", () => {
    const context = projectCacheContextFromGeneration({
        projectId: "p1",
        projectName: "东海人鱼国",
        episodeId: "e1",
        episodeName: "第01集",
        canvasId: "c1",
        canvasName: "第01集制作",
        kind: "video",
        metadata: { storyboardShotId: "shot-1" },
    });
    assert.equal(context.category, "storyboard");
    assert.equal(context.episodeId, "e1");
    assert.equal(context.freeCanvas, false);
});

test("keeps direct tool generation unassigned", () => {
    const context = projectCacheContextFromGeneration({ kind: "image", metadata: {}, source: "image-page" });
    assert.equal(context.projectId, "");
    assert.equal(context.category, "other");
});

test("uses explicit asset binding category", () => {
    const context = projectCacheContextFromGeneration({ projectId: "p1", kind: "image", metadata: { assetBinding: { category: "character" } } });
    assert.equal(context.category, "character");
});

test("retry transition stops automatic retries but remains pending", () => {
    const next = projectCacheRetryFailure({ attempts: 2, status: "retrying" }, "磁盘空间不足", 3);
    assert.equal(next.status, "pending");
    assert.equal(next.attempts, 3);
    assert.equal(next.error, "磁盘空间不足");
});

test("rehydration returns interrupted retries to the automatic queue", () => {
    assert.deepEqual(
        recoverProjectCacheRetryingItems([
            { id: "a", status: "retrying" },
            { id: "b", status: "pending" },
        ]),
        [
            { id: "a", status: "queued" },
            { id: "b", status: "pending" },
        ],
    );
});
