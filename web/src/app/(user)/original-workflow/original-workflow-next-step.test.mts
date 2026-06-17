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
        actionLabel: "启动服化道",
        description: "剧本已就绪，服化道会内置导演方法，并行生成角色、场景和道具资产提示词。",
        kind: "start-stage",
        stage: "stage2",
        title: "下一步：生成服化道资产",
    });
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "characters", "scenes"), rootExists: true }).kind, "start-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "characters", "scenes", "props"), rootExists: true }).kind, "validate-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "characters", "scenes", "props"), rootExists: true, validations: { stage2: { state: "passed" } } }).kind, "start-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "characters", "scenes", "props", "copyOnly"), rootExists: true, validations: { stage2: { state: "passed" } } }).kind, "validate-stage");
    assert.equal(getOriginalWorkflowNextStep({ files: withFiles("script", "characters", "scenes", "props", "copyOnly"), rootExists: true, validations: { stage2: { state: "passed" }, stage3: { state: "passed" } } }).kind, "sync-video");
});

test("next step reruns stale or failed validation before moving on", () => {
    const files = withFiles("script", "characters", "scenes", "props");

    assert.deepEqual(getOriginalWorkflowNextStep({ files, rootExists: true, validations: { stage2: { state: "stale" } } }), {
        actionLabel: "校验 服化道",
        description: "阶段文件在上次校验后有更新，需要重新跑质量门。",
        kind: "validate-stage",
        stage: "stage2",
        title: "下一步：校验 服化道",
    });
    assert.equal(getOriginalWorkflowNextStep({ files, rootExists: true, validations: { stage2: { state: "failed" } } }).kind, "validate-stage");
});

test("next step can restart Copy-only after its quality gate is failed or stale", () => {
    const files = withFiles("script", "characters", "scenes", "props", "copyOnly");
    const validations = { stage2: { state: "passed" as const } };

    assert.deepEqual(getOriginalWorkflowNextStep({ files, rootExists: true, validations: { ...validations, stage3: { state: "failed" } } }), {
        actionLabel: "重新生成 Copy-only",
        description: "Copy-only 上次质量门未通过，可以重新运行生成。",
        kind: "start-stage",
        stage: "stage3",
        title: "下一步：重跑 Copy-only",
    });
    assert.equal(getOriginalWorkflowNextStep({ files, rootExists: true, validations: { ...validations, stage3: { state: "stale" } } }).kind, "start-stage");
});

function withFiles(...keys: string[]): OriginalWorkflowFileState[] {
    return keys.map(file);
}

function file(key: string): OriginalWorkflowFileState {
    return { exists: true, key };
}
