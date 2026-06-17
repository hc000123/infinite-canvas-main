import assert from "node:assert/strict";
import test from "node:test";

import { buildSeedanceQualityGateManifest, buildWorkflowReadingRecords, evaluateWorkflowQualityGates, getWorkflowStageRequiredReadings } from "./workflow-quality-gates.ts";
import { createAgentWorkflowRunRecord, type AgentWorkflowRunRecord } from "./agent-runner.ts";
import { SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID, SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID, buildSeedanceWorkflowPreset } from "./agent-workflow-presets.ts";

const preset = buildSeedanceWorkflowPreset();
const manifest = buildSeedanceQualityGateManifest();
const now = "2026-01-12T00:00:00.000Z";

test("seedance quality gate manifest covers the main workflow stages", () => {
    assert.deepEqual(manifest.stageIds, ["script-adaptation", "art-design", "seedance-storyboard"]);
    for (const stageId of manifest.stageIds) {
        assert.equal(getWorkflowStageRequiredReadings(manifest, stageId).length > 0, true);
        assert.equal(
            manifest.gates.some((gate) => gate.stageId === stageId && gate.checkKind === "required_reading"),
            true,
        );
        assert.equal(
            manifest.gates.some((gate) => gate.stageId === stageId && gate.checkKind === "artifact_field"),
            true,
        );
        assert.equal(
            manifest.gates.some((gate) => gate.stageId === stageId && gate.checkKind === "manual_review"),
            true,
        );
    }
});

test("art-design and storyboard readings include the director skills", () => {
    for (const stageId of ["art-design", "seedance-storyboard"]) {
        const readings = getWorkflowStageRequiredReadings(manifest, stageId);
        assert.equal(
            readings.some((reading) => reading.sourceFile === "skills/director-skill/SKILL.md"),
            true,
        );
        assert.equal(
            readings.some((reading) => reading.sourceFile === "skills/script-analysis-review-skill/SKILL.md"),
            true,
        );
    }
});

test("seedance storyboard manifest keeps four industrial quality call node records", () => {
    const industrialReadings = getWorkflowStageRequiredReadings(manifest, "seedance-storyboard").filter((reading) => reading.sourceFile === "skills/seedance-storyboard-skill/industrial-quality-rules.md" && reading.industrialCallNode);
    assert.deepEqual(
        industrialReadings.map((reading) => reading.industrialCallNode),
        ["stage_start", "scene_start", "prompt_generated", "before_director_review"],
    );
});

test("reading records can be generated from manifest", () => {
    const records = buildWorkflowReadingRecords({ manifest, workflowRunId: "workflow-1", stageId: "art-design", now });
    const readings = getWorkflowStageRequiredReadings(manifest, "art-design");
    assert.equal(records.length, readings.length);
    assert.equal(
        records.every((record) => record.workflowRunId === "workflow-1"),
        true,
    );
    assert.equal(
        records.every((record) => record.status === "read"),
        true,
    );
    assert.equal(
        records.some((record) => record.sourceFile === "agents/art-designer.md" && record.sourceType === "agent"),
        true,
    );
});

test("script adaptation readings can be generated from manifest", () => {
    const records = buildWorkflowReadingRecords({ manifest, workflowRunId: "workflow-1", stageId: "script-adaptation", now });
    assert.equal(records.length, getWorkflowStageRequiredReadings(manifest, "script-adaptation").length);
    assert.equal(
        records.some((record) => record.sourceFile === "web/src/app/(user)/projects/script-optimizer-agent.ts" && record.sourceType === "rule"),
        true,
    );
});

test("Mx-Shell manifest uses the scavenger storyboard skill reading", () => {
    const mxManifest = buildSeedanceQualityGateManifest({ workflowId: SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID, version: "1.5.0" });
    const readings = getWorkflowStageRequiredReadings(mxManifest, "seedance-storyboard");
    assert.equal(
        readings.some((reading) => reading.sourceFile === "Mx-Shell_Prompts_v1.5.md" && reading.sourceType === "skill"),
        true,
    );
    assert.equal(
        readings.some((reading) => reading.sourceFile === "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md"),
        false,
    );
});

