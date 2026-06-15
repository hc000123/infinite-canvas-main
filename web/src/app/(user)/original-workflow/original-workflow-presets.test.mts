import assert from "node:assert/strict";
import test from "node:test";

import { findOriginalWorkflowPresetByRootPath, originalWorkflowPresets } from "./original-workflow-presets.ts";

test("recognizes the Seedance original-format director-method v5 workflow root", () => {
    const preset = findOriginalWorkflowPresetByRootPath("/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5");

    assert.equal(preset?.presetId, "seedance-original-format-director-method-v5");
    assert.equal(preset?.name, "Seedance 原格式导演方法 v5");
});

test("keeps known original workflow presets explicit", () => {
    assert.equal(originalWorkflowPresets.length, 1);
    assert.equal(originalWorkflowPresets[0].rootPath.includes("seedance-original-workflow-plus-director-method-v5"), true);
});
