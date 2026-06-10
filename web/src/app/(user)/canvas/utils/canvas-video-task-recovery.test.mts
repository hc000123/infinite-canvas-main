import assert from "node:assert/strict";
import test from "node:test";

import { recoverableVideoTaskNodes, recoveredVideoTaskNodeStatus, resetInterruptedGeneration } from "./canvas-video-task-recovery.ts";

test("keeps loading video nodes with task id resumable after returning to canvas", () => {
    const nodes = [
        { id: "video-task", type: "video", title: "生成中视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "loading", taskId: "task-1", taskStatus: "running" } },
        { id: "video-creating", type: "video", title: "创建中视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "loading" } },
        { id: "image-loading", type: "image", title: "生成中图片", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { status: "loading" } },
    ];

    const restored = resetInterruptedGeneration(nodes);

    assert.equal(restored[0].metadata?.status, "loading");
    assert.equal(restored[0].metadata?.errorDetails, undefined);
    assert.equal(restored[1].metadata?.status, "error");
    assert.equal(restored[1].metadata?.errorDetails, "任务创建未完成，请重新生成。");
    assert.equal(restored[2].metadata?.status, "error");
});

test("clears stale generation errors from completed media nodes on restore", () => {
    const nodes = [
        { id: "video-content", type: "video", title: "已回填视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { content: "blob:video", status: "loading", errorDetails: "Request failed with status code 401" } },
        { id: "image-content", type: "image", title: "已回填图片", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { content: "blob:image", status: "error", errorDetails: "旧错误" } },
    ];

    const restored = resetInterruptedGeneration(nodes);

    assert.equal(restored[0].metadata?.status, "success");
    assert.equal(restored[0].metadata?.errorDetails, undefined);
    assert.equal(restored[1].metadata?.status, "success");
    assert.equal(restored[1].metadata?.errorDetails, undefined);
});

test("finds unfinished video task nodes for automatic recovery refresh", () => {
    const nodes = [
        { id: "video-task", type: "video", title: "生成中视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "loading", taskId: "task-1", taskStatus: "running" } },
        { id: "video-interrupted", type: "video", title: "断网视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "error", taskId: "task-interrupted", taskStatus: "running" } },
        { id: "video-caching", type: "video", title: "待回填视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "error", taskId: "task-caching", taskStatus: "succeeded", videoUrl: "https://example.com/video.mp4" } },
        { id: "video-failed", type: "video", title: "失败视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "error", taskId: "task-failed", taskStatus: "failed" } },
        { id: "video-has-content", type: "video", title: "已有视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "error", taskId: "task-content", taskStatus: "running", content: "blob:video" } },
        { id: "video-done", type: "video", title: "完成视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "success", taskId: "task-2" } },
        { id: "image-task", type: "image", title: "图片", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { status: "loading", taskId: "task-3" } },
    ];

    assert.deepEqual(
        recoverableVideoTaskNodes(nodes).map((node) => node.id),
        ["video-task", "video-interrupted", "video-caching"],
    );
});

test("maps refreshed task status to recovery node status", () => {
    assert.equal(recoveredVideoTaskNodeStatus("queued"), "loading");
    assert.equal(recoveredVideoTaskNodeStatus("running"), "loading");
    assert.equal(recoveredVideoTaskNodeStatus("succeeded"), "success");
    assert.equal(recoveredVideoTaskNodeStatus("failed"), "error");
    assert.equal(recoveredVideoTaskNodeStatus("cancelled"), "error");
});
