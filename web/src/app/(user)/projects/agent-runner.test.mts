import assert from "node:assert/strict";
import test from "node:test";

import { defaultAgentConfig, normalizeAgentConfig } from "./agent-settings.ts";
import {
    approveAgentRun,
    buildAgentTraceMetadata,
    buildAgentRunProposedActions,
    canWriteAgentRun,
    buildWorkflowStagePrompt,
    createAgentRunRecord,
    createWorkflowTextRunRecord,
    setWorkflowTextRunCompleted,
    setWorkflowTextRunFailed,
    buildWorkflowStageSourceFiles,
    listAgentRunsByAgentKind,
    listAgentRunsByEpisode,
    listAgentRunsByProject,
    markAgentRunApplied,
    normalizeAgentDraftOutput,
    rejectAgentRun,
    summarizeAgentRunDraft,
    updateAgentRunDraft,
    validateAgentDraftOutputShape,
} from "./agent-runner.ts";
import { buildSeedanceWorkflowPreset, workflowStageDetail } from "./agent-workflow-presets.ts";

const workflowPreset = buildSeedanceWorkflowPreset();
const workflowInputBase = {
    projectId: "project-workflow",
    sourceType: "workflow_text_stage",
    sourceId: "director-analysis",
    variables: { stageId: "director-analysis" },
};

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

function buildWorkflowStageTextInput() {
    const stage = workflowPreset.stages[0];
    const detail = workflowStageDetail(workflowPreset, stage);
    if (!detail.agent) throw new Error("workflow preset missing director agent");
    return {
        workflowId: workflowPreset.workflowId,
        workflowVersion: workflowPreset.version,
        stage,
        agent: detail.agent,
        skills: detail.skills,
        qualityGates: detail.qualityGates,
        inputSnapshot: {
            projectTitle: "测试项目",
            episodeTitle: "第1集",
            scriptSnapshot: "测试剧本文本",
            stageSummary: "测试阶段输入",
            directorOutputSummary: "导演稿草案",
            assetNeedSummary: "角色 / 场景需求",
            storyboardRequirement: "按场次输出分镜提示词",
        },
    } as const;
}

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

