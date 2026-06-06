import assert from "node:assert/strict";
import test from "node:test";

import { defaultAgentConfig, normalizeAgentConfig } from "./agent-settings.ts";
import {
    approveAgentRun,
    buildAgentRunProposedActions,
    createAgentRunRecord,
    listAgentRunsByAgentKind,
    listAgentRunsByEpisode,
    listAgentRunsByProject,
    markAgentRunApplied,
    normalizeAgentDraftOutput,
    rejectAgentRun,
    updateAgentRunDraft,
} from "./agent-runner.ts";

const baseInput = {
    projectId: "project-1",
    canvasId: "canvas-1",
    episodeId: "episode-1",
    episodeTitle: "第一集",
    scriptId: "script-1",
    scriptSnapshot: "剧本文本",
    sourceType: "episode_script",
    sourceId: "episode-1",
    variables: { scriptSnapshot: "剧本文本" },
};

test("creates run record from enabled agent config and input", () => {
    const config = defaultAgentConfig("asset_extractor", "2026-01-01T00:00:00.000Z");
    const run = createAgentRunRecord({
        config,
        input: baseInput,
        id: "run-1",
        now: "2026-01-02T00:00:00.000Z",
        draftOutput: { summary: "资产草案", items: [{ id: "asset-need-1", kind: "character", name: "角色" }] },
    });
    assert.equal(run.id, "run-1");
    assert.equal(run.agentKind, "asset_extractor");
    assert.equal(run.agentConfigId, config.id);
    assert.equal(run.agentConfigVersion, config.version);
    assert.equal(run.status, "ready_for_review");
    assert.equal(run.proposedActions.length, 1);
});

test("disabled agent cannot create a run", () => {
    const config = { ...defaultAgentConfig("storyboard_director"), enabled: false };
    assert.throws(() => createAgentRunRecord({ config, input: baseInput, id: "run-disabled", now: "2026-01-02T00:00:00.000Z" }), /Agent 已禁用/);
});

test("write policy defaults to confirm before write through config normalization", () => {
    const config = normalizeAgentConfig({ ...defaultAgentConfig("prompt_reviewer"), writePolicy: "bad" as never });
    assert.equal(config.writePolicy, "confirm_before_write");
});

test("normalizes JSON output into draft output", () => {
    const output = normalizeAgentDraftOutput(JSON.stringify({ summary: "分镜草案", shots: [{ id: "shot-1", title: "镜头 1" }], warnings: ["需要人工确认"] }));
    assert.equal(output.summary, "分镜草案");
    assert.equal(output.items.length, 1);
    assert.deepEqual(output.warnings, ["需要人工确认"]);
    assert.equal(output.schemaVersion, "1.0.0");
});

test("builds proposed actions from draft items", () => {
    const output = normalizeAgentDraftOutput({ summary: "提示词草案", items: [{ id: "prompt-1", title: "提示词 1", kind: "prompt" }] });
    const actions = buildAgentRunProposedActions("video_prompt_builder", output);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, "video_prompt_builder.preview");
    assert.equal(actions[0].requiresConfirmation, true);
    assert.deepEqual(actions[0].targetRefs, [{ kind: "prompt", id: "prompt-1", label: "提示词 1" }]);
});

test("approves and rejects runs without applying business data", () => {
    const run = createAgentRunRecord({ config: defaultAgentConfig("image_brief_builder"), input: baseInput, id: "run-2", now: "2026-01-02T00:00:00.000Z" });
    const approved = approveAgentRun(run, "2026-01-02T01:00:00.000Z");
    const rejected = rejectAgentRun(run, "2026-01-02T02:00:00.000Z");
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedAt, "2026-01-02T01:00:00.000Z");
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.rejectedAt, "2026-01-02T02:00:00.000Z");
});

test("cannot mark run applied before approval", () => {
    const run = createAgentRunRecord({ config: defaultAgentConfig("video_prompt_builder"), input: baseInput, id: "run-3", now: "2026-01-02T00:00:00.000Z" });
    assert.throws(() => markAgentRunApplied(run, "2026-01-02T01:00:00.000Z"), /必须先批准/);
    const applied = markAgentRunApplied(approveAgentRun(run, "2026-01-02T01:00:00.000Z"), "2026-01-02T02:00:00.000Z");
    assert.equal(applied.status, "applied");
    assert.equal(applied.appliedAt, "2026-01-02T02:00:00.000Z");
});

test("updates draft output and list helpers filter runs", () => {
    const runA = createAgentRunRecord({ config: defaultAgentConfig("asset_extractor"), input: baseInput, id: "run-a", now: "2026-01-02T00:00:00.000Z" });
    const runB = createAgentRunRecord({
        config: defaultAgentConfig("prompt_reviewer"),
        input: { ...baseInput, projectId: "project-2", episodeId: "episode-2" },
        id: "run-b",
        now: "2026-01-03T00:00:00.000Z",
    });
    const updated = updateAgentRunDraft(runA, { summary: "更新草案", items: [{ id: "item-1", name: "条目" }] }, "2026-01-04T00:00:00.000Z");
    assert.equal(updated.draftOutput.summary, "更新草案");
    assert.equal(updated.proposedActions.length, 1);
    assert.deepEqual(
        listAgentRunsByProject([updated, runB], "project-1").map((run) => run.id),
        ["run-a"],
    );
    assert.deepEqual(
        listAgentRunsByEpisode([updated, runB], "episode-2").map((run) => run.id),
        ["run-b"],
    );
    assert.deepEqual(
        listAgentRunsByAgentKind([updated, runB], "prompt_reviewer").map((run) => run.id),
        ["run-b"],
    );
});
