import assert from "node:assert/strict";
import test from "node:test";

import { getOriginalWorkflowNextStep, type OriginalWorkflowFileState } from "./original-workflow-next-step.ts";

test("next step asks to connect root before reading files", () => {
    const step = getOriginalWorkflowNextStep({ files: [], rootExists: false });

    assert.equal(step.kind, "connect");
});

test("next step waits while a runner is active", () => {
    const step = getOriginalWorkflowNextStep({ files: [file("script")], job: { jobStatus: "running" }, rootExists: true });

    assert.equal(step.kind, "wait-runner");
});

test("next step follows original workflow file order", () => {
    assert.equal(getOriginalWorkflowNextStep({ files: [], rootExists: true }).kind, "edit-script");
    assert.deepEqual(getOriginalWorkflowNextStep({ files: [file("script")], rootExists: true }), {
        actionLabel: "启动 Stage 1",
        description: "剧本已就绪，先生成导演分析、Beat Board、导演分镜脚本和用户修改轨。",
        kind: "start-stage",
        stage: "stage1",
        title: "下一步：运行导演分析",
    });
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D"), rootExists: true }).kind, "validate-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D"), rootExists: true, validations: { stage1: { state: "passed" } } }).kind, "start-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D", "characters", "scenes"), rootExists: true, validations: { stage1: { state: "passed" } } }).kind, "validate-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D", "characters", "scenes"), rootExists: true, validations: { stage1: { state: "passed" }, stage2: { state: "passed" } } }).kind, "start-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D", "characters", "scenes", "stage3"), rootExists: true, validations: { stage1: { state: "passed" }, stage2: { state: "passed" } } }).kind, "validate-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D", "characters", "scenes", "stage3"), rootExists: true, validations: { stage1: { state: "passed" }, stage2: { state: "passed" }, stage3: { state: "passed" } } }).kind, "export-copy");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D", "characters", "scenes", "stage3", "copyOnly"), rootExists: true, validations: { stage1: { state: "passed" }, stage2: { state: "passed" }, stage3: { state: "passed" } } }).kind, "sync-video");
});

test("next step reruns stale or failed validation before moving on", () => {
    const files = withFiles("script", "stage1A", "stage1B", "stage1C", "stage1D");

    assert.deepEqual(getOriginalWorkflowNextStep({ files, rootExists: true, validations: { stage1: { state: "stale" } } }), {
        actionLabel: "校验 Stage 1",
        description: "阶段文件在上次校验后有更新，需要重新跑质量门。",
        kind: "validate-stage",
        stage: "stage1",
        title: "下一步：校验 Stage 1",
    });
    assert.equal(getOriginalWorkflowNextStep({ files, rootExists: true, validations: { stage1: { state: "failed" } } }).kind, "validate-stage");
});

function withFiles(...keys: string[]): OriginalWorkflowFileState[] {
    return keys.map(file);
}

function file(key: string): OriginalWorkflowFileState {
    return { exists: true, key };
}
