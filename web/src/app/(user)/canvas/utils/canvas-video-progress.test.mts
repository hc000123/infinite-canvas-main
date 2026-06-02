import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasVideoProgress, videoElapsedSeconds } from "./canvas-video-progress.ts";

test("maps queued and running video task states to staged progress", () => {
    assert.deepEqual(buildCanvasVideoProgress({ taskStatus: "queued" }, "loading"), { stage: "queued", label: "排队中", percent: 24, currentStep: 2, steps: ["创建任务", "排队", "生成", "回填", "完成"] });

    const running = buildCanvasVideoProgress({ taskStatus: "running", generationStartedAt: Date.now() - 60_000 }, "loading");
    assert.equal(running.stage, "running");
    assert.equal(running.label, "生成中");
    assert.equal(running.currentStep, 3);
    assert.ok(running.percent > 36);
});

test("marks succeeded task as caching until node content is saved", () => {
    assert.equal(buildCanvasVideoProgress({ taskStatus: "succeeded" }, "loading").stage, "caching");
    assert.equal(buildCanvasVideoProgress({ taskStatus: "succeeded" }, "success").stage, "succeeded");
});

test("keeps failed creation progress at the creation stage before task id exists", () => {
    assert.deepEqual(buildCanvasVideoProgress({ generationStartedAt: Date.now() - 120_000 }, "error"), { stage: "failed", label: "创建失败", percent: 8, currentStep: 1, steps: ["创建任务", "排队", "生成", "回填", "完成"] });
    assert.deepEqual(buildCanvasVideoProgress({ taskId: "task-1", taskStatus: "failed" }, "error"), { stage: "failed", label: "生成失败", percent: 72, currentStep: 3, steps: ["创建任务", "排队", "生成", "回填", "完成"] });
});

test("calculates elapsed seconds from task timestamps", () => {
    assert.equal(videoElapsedSeconds({ generationStartedAt: 1_700_000_000_000 }, 1_700_000_011_000), 11);
    assert.equal(videoElapsedSeconds({ taskCreatedAt: 10 }, 12_000), 2);
});
