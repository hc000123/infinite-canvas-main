import assert from "node:assert/strict";
import test from "node:test";

import { approveAgentRun, createAgentRunRecord, markAgentRunApplied, normalizeAgentDraftOutput, rejectAgentRun } from "../../projects/agent-runner.ts";
import { defaultAgentConfig } from "../../projects/agent-settings.ts";
import {
    buildLocalStoryboardDirectorDraftOutput,
    buildStoryboardDirectorRunInput,
    buildStoryboardTableShotInputsFromAgentRun,
    canRunStoryboardDirector,
    shouldAllowStoryboardDirectorRun,
    storyboardDraftWriteModeRequired,
    validateStoryboardDraftWriteMode,
} from "./agent-storyboard-director.ts";

const canvas = {
    id: "canvas-1",
    title: "第一集画布",
    episodeId: "episode-1",
    episodeTitle: "第一集",
    scriptId: "script-1",
    scriptSnapshot: "场景：大学操场 / 白天\n魏梁走上主席台。\n对白：我毕业了。\n\n场景：观礼区\n周泽抬头看向台上。",
};

test("blocks storyboard director when there is no script", () => {
    assert.equal(canRunStoryboardDirector({ id: "canvas-1", title: "自由画布" }).canRun, false);
    assert.match(canRunStoryboardDirector({ ...canvas, scriptSnapshot: "" }).reason, /剧本/);
    assert.equal(canRunStoryboardDirector(canvas).canRun, true);
});

test("disabled storyboard director config cannot create a run", () => {
    const disabled = { ...defaultAgentConfig("storyboard_director"), enabled: false };
    assert.equal(shouldAllowStoryboardDirectorRun(disabled).allowed, false);
    assert.throws(
        () =>
            createAgentRunRecord({
                config: disabled,
                input: buildStoryboardDirectorRunInput({ projectId: "project-1", canvas }),
                id: "run-disabled",
                now: "now",
            }),
        /Agent 已禁用/,
    );
});

test("creates storyboard director run input and draft output", () => {
    const config = { ...defaultAgentConfig("storyboard_director"), id: "project-storyboard-agent", version: "storyboard-v1" };
    const input = buildStoryboardDirectorRunInput({ projectId: "project-1", canvas });
    const output = buildLocalStoryboardDirectorDraftOutput({ projectId: "project-1", canvas });
    const run = createAgentRunRecord({ config, input, id: "run-1", now: "now", draftOutput: output });

    assert.equal(run.agentKind, "storyboard_director");
    assert.equal(run.agentConfigId, "project-storyboard-agent");
    assert.equal(run.agentConfigVersion, "storyboard-v1");
    assert.equal(run.input.projectId, "project-1");
    assert.equal(run.input.canvasId, "canvas-1");
    assert.equal(run.input.episodeId, "episode-1");
    assert.equal(run.input.sourceType, "episode_script");
    assert.equal(run.draftOutput.schemaVersion, "storyboard-director.v1");
    assert.ok(run.draftOutput.items.length >= 2);
    assert.ok(run.proposedActions.every((action) => action.requiresConfirmation));
});

test("local storyboard draft normalizes to AgentDraftOutput", () => {
    const output = buildLocalStoryboardDirectorDraftOutput({ projectId: "project-1", canvas });
    const normalized = normalizeAgentDraftOutput({ summary: output.summary, shots: output.items, warnings: output.warnings, schemaVersion: output.schemaVersion });
    assert.equal(normalized.schemaVersion, "storyboard-director.v1");
    assert.ok(normalized.items.every((item) => typeof (item as { shotNumber?: unknown }).shotNumber === "number"));
    assert.ok(normalized.items.every((item) => typeof (item as { visualDescription?: unknown }).visualDescription === "string"));
});

test("unapproved or rejected storyboard runs cannot write table shots", () => {
    const run = createAgentRunRecord({
        config: defaultAgentConfig("storyboard_director"),
        input: buildStoryboardDirectorRunInput({ projectId: "project-1", canvas }),
        id: "run-2",
        now: "now",
        draftOutput: buildLocalStoryboardDirectorDraftOutput({ projectId: "project-1", canvas }),
    });
    assert.throws(() => buildStoryboardTableShotInputsFromAgentRun(run, { projectId: "project-1", canvas }), /必须先批准/);
    assert.throws(() => buildStoryboardTableShotInputsFromAgentRun(rejectAgentRun(run, "later"), { projectId: "project-1", canvas }), /必须先批准/);
});

test("approved storyboard run converts drafts into traceable table shot writes", () => {
    const run = approveAgentRun(
        createAgentRunRecord({
            config: { ...defaultAgentConfig("storyboard_director"), id: "storyboard-agent", version: "2" },
            input: buildStoryboardDirectorRunInput({ projectId: "project-1", canvas }),
            id: "run-3",
            now: "now",
            draftOutput: buildLocalStoryboardDirectorDraftOutput({ projectId: "project-1", canvas }),
        }),
        "approved",
    );
    const inputs = buildStoryboardTableShotInputsFromAgentRun(run, { projectId: "project-1", canvas });
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0].agentRunId, "run-3");
    assert.equal(inputs[0].agentConfigId, "storyboard-agent");
    assert.equal(inputs[0].agentConfigVersion, "2");
    assert.equal(inputs[0].sourceType, "agent_storyboard_director");
    assert.ok(inputs[0].inputScriptSnapshotHash);
    assert.match(inputs[0].visualDescription, /魏梁/);
    assert.equal(markAgentRunApplied(run, "applied").status, "applied");
});

test("existing table shots require append or replace before writing", () => {
    assert.equal(storyboardDraftWriteModeRequired(0), false);
    assert.equal(storyboardDraftWriteModeRequired(2), true);
    assert.equal(validateStoryboardDraftWriteMode({ existingShotCount: 2, mode: undefined }).valid, false);
    assert.equal(validateStoryboardDraftWriteMode({ existingShotCount: 2, mode: "append" }).valid, true);
    assert.equal(validateStoryboardDraftWriteMode({ existingShotCount: 2, mode: "replace" }).valid, true);
    assert.equal(validateStoryboardDraftWriteMode({ existingShotCount: 0, mode: undefined }).valid, true);
});
