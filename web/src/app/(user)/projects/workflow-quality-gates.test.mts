import assert from "node:assert/strict";
import test from "node:test";

import { buildSeedanceQualityGateManifest, buildWorkflowReadingRecords, evaluateWorkflowQualityGates, getWorkflowStageRequiredReadings } from "./workflow-quality-gates.ts";
import { createAgentWorkflowRunRecord, type AgentWorkflowRunRecord } from "./agent-runner.ts";
import { buildSeedanceWorkflowPreset } from "./agent-workflow-presets.ts";

const preset = buildSeedanceWorkflowPreset();
const manifest = buildSeedanceQualityGateManifest();
const now = "2026-01-12T00:00:00.000Z";

test("seedance quality gate manifest covers three workflow stages", () => {
    assert.deepEqual(manifest.stageIds, ["director-analysis", "art-design", "seedance-storyboard"]);
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

test("quality gate returns error when reading record is missing", () => {
    const workflowRun = attachStageState(createWorkflowRun(), "director-analysis", { outputId: "output-1", evidenceIds: ["evidence-1"] });
    const results = evaluateWorkflowQualityGates({
        manifest,
        workflowRun,
        stageId: "director-analysis",
        outputs: [{ outputId: "output-1", workflowRunId: workflowRun.id, stageId: "director-analysis" }],
        evidences: [{ evidenceId: "evidence-1", workflowRunId: workflowRun.id, stageId: "director-analysis" }],
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
    const workflowRun = attachStageState(createWorkflowRun(), "director-analysis", {
        outputId: "output-ok",
        evidenceIds: ["evidence-ok"],
        readingRecords: buildWorkflowReadingRecords({ manifest, workflowRunId: "workflow-quality", stageId: "director-analysis", now }),
    });
    const results = evaluateWorkflowQualityGates({
        manifest,
        workflowRun,
        stageId: "director-analysis",
        outputs: [{ outputId: "output-ok", workflowRunId: workflowRun.id, stageId: "director-analysis" }],
        evidences: [{ evidenceId: "evidence-ok", workflowRunId: workflowRun.id, stageId: "director-analysis" }],
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