test("emotion director manifests add only the emotion director skill reading", () => {
    const skill5Manifest = buildSeedanceQualityGateManifest({ workflowId: SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID, version: "5.2.1" });
    const skill5Readings = getWorkflowStageRequiredReadings(skill5Manifest, "seedance-storyboard");
    assert.equal(
        skill5Readings.some((reading) => reading.sourceFile === "情绪导演_Skill_V2.1.md" && reading.sourceType === "skill"),
        true,
    );
    assert.equal(
        skill5Readings.some((reading) => reading.sourceFile === "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md"),
        true,
    );

    const mxManifest = buildSeedanceQualityGateManifest({ workflowId: SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID, version: "1.5.1" });
    const mxReadings = getWorkflowStageRequiredReadings(mxManifest, "seedance-storyboard");
    assert.equal(
        mxReadings.some((reading) => reading.sourceFile === "情绪导演_Skill_V2.1.md" && reading.sourceType === "skill"),
        true,
    );
    assert.equal(
        mxReadings.some((reading) => reading.sourceFile === "Mx-Shell_Prompts_v1.5.md" && reading.sourceType === "skill"),
        true,
    );
    assert.equal(
        mxReadings.some((reading) => reading.sourceFile === "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md"),
        false,
    );
});

test("quality gate returns error when reading record is missing", () => {
    const workflowRun = attachStageState(createWorkflowRun(), "art-design", { outputId: "output-1", evidenceIds: ["evidence-1"] });
    const results = evaluateWorkflowQualityGates({
        manifest,
        workflowRun,
        stageId: "art-design",
        outputs: [{ outputId: "output-1", workflowRunId: workflowRun.id, stageId: "art-design" }],
        evidences: [{ evidenceId: "evidence-1", workflowRunId: workflowRun.id, stageId: "art-design" }],
    });
    assert.equal(
        results.some((result) => result.status === "error" && result.checkKind === "required_reading"),
        true,
    );
});

test("quality gate returns error when stage output is missing", () => {
    const workflowRun = attachStageState(createWorkflowRun(), "art-design", {
        readingRecords: buildWorkflowReadingRecords({ manifest, workflowRunId: "workflow-quality", stageId: "art-design", now }),
        evidenceIds: ["evidence-2"],
    });
    const results = evaluateWorkflowQualityGates({
        manifest,
        workflowRun,
        stageId: "art-design",
        outputs: [],
        evidences: [{ evidenceId: "evidence-2", workflowRunId: workflowRun.id, stageId: "art-design" }],
    });
    assert.equal(
        results.some((result) => result.status === "error" && result.checkKind === "artifact_field"),
        true,
    );
});

test("quality gate returns error when review evidence is missing", () => {
    const workflowRun = attachStageState(createWorkflowRun(), "seedance-storyboard", {
        outputId: "output-3",
        readingRecords: buildWorkflowReadingRecords({ manifest, workflowRunId: "workflow-quality", stageId: "seedance-storyboard", now }),
    });
    const results = evaluateWorkflowQualityGates({
        manifest,
        workflowRun,
        stageId: "seedance-storyboard",
        outputs: [{ outputId: "output-3", workflowRunId: workflowRun.id, stageId: "seedance-storyboard" }],
        evidences: [],
    });
    assert.equal(
        results.some((result) => result.status === "error" && result.checkKind === "manual_review"),
        true,
    );
});

test("quality gate has no error when readings, output, and evidence exist", () => {
    const workflowRun = attachStageState(createWorkflowRun(), "seedance-storyboard", {
        outputId: "output-ok",
        evidenceIds: ["evidence-ok"],
        readingRecords: buildWorkflowReadingRecords({ manifest, workflowRunId: "workflow-quality", stageId: "seedance-storyboard", now }),
    });
    const results = evaluateWorkflowQualityGates({
        manifest,
        workflowRun,
        stageId: "seedance-storyboard",
        outputs: [{ outputId: "output-ok", workflowRunId: workflowRun.id, stageId: "seedance-storyboard" }],
        evidences: [{ evidenceId: "evidence-ok", workflowRunId: workflowRun.id, stageId: "seedance-storyboard" }],
    });
    assert.equal(
        results.some((result) => result.status === "error"),
        false,
    );
});

function createWorkflowRun() {
    return createAgentWorkflowRunRecord({ preset, projectId: "project-quality", id: "workflow-quality", now });
}

function attachStageState(workflowRun: AgentWorkflowRunRecord, stageId: string, patch: Partial<AgentWorkflowRunRecord["stageStates"][number]>) {
    return {
        ...workflowRun,
        stageStates: workflowRun.stageStates.map((stageState) => (stageState.stageId === stageId ? { ...stageState, ...patch } : stageState)),
    };
}
