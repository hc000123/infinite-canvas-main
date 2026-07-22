import assert from "node:assert/strict";
import test from "node:test";

import type { ProductionPackage } from "../../../../../video/use-video-package-store.ts";
import { buildContinuityReference, promptInputHash, updateContinuityReference, updateReferenceBindings, updateShotDraft } from "./workflow-production-state.ts";

function fixture(patch: Partial<ProductionPackage> = {}): ProductionPackage {
    return {
        projectId: "project-1", episodeId: "episode-1", sceneKey: "scene-1", order: 1, id: "shot-001", segment: "第一镜", duration: "6秒",
        promptStatus: "已确认", assetStatus: "完整", canvasStatus: "未导入", prompt: "旧提示词", tags: { 运镜: "推近", 主体动作: "抬头", 环境: "房间", 光影: "侧光", 节奏: "慢" },
        assets: [], config: { model: "Seedance 2.0", ratio: "9:16", duration: "6秒", resolution: "720p", motion: "中", frames: "参考图" }, risks: [],
        sourceScript: "阿宁进入房间。", shotDraft: { shotSize: "中景", camera: "固定机位", movement: "缓慢推近", action: "阿宁抬头", performance: "克制", dialogue: "", durationSeconds: 6, continuityMode: "continuous" }, shotStatus: "confirmed", promptInputHash: "old-hash", referenceBindings: [],
        ...patch,
    };
}

test("marks a confirmed prompt stale when the shot draft changes", () => {
    const next = updateShotDraft(fixture(), { action: "阿宁转身" });
    assert.equal(next.shotDraft?.action, "阿宁转身");
    assert.equal(next.shotStatus, "draft");
    assert.equal(next.promptStatus, "需修改");
    assert.equal(next.promptInputHash, "");
    assert.equal(next.prompt, "旧提示词");
});

test("hashes normalized shot input and asset versions deterministically", () => {
    const left = fixture({ referenceBindings: [{ logicalAssetId: "SCENE-001", libraryAssetId: "asset-b", version: "v2", usage: "场景" }, { logicalAssetId: "CHAR-001", libraryAssetId: "asset-a", version: "v1", usage: "角色" }] });
    const right = updateReferenceBindings(fixture(), [...left.referenceBindings!].reverse());
    assert.equal(promptInputHash(left), promptInputHash(right));
});

test("maps previous tail frame as continuity reference rather than first frame", () => {
    const reference = buildContinuityReference(fixture({ lastFrameAssetId: "tail-frame-1", lastFrameVersion: "v3", generation: { status: "succeeded", taskId: "video-task-1", updatedAt: "2026-07-22T00:00:00Z" } }));
    assert.equal(reference?.role, "continuity_reference");
    assert.notEqual(reference?.role, "first_frame");
    assert.equal(updateContinuityReference(fixture(), reference).promptStatus, "需修改");
});