test("validates draft output shape and builds write preview helpers", () => {
    const run = createAgentRunRecord({
        config: defaultAgentConfig("storyboard_director"),
        input: baseInput,
        id: "run-trace",
        now: "2026-01-02T00:00:00.000Z",
        draftOutput: { summary: "分镜草案", shots: [{ id: "shot-1" }], warnings: ["需要确认"], schemaVersion: "storyboard.v1" },
    });
    const validated = validateAgentDraftOutputShape(run.draftOutput);
    assert.equal(validated.valid, true);
    assert.equal(validated.output.schemaVersion, "storyboard.v1");
    assert.deepEqual(buildAgentTraceMetadata(run), {
        agentRunId: "run-trace",
        agentKind: "storyboard_director",
        agentConfigId: "agent-config-storyboard_director",
        agentConfigVersion: "1.0.0",
    });
    assert.equal(canWriteAgentRun(run), false);
    assert.equal(canWriteAgentRun(approveAgentRun(run, "now")), true);
    assert.deepEqual(summarizeAgentRunDraft(run), {
        status: "ready_for_review",
        itemCount: 1,
        warningCount: 1,
        configVersionLabel: "配置 v1.0.0",
        summary: "分镜草案",
    });
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

test("builds workflow stage prompt with stage/agent/skills/quality gates/source files", () => {
    const input = buildWorkflowStageTextInput();
    const stagePrompt = buildWorkflowStagePrompt(input);
    assert.ok(stagePrompt.includes(`workflowId: ${workflowPreset.workflowId}`));
    assert.ok(stagePrompt.includes(`agentName: ${input.agent.name}`));
    assert.ok(stagePrompt.includes(`agentId: ${input.agent.agentId}`));
    assert.ok(input.skills.every((item) => stagePrompt.includes(item.name)));
    assert.ok(input.qualityGates.every((item) => stagePrompt.includes(item.name)));
    const sourceFiles = buildWorkflowStageSourceFiles(input.skills, input.qualityGates);
    assert.equal(sourceFiles.length > 0, true);
    assert.ok(stagePrompt.includes(sourceFiles[0]));
});

test("workflow text run input preserves workflowId / stageId / agentId", () => {
    const run = createWorkflowTextRunRecord({
        input: {
            ...workflowInputBase,
            workflowId: workflowPreset.workflowId,
            workflowVersion: workflowPreset.version,
            stageId: "director-analysis",
            agentId: "director",
            agentName: "导演 / director",
            sourcePresetId: workflowPreset.workflowId,
            presetId: workflowPreset.workflowId,
            inputSnapshot: { stageSummary: "测试阶段" },
            qualityGateIds: ["stage-spec-read-record"],
        },
        id: "workflow-run-1",
        now: "2026-01-10T00:00:00.000Z",
    });
    assert.equal(run.input.workflowId, workflowPreset.workflowId);
    assert.equal(run.input.stageId, "director-analysis");
    assert.equal(run.input.agentId, "director");
    assert.equal(run.status, "running");
});

test("workflow text run success enters review and stores text output", () => {
    const run = createWorkflowTextRunRecord({
        input: {
            ...workflowInputBase,
            workflowId: workflowPreset.workflowId,
            workflowVersion: workflowPreset.version,
            stageId: "director-analysis",
            agentId: "director",
            sourceFiles: ["agents/director.md", "skills/director-skill/SKILL.md"],
            qualityGateIds: ["stage-spec-read-record", "director-business-review"],
        },
        id: "workflow-run-2",
        now: "2026-01-10T00:00:00.000Z",
    });
    const completed = setWorkflowTextRunCompleted(run, '{"summary":"导演分析草案","items":[{"id":"step-1"}]}', "2026-01-10T00:01:00.000Z");
    assert.equal(completed.status, "review");
    assert.equal(completed.workflowTextOutput?.rawText, '{"summary":"导演分析草案","items":[{"id":"step-1"}]}');
    assert.equal(completed.workflowTextOutput?.outputFormat, "json");
    assert.equal(completed.workflowTextOutput?.sourceFiles.length, 2);
    assert.equal(completed.workflowTextOutput?.qualityGateIds.includes("director-business-review"), true);
});

test("workflow text JSON parse failure still keeps rawText", () => {
    const run = createWorkflowTextRunRecord({
        input: {
            ...workflowInputBase,
            workflowId: workflowPreset.workflowId,
            workflowVersion: workflowPreset.version,
            stageId: "art-design",
            agentId: "art-designer",
            sourceFiles: ["skills/art-design-skill/SKILL.md"],
        },
        id: "workflow-run-3",
        now: "2026-01-10T00:00:00.000Z",
    });
    const completed = setWorkflowTextRunCompleted(run, "不是 JSON 的原始文本输出", "2026-01-10T00:02:00.000Z");
    assert.equal(completed.status, "review");
    assert.equal(completed.workflowTextOutput?.outputFormat, "text");
    assert.equal(completed.workflowTextOutput?.rawText, "不是 JSON 的原始文本输出");
    assert.equal(completed.workflowTextOutput?.structuredOutput, undefined);
});

test("workflow text run failure keeps error message", () => {
    const run = createWorkflowTextRunRecord({
        input: {
            ...workflowInputBase,
            workflowId: workflowPreset.workflowId,
            workflowVersion: workflowPreset.version,
            stageId: "seedance-storyboard",
            agentId: "storyboard-artist",
        },
        id: "workflow-run-4",
        now: "2026-01-10T00:00:00.000Z",
    });
    const failed = setWorkflowTextRunFailed(run, "模型返回异常", "2026-01-10T00:03:00.000Z");
    assert.equal(failed.status, "error");
    assert.equal(failed.errorMessage, "模型返回异常");
    assert.equal(failed.draftOutput.summary || "", "模型返回异常");
});

test("approve workflow text run only changes HITL state", () => {
    const run = setWorkflowTextRunCompleted(
        createWorkflowTextRunRecord({
            input: {
                ...workflowInputBase,
                workflowId: workflowPreset.workflowId,
                workflowVersion: workflowPreset.version,
                stageId: "director-analysis",
                agentId: "director",
            },
            id: "workflow-run-5",
            now: "2026-01-10T00:00:00.000Z",
        }),
        '{"summary":"待批准草案","items":[]}',
        "2026-01-10T00:04:00.000Z",
    );
    const approved = approveAgentRun(run, "2026-01-10T00:05:00.000Z");
    assert.equal(approved.status, "approved");
    assert.equal(approved.workflowTextOutput?.rawText.includes("待批准草案"), true);
    assert.equal(approved.agentKind, "workflow_text");
});
