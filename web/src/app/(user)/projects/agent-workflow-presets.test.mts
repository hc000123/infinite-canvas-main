import assert from "node:assert/strict";
import test from "node:test";

import {
    SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID,
    SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID,
    SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID,
    SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID,
    SEEDANCE_WORKFLOW_PRESET_ID,
    buildSeedanceMxShellEmotionDirectorV21Preset,
    buildSeedanceMxShellStoryboardV15Preset,
    buildSeedanceOriginalFormatEmotionDirectorV21Preset,
    buildSeedanceOriginalFormatDirectorMethodV5Preset,
    buildSeedanceWorkflowPreset,
    builtInAgentWorkflowPresets,
    sortedWorkflowStages,
    workflowStageDetail,
} from "./agent-workflow-presets.ts";

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

test("keeps the main stages in script to art-designer to storyboard-artist order", () => {
    const stages = sortedWorkflowStages(buildSeedanceWorkflowPreset());
    assert.deepEqual(
        stages.map((stage) => stage.agentId),
        ["script-optimizer", "art-designer", "storyboard-artist"],
    );
    assert.deepEqual(
        stages.map((stage) => stage.stageId),
        ["script-adaptation", "art-design", "seedance-storyboard"],
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
    assert.ok(preset.sourceFiles.some((file) => file.path === "web/src/app/(user)/projects/script-optimizer-agent.ts"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "skills/seedance-storyboard-skill/industrial-quality-rules.md"));
    assert.ok(preset.sourceFiles.every((file) => file.summary.length < 80));
    assert.ok(preset.agents.every((agent) => agent.systemPromptSummary.length < 120));
});

test("stores switchable agent bindings for every workflow stage", () => {
    const preset = buildSeedanceWorkflowPreset();
    assert.deepEqual(
        sortedWorkflowStages(preset).map((stage) => workflowStageDetail(preset, stage).binding?.agentConfigKind),
        ["script_optimizer", "asset_extractor", "storyboard_director"],
    );
    assert.equal(
        preset.agentBindings.every((binding) => binding.switchable && binding.agentVersion),
        true,
    );
});

test("moves director skills into art-design and storyboard stages", () => {
    const preset = buildSeedanceWorkflowPreset();
    assert.equal(
        preset.stages.some((stage) => stage.stageId === "director-analysis"),
        false,
    );
    for (const stageId of ["art-design", "seedance-storyboard"]) {
        const stage = preset.stages.find((item) => item.stageId === stageId)!;
        const skillIds = workflowStageDetail(preset, stage).skills.map((skill) => skill.skillId);
        assert.ok(skillIds.includes("director-skill"));
        assert.ok(skillIds.includes("script-analysis-review-skill"));
    }
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

test("adds the Seedance Skill 5 director-method v5.2 preset alongside the old preset", () => {
    const presets = builtInAgentWorkflowPresets();
    assert.deepEqual(
        presets.map((preset) => preset.workflowId),
        [SEEDANCE_WORKFLOW_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID, SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID, SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID],
    );

    const preset = buildSeedanceOriginalFormatDirectorMethodV5Preset();
    assert.equal(preset.workflowId, SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID);
    assert.equal(preset.name, "Seedance Skill 5 轻量分镜 v5.2");
    assert.equal(preset.version, "5.2.0");
    assert.deepEqual(
        sortedWorkflowStages(preset).map((stage) => stage.stageId),
        ["script-adaptation", "art-design", "seedance-storyboard"],
    );
    assert.deepEqual(
        sortedWorkflowStages(preset).map((stage) => workflowStageDetail(preset, stage).binding?.agentConfigKind),
        ["script_optimizer", "asset_extractor", "storyboard_director"],
    );
    for (const stageId of ["art-design", "seedance-storyboard"]) {
        const stage = preset.stages.find((item) => item.stageId === stageId)!;
        const skillIds = workflowStageDetail(preset, stage).skills.map((skill) => skill.skillId);
        assert.ok(skillIds.includes("director-method-shot-skill"));
    }
    assert.ok(preset.sourceFiles.some((file) => file.path === "specs/skills/original-prompt-format-lock/SKILL.md"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "specs/skills/director-method-shot-skill/SKILL.md"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "specs/knowledge/director-methods/director_method_cards.md"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "config/quality-gates.yaml"));
    assert.ok(preset.sourceFiles.some((file) => file.path === "tools/export_copy_only.py"));
    assert.equal(
        preset.qualityGates.some((gate) => gate.gateId === "compliance-review"),
        false,
    );
    assert.equal(
        preset.qualityGates.some((gate) => gate.gateId === "v5-industrial-quality-precheck"),
        false,
    );
    assert.equal(
        preset.qualityGates.some((gate) => gate.gateId === "v5-skill5-seedance-prompt-format"),
        true,
    );
    assert.equal(
        preset.skills.some((skill) => skill.skillId === "compliance-review-skill"),
        false,
    );
});

test("adds the Mx-Shell scavenger storyboard skill preset", () => {
    const preset = buildSeedanceMxShellStoryboardV15Preset();
    assert.equal(preset.workflowId, SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID);
    assert.equal(preset.name, "Mx-Shell 清道夫分镜 v1.5");
    assert.equal(preset.version, "1.5.0");
    assert.deepEqual(
        sortedWorkflowStages(preset).map((stage) => stage.stageId),
        ["script-adaptation", "art-design", "seedance-storyboard"],
    );
    const storyboardStage = preset.stages.find((stage) => stage.stageId === "seedance-storyboard")!;
    const storyboardDetail = workflowStageDetail(preset, storyboardStage);
    assert.deepEqual(
        storyboardDetail.skills.map((skill) => skill.skillId),
        ["original-prompt-format-lock", "director-method-shot-skill", "mx-shell-storyboard-skill"],
    );
    assert.equal(
        storyboardDetail.qualityGates.some((gate) => gate.gateId === "mx-shell-storyboard-format"),
        true,
    );
    assert.equal(
        storyboardDetail.qualityGates.some((gate) => gate.gateId === "v5-skill5-seedance-prompt-format"),
        false,
    );
    assert.ok(preset.sourceFiles.some((file) => file.path === "Mx-Shell_Prompts_v1.5.md"));
    assert.equal(
        preset.sourceFiles.some((file) => file.path === "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md"),
        false,
    );
});

test("adds emotion director as storyboard skill package variants", () => {
    const skill5Preset = buildSeedanceOriginalFormatEmotionDirectorV21Preset();
    assert.equal(skill5Preset.workflowId, SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID);
    assert.equal(skill5Preset.name, "Seedance Skill 5 + 情绪导演 v2.1");
    assert.equal(skill5Preset.version, "5.2.1");
    const skill5Stage = skill5Preset.stages.find((stage) => stage.stageId === "seedance-storyboard")!;
    const skill5Detail = workflowStageDetail(skill5Preset, skill5Stage);
    assert.equal(skill5Stage.outputSummary.includes("。，"), false);
    assert.equal(skill5Stage.outputSummary.includes("；强化情绪曲线"), true);
    assert.deepEqual(
        skill5Detail.skills.map((skill) => skill.skillId),
        ["original-prompt-format-lock", "director-method-shot-skill", "seedance-storyboard-skill", "emotion-director-skill"],
    );
    assert.equal(
        skill5Detail.qualityGates.some((gate) => gate.gateId === "emotion-director-storyboard-check"),
        true,
    );
    assert.ok(skill5Preset.sourceFiles.some((file) => file.path === "情绪导演_Skill_V2.1.md"));

    const mxPreset = buildSeedanceMxShellEmotionDirectorV21Preset();
    assert.equal(mxPreset.workflowId, SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID);
    assert.equal(mxPreset.name, "Mx-Shell 清道夫 + 情绪导演 v2.1");
    const mxStage = mxPreset.stages.find((stage) => stage.stageId === "seedance-storyboard")!;
    const mxDetail = workflowStageDetail(mxPreset, mxStage);
    assert.equal(mxStage.outputSummary.includes("。，"), false);
    assert.equal(mxStage.outputSummary.includes("；强化情绪曲线"), true);
    assert.deepEqual(
        mxDetail.skills.map((skill) => skill.skillId),
        ["original-prompt-format-lock", "director-method-shot-skill", "mx-shell-storyboard-skill", "emotion-director-skill"],
    );
    assert.equal(
        mxDetail.qualityGates.some((gate) => gate.gateId === "mx-shell-storyboard-format"),
        true,
    );
    assert.equal(
        mxDetail.qualityGates.some((gate) => gate.gateId === "emotion-director-storyboard-check"),
        true,
    );
    assert.ok(mxPreset.sourceFiles.some((file) => file.path === "Mx-Shell_Prompts_v1.5.md"));
    assert.ok(mxPreset.sourceFiles.some((file) => file.path === "情绪导演_Skill_V2.1.md"));
    assert.equal(
        mxPreset.sourceFiles.some((file) => file.path === "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md"),
        false,
    );
});
