import assert from "node:assert/strict";
import test from "node:test";

import { defaultAgentConfig, defaultAgentConfigs, mergeAgentConfigs } from "./agent-settings.ts";
import { SEEDANCE_WORKFLOW_PRESET_ID, applyWorkflowPresetSelection, buildSeedanceWorkflowPreset, sortedWorkflowStages, workflowStageDetail } from "./agent-workflow-presets.ts";

test("builds the Seedance multi-agent workflow preset", () => {
    const preset = buildSeedanceWorkflowPreset();
    assert.equal(preset.workflowId, SEEDANCE_WORKFLOW_PRESET_ID);
    assert.equal(preset.name, "Seedance 2.0 分镜师团队");
    assert.equal(preset.version, "1.0.0");
    assert.equal(preset.enabled, false);
    assert.equal(preset.selected, false);
    assert.ok(preset.importedAt);
    assert.ok(preset.sourceRoot.includes("Seedance 2.0 AI 分镜师团队"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "project.config.json"));
});

test("keeps the three stages in director to art-designer to storyboard-artist order", () => {
    const stages = sortedWorkflowStages(buildSeedanceWorkflowPreset());
    assert.deepEqual(
        stages.map((stage) => stage.agentId),
        ["director", "art-designer", "storyboard-artist"],
    );
    assert.deepEqual(
        stages.map((stage) => stage.stageId),
        ["director-analysis", "art-design", "seedance-storyboard"],
    );
});

test("links every stage to an agent, skills, quality gates, and source files", () => {
    const preset = buildSeedanceWorkflowPreset();
    for (const stage of preset.stages) {
        const detail = workflowStageDetail(preset, stage);
        assert.ok(detail.agent, `${stage.stageId} should resolve agent`);
        assert.equal(detail.skills.length, stage.requiredSkills.length);
        assert.equal(detail.qualityGates.length, stage.qualityGateIds.length);
        assert.ok(detail.skills.every((skill) => skill.sourceFiles.length > 0));
        assert.ok(detail.qualityGates.every((gate) => gate.sourceFiles.length > 0));
    }
});

test("preserves source files without storing long source text", () => {
    const preset = buildSeedanceWorkflowPreset();
    assert.ok(preset.sourceFiles.some((file) => file.path === "agents/director.md"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "agents/art-designer.md"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "agents/storyboard-artist.md"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "skills/seedance-storyboard-skill/industrial-quality-rules.md"));
    assert.ok(preset.sourceFiles.every((file) => file.summary.length < 80));
    assert.ok(preset.agents.every((agent) => agent.systemPromptSummary.length < 120));
});

test("project workflow selection does not change single-agent config overrides", () => {
    const selected = applyWorkflowPresetSelection(buildSeedanceWorkflowPreset(), {
        workflowId: SEEDANCE_WORKFLOW_PRESET_ID,
        projectId: "project-1",
        enabled: true,
        selected: true,
        updatedAt: "2026-06-06T00:00:00.000Z",
    });
    const merged = mergeAgentConfigs(defaultAgentConfigs(), [], [{ ...defaultAgentConfig("asset_extractor"), projectId: "project-1", enabled: false, systemPrompt: "项目资产提取" }]);
    const assetExtractor = merged.find((config) => config.kind === "asset_extractor");
    assert.equal(selected.selected, true);
    assert.equal(selected.enabled, true);
    assert.equal(assetExtractor?.enabled, false);
    assert.equal(assetExtractor?.systemPrompt, "项目资产提取");
});

test("does not include M6.10.1 runner execution fields or behavior", () => {
    const preset = buildSeedanceWorkflowPreset() as Record<string, unknown>;
    assert.equal("runnerConfig" in preset, false);
    assert.equal("executionStatus" in preset, false);
    assert.equal("runAgentConfig" in preset, false);
    for (const stage of preset.stages as Array<Record<string, unknown>>) {
        assert.equal("runnerConfig" in stage, false);
        assert.equal("model" in stage, false);
        assert.equal("execute" in stage, false);
    }
});
