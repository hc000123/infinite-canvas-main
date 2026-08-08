import assert from "node:assert/strict";
import test from "node:test";

import { eligibleBatchPackages } from "./workflow-batch-eligibility.ts";

const item = (id: string, input: { assetStatus?: string; generationStatus?: string; promptStatus?: string; risk?: string } = {}) => ({
    assetStatus: input.assetStatus || "完整",
    generation: input.generationStatus ? { status: input.generationStatus } : undefined,
    id,
    prompt: "完整提示词",
    promptStatus: input.promptStatus || "已确认",
    risks: input.risk ? [{ level: input.risk }] : [],
});

test("batch generation excludes review, blocked, and running shots", () => {
    const result = eligibleBatchPackages([
        item("P01"),
        item("P02", { promptStatus: "待审核" }),
        item("P03", { risk: "阻断" }),
        item("P04", { generationStatus: "running" }),
    ]);

    assert.deepEqual(result.included.map((entry) => entry.id), ["P01"]);
    assert.equal(result.excluded.length, 3);
});

test("batch generation excludes completed and blank prompt shots", () => {
    const completed = item("P01", { generationStatus: "succeeded" });
    const blank = { ...item("P02"), prompt: "" };
    const result = eligibleBatchPackages([completed, blank]);

    assert.equal(result.included.length, 0);
    assert.deepEqual(result.excluded.map((entry) => entry.reason), ["已有成功版本", "提示词为空"]);
});

test("allows text placeholders when no explicit blocking risk exists", () => {
    const placeholder = item("P01", { assetStatus: "缺角色图" });
    const result = eligibleBatchPackages([placeholder]);
    assert.deepEqual(result.included.map((entry) => entry.id), ["P01"]);
});
