import assert from "node:assert/strict";
import test from "node:test";

import { nextWorkflowAssetAction } from "./workflow-asset-automation.ts";

test("stops at human review gates while continuing approved work", () => {
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "needs_review", gatePassed: true }, prompts: null }), { type: "idle", reason: "请确认资产槽位后批准" });
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "approved", gatePassed: true }, prompts: { status: "ready" } }), { type: "start-prompts" });
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "approved", gatePassed: true }, prompts: { status: "needs_review", gatePassed: true } }), { type: "idle", reason: "请确认资产提示词后批准" });
});

test("starts extraction only when the asset route and worker are ready", () => {
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "ready" }, prompts: null }), { type: "start-extraction" });
    assert.equal(nextWorkflowAssetAction({ enabled: false, workerReady: true, extraction: { status: "ready" }, prompts: null }).type, "idle");
    assert.equal(nextWorkflowAssetAction({ enabled: true, workerReady: false, extraction: { status: "ready" }, prompts: null }).type, "idle");
});

test("waits during active work and stops on a failed gate", () => {
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "running" }, prompts: null }), { type: "idle", reason: "正在从剧本整理资产" });
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "needs_review", gatePassed: false }, prompts: null }), { type: "idle", reason: "资产提取未通过质量检查" });
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "approved", gatePassed: true }, prompts: { status: "needs_review", gatePassed: false } }), { type: "idle", reason: "资产提示词未通过质量检查" });
});

test("finishes when prompt cards are approved or applied", () => {
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "approved", gatePassed: true }, prompts: { status: "approved", gatePassed: true } }), { type: "idle", reason: "资产卡片已准备完成" });
    assert.deepEqual(nextWorkflowAssetAction({ enabled: true, workerReady: true, extraction: { status: "approved", gatePassed: true }, prompts: { status: "applied", gatePassed: true } }), { type: "idle", reason: "资产卡片已准备完成" });
});
