import assert from "node:assert/strict";
import test from "node:test";

import { builtInAgentWorkflowPresets } from "../projects/agent-workflow-presets.ts";
import { findOriginalWorkflowPresetByRootPath, originalWorkflowPresets } from "./original-workflow-presets.ts";

test("recognizes the Seedance Skill 5 director-method v5.2 workflow root", () => {
    const preset = findOriginalWorkflowPresetByRootPath("/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5");

    assert.equal(preset?.presetId, "seedance-original-format-director-method-v5");
    assert.equal(preset?.name, "Seedance Skill 5 轻量分镜 v5.2");
    assert.equal(preset?.version, "5.2.0");
    assert.equal(preset?.runnerMode, "local-runner");
    assert.match(preset?.runnerStrategySummary || "", /剧本优化、服化道、Copy-only/);
    assert.match(preset?.stageSummary || "", /轻量分镜/);
});

test("recognizes the legacy Seedance 2 multi-agent workflow root", () => {
    const preset = findOriginalWorkflowPresetByRootPath("/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/86.废才Seedance 2.0 AI 分镜师团队");

    assert.equal(preset?.presetId, "seedance-2-multi-agent-storyboard-team");
    assert.equal(preset?.runnerMode, "agent-workbench");
});

test("mirrors the global workflow preset registry", () => {
    assert.equal(originalWorkflowPresets.length, builtInAgentWorkflowPresets().length);
    assert.equal(originalWorkflowPresets.some((preset) => preset.rootPath.includes("Seedance 2.0 AI 分镜师团队")), true);
    assert.equal(originalWorkflowPresets.some((preset) => preset.rootPath.includes("seedance-original-workflow-plus-director-method-v5")), true);
});
