import assert from "node:assert/strict";
import test from "node:test";

import { defaultAgentConfig, normalizeAgentConfig } from "./agent-settings.ts";
import {
    applyWorkflowMappingPreviewToProductionBible,
    approveAgentRun,
    buildWorkflowMappingPreviews,
    buildAgentTraceMetadata,
    buildAgentWorkflowReviewEvidence,
    buildAgentWorkflowStageOutput,
    buildAgentRunProposedActions,
    canWriteAgentRun,
    canGenerateWorkflowMappingPreview,
    buildWorkflowStagePrompt,
    completeAgentWorkflowStageRun,
    createAgentWorkflowRunRecord,
    createAgentRunRecord,
    createWorkflowTextRunRecord,
    failAgentWorkflowStageRun,
    setWorkflowTextRunCompleted,
    setWorkflowTextRunFailed,
    buildWorkflowStageSourceFiles,
    listAgentRunsByAgentKind,
    listAgentRunsByEpisode,
    listAgentRunsByProject,
    markAgentRunApplied,
    normalizeAgentDraftOutput,
    reviewAgentWorkflowStageRun,
    rejectAgentRun,
    startAgentWorkflowStageRun,
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

function buildApprovedWorkflowStageFixture(stageId: "director-analysis" | "art-design" | "seedance-storyboard", rawText: string, evidenceId: string, outputId: string, agentId: string) {
    const workflowRun = createAgentWorkflowRunRecord({ preset: workflowPreset, projectId: "project-workflow", id: `workflow-${stageId}-${evidenceId}`, now: "2026-01-12T00:00:00.000Z" });
    const stage = workflowPreset.stages.find((item) => item.stageId === stageId)!;
    const detail = workflowStageDetail(workflowPreset, stage);
    const targetStageOrder = workflowPreset.stages.find((stage) => stage.stageId === stageId)?.order ?? 0;
    const preparedWorkflowRun = {
        ...workflowRun,
        stageStates: workflowRun.stageStates.map((stageState) => {
            const presetStage = workflowPreset.stages.find((stage) => stage.stageId === stageState.stageId);
            if ((presetStage?.order ?? 0) >= targetStageOrder) return stageState;
            return {
                ...stageState,
                status: "approved" as const,
                approvedAt: "2026-01-12T00:00:00.000Z",
                blockedReason: undefined,
            };
        }),
    };
    const runnerRun = approveAgentRun(
        setWorkflowTextRunCompleted(
            createWorkflowTextRunRecord({
                input: {
                    ...workflowInputBase,
                    workflowRunId: preparedWorkflowRun.id,
                    workflowId: workflowPreset.workflowId,
                    workflowVersion: workflowPreset.version,
                    stageId,
                    agentId,
                    sourceFiles: [...(detail.agent ? [detail.agent.sourceFile] : []), ...detail.skills.flatMap((item) => item.sourceFiles.map((file) => file.path)), ...detail.qualityGates.flatMap((item) => item.sourceFiles.map((file) => file.path))],
                    qualityGateIds: detail.qualityGates.map((item) => item.gateId),
                },
                id: `runner-${stageId}-${evidenceId}`,
                now: "2026-01-12T00:01:00.000Z",
            }),
            rawText,
            "2026-01-12T00:02:00.000Z",
        ),
        "2026-01-12T00:03:00.000Z",
    );
    const output = buildAgentWorkflowStageOutput({ workflowRunId: preparedWorkflowRun.id, runnerRun, outputId, now: "2026-01-12T00:02:00.000Z" })!;
    const reviewedRun = completeAgentWorkflowStageRun(startAgentWorkflowStageRun(preparedWorkflowRun, stageId, runnerRun.id, "2026-01-12T00:01:00.000Z"), output, "2026-01-12T00:02:00.000Z");
    const evidence = buildAgentWorkflowReviewEvidence({ workflowRun: reviewedRun, runnerRun, evidenceId, decision: "approved", now: "2026-01-12T00:03:00.000Z" })!;
    const approvedWorkflowRun = reviewAgentWorkflowStageRun(reviewedRun, evidence, "2026-01-12T00:03:00.000Z");
    return { workflowRun: approvedWorkflowRun, runnerRun, output };
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

test("workflow run initializes three stage states with blocked dependencies", () => {
    const workflowRun = createAgentWorkflowRunRecord({
        preset: workflowPreset,
        projectId: "project-workflow",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        id: "workflow-state-1",
        now: "2026-01-11T00:00:00.000Z",
    });
    assert.equal(workflowRun.stageStates.length, 3);
    assert.equal(workflowRun.stageStates[0].status, "idle");
    assert.equal(workflowRun.stageStates[1].status, "blocked");
    assert.deepEqual(workflowRun.stageStates[1].dependsOnStageIds, ["director-analysis"]);
    assert.equal(workflowRun.stageStates[2].status, "blocked");
});

test("director must be approved before art-design and storyboard can run", () => {
    const workflowRun = createAgentWorkflowRunRecord({ preset: workflowPreset, projectId: "project-workflow", id: "workflow-state-2", now: "2026-01-11T00:00:00.000Z" });
    const artDesign = startAgentWorkflowStageRun(workflowRun, "art-design", "runner-blocked", "2026-01-11T00:01:00.000Z");
    assert.equal(artDesign.stageStates.find((stage) => stage.stageId === "art-design")?.status, "blocked");
    assert.equal(artDesign.stageStates.find((stage) => stage.stageId === "seedance-storyboard")?.status, "blocked");
});

test("workflow runner success moves stage to review and stores output snapshot", () => {
    const workflowRun = createAgentWorkflowRunRecord({ preset: workflowPreset, projectId: "project-workflow", id: "workflow-state-3", now: "2026-01-11T00:00:00.000Z" });
    const started = startAgentWorkflowStageRun(workflowRun, "director-analysis", "runner-1", "2026-01-11T00:01:00.000Z");
    const runnerRun = setWorkflowTextRunCompleted(
        createWorkflowTextRunRecord({
            input: {
                ...workflowInputBase,
                workflowRunId: workflowRun.id,
                workflowId: workflowPreset.workflowId,
                workflowVersion: workflowPreset.version,
                stageId: "director-analysis",
                agentId: "director",
                sourceFiles: ["agents/director.md"],
                qualityGateIds: ["director-business-review"],
            },
            id: "runner-1",
            now: "2026-01-11T00:01:00.000Z",
        }),
        '{"summary":"导演阶段产物"}',
        "2026-01-11T00:02:00.000Z",
    );
    const output = buildAgentWorkflowStageOutput({ workflowRunId: workflowRun.id, runnerRun, outputId: "output-1", now: "2026-01-11T00:02:00.000Z" });
    assert.ok(output);
    const reviewed = completeAgentWorkflowStageRun(started, output!, "2026-01-11T00:02:00.000Z");
    assert.equal(reviewed.stageStates[0].status, "review");
    assert.equal(reviewed.stageStates[0].outputId, "output-1");
    assert.equal(output?.summary, "导演阶段产物");
});

test("approved workflow stage writes evidence and unblocks next stage", () => {
    const workflowRun = createAgentWorkflowRunRecord({ preset: workflowPreset, projectId: "project-workflow", id: "workflow-state-4", now: "2026-01-11T00:00:00.000Z" });
    const runnerRun = setWorkflowTextRunCompleted(
        createWorkflowTextRunRecord({
            input: { ...workflowInputBase, workflowRunId: workflowRun.id, workflowId: workflowPreset.workflowId, workflowVersion: workflowPreset.version, stageId: "director-analysis", agentId: "director" },
            id: "runner-2",
            now: "2026-01-11T00:01:00.000Z",
        }),
        '{"summary":"可批准导演产物"}',
        "2026-01-11T00:02:00.000Z",
    );
    const output = buildAgentWorkflowStageOutput({ workflowRunId: workflowRun.id, runnerRun, outputId: "output-2", now: "2026-01-11T00:02:00.000Z" })!;
    const reviewed = completeAgentWorkflowStageRun(startAgentWorkflowStageRun(workflowRun, "director-analysis", runnerRun.id, "2026-01-11T00:01:00.000Z"), output, "2026-01-11T00:02:00.000Z");
    const evidence = buildAgentWorkflowReviewEvidence({ workflowRun: reviewed, runnerRun: approveAgentRun(runnerRun, "2026-01-11T00:03:00.000Z"), evidenceId: "evidence-1", decision: "approved", reviewerNote: "通过", now: "2026-01-11T00:03:00.000Z" })!;
    const approved = reviewAgentWorkflowStageRun(reviewed, evidence, "2026-01-11T00:03:00.000Z");
    assert.equal(approved.stageStates[0].status, "approved");
    assert.equal(approved.stageStates[0].evidenceIds.includes("evidence-1"), true);
    assert.equal(approved.stageStates[1].status, "idle");
    assert.equal(evidence.reviewerNote, "通过");
    assert.ok(evidence.outputHash.startsWith("wf-"));
});

test("rejected workflow stage writes evidence and keeps downstream blocked", () => {
    const workflowRun = createAgentWorkflowRunRecord({ preset: workflowPreset, projectId: "project-workflow", id: "workflow-state-5", now: "2026-01-11T00:00:00.000Z" });
    const runnerRun = setWorkflowTextRunCompleted(
        createWorkflowTextRunRecord({
            input: { ...workflowInputBase, workflowRunId: workflowRun.id, workflowId: workflowPreset.workflowId, workflowVersion: workflowPreset.version, stageId: "director-analysis", agentId: "director" },
            id: "runner-3",
            now: "2026-01-11T00:01:00.000Z",
        }),
        '{"summary":"需驳回导演产物"}',
        "2026-01-11T00:02:00.000Z",
    );
    const evidence = buildAgentWorkflowReviewEvidence({ workflowRun, runnerRun: rejectAgentRun(runnerRun, "2026-01-11T00:03:00.000Z"), evidenceId: "evidence-2", decision: "rejected", now: "2026-01-11T00:03:00.000Z" })!;
    const rejected = reviewAgentWorkflowStageRun(workflowRun, evidence, "2026-01-11T00:03:00.000Z");
    assert.equal(rejected.stageStates[0].status, "rejected");
    assert.equal(rejected.stageStates[1].status, "blocked");
    assert.equal(rejected.stageStates[2].status, "blocked");
});

test("workflow runner error moves stage to error and keeps error message", () => {
    const workflowRun = createAgentWorkflowRunRecord({ preset: workflowPreset, projectId: "project-workflow", id: "workflow-state-6", now: "2026-01-11T00:00:00.000Z" });
    const failed = failAgentWorkflowStageRun(startAgentWorkflowStageRun(workflowRun, "director-analysis", "runner-error", "2026-01-11T00:01:00.000Z"), "director-analysis", "runner-error", "模型超时", "2026-01-11T00:02:00.000Z");
    assert.equal(failed.stageStates[0].status, "error");
    assert.equal(failed.stageStates[0].errorMessage, "模型超时");
});

test("approved output can generate mapping preview", () => {
    const { workflowRun, output } = buildApprovedWorkflowStageFixture(
        "art-design",
        '{"summary":"角色设定","items":[{"title":"阿梁","kind":"character","description":"冷静、克制、黑色风衣","tags":["主角"]}]}',
        "evidence-preview-1",
        "output-preview-1",
        "art-designer",
    );
    const previews = buildWorkflowMappingPreviews({ workflowRun, stageId: "art-design", output, now: "2026-01-12T00:04:00.000Z" });
    assert.equal(previews.length, 1);
    assert.equal(previews[0].targetType, "production_bible");
    assert.equal(previews[0].items[0].mappedFields.name, "阿梁");
});

test("non-approved stage cannot generate mapping preview", () => {
    const workflowRun = createAgentWorkflowRunRecord({ preset: workflowPreset, projectId: "project-workflow", id: "workflow-preview-2", now: "2026-01-12T00:00:00.000Z" });
    const result = canGenerateWorkflowMappingPreview(workflowRun, "director-analysis");
    assert.equal(result.allowed, false);
    assert.equal(result.reason.includes("尚未批准"), true);
});

test("director art-design and storyboard map to expected target types", () => {
    const director = buildApprovedWorkflowStageFixture("director-analysis", '{"summary":"导演分析","items":[{"title":"第一场","description":"夜戏开场"}]}', "ev-dir", "out-dir", "director");
    const art = buildApprovedWorkflowStageFixture("art-design", '{"summary":"美术设定","items":[{"title":"仓库场景","kind":"scene","description":"冷白工业灯"}]}', "ev-art", "out-art", "art-designer");
    const board = buildApprovedWorkflowStageFixture("seedance-storyboard", '{"summary":"分镜提示词","items":[{"title":"镜头一","prompt":"镜头从门外推入仓库","cameraMovement":"push in"}]}', "ev-board", "out-board", "storyboard-artist");
    const directorPreviews = buildWorkflowMappingPreviews({ workflowRun: director.workflowRun, stageId: "director-analysis", output: director.output, now: "2026-01-12T00:03:00.000Z" });
    const artPreviews = buildWorkflowMappingPreviews({ workflowRun: art.workflowRun, stageId: "art-design", output: art.output, now: "2026-01-12T00:03:00.000Z" });
    const boardPreviews = buildWorkflowMappingPreviews({ workflowRun: board.workflowRun, stageId: "seedance-storyboard", output: board.output, now: "2026-01-12T00:03:00.000Z" });
    assert.deepEqual(
        directorPreviews.map((item) => item.targetType),
        ["production_bible", "storyboard_table"],
    );
    assert.deepEqual(
        artPreviews.map((item) => item.targetType),
        ["production_bible"],
    );
    assert.deepEqual(
        boardPreviews.map((item) => item.targetType),
        ["storyboard_table", "video_node"],
    );
});

test("structured output is preferred and rawText fallback keeps warning", () => {
    const structured = buildApprovedWorkflowStageFixture("art-design", '{"summary":"结构化","items":[{"title":"角色A","description":"结构化描述"}]}', "ev-struct", "out-struct", "art-designer");
    const raw = buildApprovedWorkflowStageFixture("art-design", "角色B：旧仓库里的年轻人，黑风衣，金属徽章", "ev-raw", "out-raw", "art-designer");
    const structuredPreview = buildWorkflowMappingPreviews({ workflowRun: structured.workflowRun, stageId: "art-design", output: structured.output, now: "2026-01-12T00:03:00.000Z" });
    const rawPreview = buildWorkflowMappingPreviews({ workflowRun: raw.workflowRun, stageId: "art-design", output: raw.output, now: "2026-01-12T00:03:00.000Z" });
    assert.equal(rawPreview[0].warnings.includes("结构化解析不足，当前预览基于 rawText 摘要生成。"), true);
    assert.equal(structuredPreview[0].items[0].mappedFields.description, "结构化描述");
});

test("mapping preview does not write production bible storyboard or canvas nodes", () => {
    const previewFixture = buildApprovedWorkflowStageFixture("seedance-storyboard", '{"summary":"分镜","items":[{"title":"镜头一","prompt":"推进镜头"}]}', "ev-no-write", "out-no-write", "storyboard-artist");
    const previews = buildWorkflowMappingPreviews({ workflowRun: previewFixture.workflowRun, stageId: "seedance-storyboard", output: previewFixture.output, now: "2026-01-12T00:03:00.000Z" });
    assert.equal(
        previews.every((preview) => preview.items.every((item) => item.action === "create" || item.action === "update" || item.action === "skip")),
        true,
    );
    assert.equal(
        previews.some((preview) => preview.targetType === "video_node"),
        true,
    );
    assert.equal(
        previews.some((preview) => preview.targetType === "storyboard_table"),
        true,
    );
});

test("production_bible preview can write production bible items with workflow trace metadata", () => {
    const fixture = buildApprovedWorkflowStageFixture(
        "art-design",
        '{"summary":"角色设定","items":[{"title":"阿梁","kind":"character","description":"冷静、克制、黑色风衣","tags":["主角"],"prompt":"黑风衣写实角色"}]}',
        "ev-apply-1",
        "out-apply-1",
        "art-designer",
    );
    const preview = buildWorkflowMappingPreviews({ workflowRun: fixture.workflowRun, stageId: "art-design", output: fixture.output, now: "2026-01-12T00:04:00.000Z" })[0];
    const result = applyWorkflowMappingPreviewToProductionBible({
        preview,
        workflowRun: fixture.workflowRun,
        output: fixture.output,
        existingItems: [],
    });
    assert.equal(result.appliedWrites.length, 1);
    assert.equal(result.appliedWrites[0].input.kind, "character");
    assert.equal(result.appliedWrites[0].input.name, "阿梁");
    assert.equal(result.appliedWrites[0].input.metadata?.source?.workflowId, workflowPreset.workflowId);
    assert.equal(result.appliedWrites[0].input.metadata?.source?.stageId, "art-design");
    assert.equal(result.appliedWrites[0].input.metadata?.source?.sourceOutputId, "out-apply-1");
    assert.equal(result.appliedWrites[0].input.metadata?.source?.previewId, preview.previewId);
    assert.equal(result.appliedWrites[0].input.metadata?.source?.previewItemId, preview.items[0].itemId);
    assert.equal(result.appliedWrites[0].input.metadata?.source?.sourceFiles.length > 0, true);
});

test("storyboard_table and video_node previews are not applied to production bible", () => {
    const fixture = buildApprovedWorkflowStageFixture("seedance-storyboard", '{"summary":"分镜","items":[{"title":"镜头一","prompt":"推进镜头"}]}', "ev-apply-2", "out-apply-2", "storyboard-artist");
    const previews = buildWorkflowMappingPreviews({ workflowRun: fixture.workflowRun, stageId: "seedance-storyboard", output: fixture.output, now: "2026-01-12T00:04:00.000Z" });
    for (const preview of previews) {
        const result = applyWorkflowMappingPreviewToProductionBible({
            preview,
            workflowRun: fixture.workflowRun,
            output: fixture.output,
            existingItems: [],
        });
        assert.equal(result.appliedWrites.length, 0);
        assert.equal(result.warnings.length > 0, true);
    }
});

test("skip item is not written and update item is skipped with warning", () => {
    const fixture = buildApprovedWorkflowStageFixture(
        "art-design",
        '{"summary":"设定","items":[{"title":"阿梁","kind":"character","description":"角色"},{"title":"旧仓库","kind":"scene","description":"场景"}]}',
        "ev-apply-3",
        "out-apply-3",
        "art-designer",
    );
    const preview = buildWorkflowMappingPreviews({ workflowRun: fixture.workflowRun, stageId: "art-design", output: fixture.output, now: "2026-01-12T00:04:00.000Z" })[0];
    preview.items[0].action = "skip";
    preview.items[1].action = "update";
    const result = applyWorkflowMappingPreviewToProductionBible({
        preview,
        workflowRun: fixture.workflowRun,
        output: fixture.output,
        existingItems: [],
    });
    assert.equal(result.appliedWrites.length, 0);
    assert.equal(result.skippedPreviewItemIds.length, 2);
    assert.equal(
        result.warnings.some((item) => item.includes("skip")),
        true,
    );
    assert.equal(
        result.warnings.some((item) => item.includes("update")),
        true,
    );
});

test("same previewItemId is not written to production bible twice", () => {
    const fixture = buildApprovedWorkflowStageFixture("art-design", '{"summary":"角色设定","items":[{"title":"阿梁","kind":"character","description":"冷静"}]}', "ev-apply-4", "out-apply-4", "art-designer");
    const preview = buildWorkflowMappingPreviews({ workflowRun: fixture.workflowRun, stageId: "art-design", output: fixture.output, now: "2026-01-12T00:04:00.000Z" })[0];
    const duplicateExistingItem = {
        id: "bible-1",
        projectId: "project-workflow",
        kind: "character" as const,
        name: "阿梁",
        description: "冷静",
        tags: [],
        assetRefs: [],
        promptSnippets: {},
        metadata: {
            source: {
                sourceType: "workflow_mapping_preview" as const,
                workflowId: workflowPreset.workflowId,
                workflowRunId: fixture.workflowRun.id,
                workflowVersion: fixture.workflowRun.workflowVersion,
                stageId: "art-design",
                agentId: "art-designer",
                sourceOutputId: preview.sourceOutputId,
                previewId: preview.previewId,
                previewItemId: preview.items[0].itemId,
                sourceFiles: fixture.output.sourceFiles,
                qualityGateIds: fixture.output.qualityGateIds,
                createdFromText: "阿梁",
            },
        },
        createdAt: "2026-01-12T00:05:00.000Z",
        updatedAt: "2026-01-12T00:05:00.000Z",
    };
    const result = applyWorkflowMappingPreviewToProductionBible({
        preview,
        workflowRun: fixture.workflowRun,
        output: fixture.output,
        existingItems: [duplicateExistingItem],
    });
    assert.equal(result.appliedWrites.length, 0);
    assert.equal(
        result.warnings.some((item) => item.includes("已写入设定库")),
        true,
    );
});
