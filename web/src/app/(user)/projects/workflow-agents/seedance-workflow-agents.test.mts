import assert from "node:assert/strict";
import test from "node:test";

import {
    approveAgentRun,
    buildAgentWorkflowReviewEvidence,
    buildAgentWorkflowStageOutput,
    buildWorkflowMappingPreviews,
    buildWorkflowStagePromptMessages,
    completeAgentWorkflowStageRun,
    createAgentWorkflowRunRecord,
    createWorkflowTextRunRecord,
    reviewAgentWorkflowStageRun,
    setWorkflowTextRunCompleted,
    startAgentWorkflowStageRun,
} from "../agent-runner.ts";
import { buildSeedanceWorkflowPreset, workflowStageDetail } from "../agent-workflow-presets.ts";
import { getSeedanceWorkflowAgentCore, seedanceWorkflowAgentCores } from "./seedance-workflow-agents.ts";

const preset = buildSeedanceWorkflowPreset();

test("seedance workflow agent cores can be resolved by stageId", () => {
    assert.deepEqual(
        seedanceWorkflowAgentCores.map((core) => [core.stageId, core.agentId]),
        [
            ["director-analysis", "director"],
            ["art-design", "art-designer"],
            ["seedance-storyboard", "storyboard-artist"],
        ],
    );
    assert.equal(getSeedanceWorkflowAgentCore("director-analysis")?.label, "导演 / director");
    assert.equal(getSeedanceWorkflowAgentCore("art-design")?.label, "服化道 / art-designer");
    assert.equal(getSeedanceWorkflowAgentCore("seedance-storyboard")?.label, "分镜师 / storyboard-artist");
});

test("director core builds the same prompt and previews as current workflow", () => {
    assertCorePromptAndPreview("director-analysis", '{"summary":"导演分析","items":[{"title":"第一场","description":"夜戏开场"}]}');
});

test("art-designer core builds the same prompt and previews as current workflow", () => {
    assertCorePromptAndPreview("art-design", '{"summary":"美术设定","items":[{"title":"仓库场景","kind":"scene","description":"冷白工业灯"}]}');
});

test("storyboard-artist core builds the same prompt and previews as current workflow", () => {
    assertCorePromptAndPreview("seedance-storyboard", '{"summary":"分镜提示词","items":[{"title":"镜头一","prompt":"镜头从门外推入仓库","cameraMovement":"push in"}]}');
});

function assertCorePromptAndPreview(stageId: "director-analysis" | "art-design" | "seedance-storyboard", rawText: string) {
    const core = getSeedanceWorkflowAgentCore(stageId);
    assert.ok(core);
    const inputSnapshot = {
        projectTitle: "测试项目",
        episodeTitle: "第1集",
        scriptSnapshot: "测试剧本文本",
        stageSummary: "测试阶段输入",
        directorOutputSummary: "导演稿草案",
        artDesignOutputSummary: "美术稿草案",
        assetNeedSummary: "角色 / 场景需求",
        storyboardRequirement: "按场次输出分镜提示词",
    };
    const coreInput = core.buildInput({ preset, inputSnapshot });
    const stage = preset.stages.find((item) => item.stageId === stageId)!;
    const detail = workflowStageDetail(preset, stage);
    assert.deepEqual(
        core.buildPromptMessages(coreInput, preset),
        buildWorkflowStagePromptMessages({ workflowId: preset.workflowId, workflowVersion: preset.version, stage, agent: detail.agent!, skills: detail.skills, qualityGates: detail.qualityGates, inputSnapshot }),
    );

    const fixture = buildApprovedWorkflowStageFixture(stageId, rawText);
    assert.deepEqual(
        core.buildMappingPreviews(fixture.output, { workflowRun: fixture.workflowRun, now: "2026-01-12T00:04:00.000Z" }),
        buildWorkflowMappingPreviews({ workflowRun: fixture.workflowRun, stageId, output: fixture.output, now: "2026-01-12T00:04:00.000Z" }),
    );
}

function buildApprovedWorkflowStageFixture(stageId: "director-analysis" | "art-design" | "seedance-storyboard", rawText: string) {
    const workflowRun = createAgentWorkflowRunRecord({ preset, projectId: "project-workflow", id: `workflow-${stageId}`, now: "2026-01-12T00:00:00.000Z" });
    const core = getSeedanceWorkflowAgentCore(stageId)!;
    const targetStageOrder = preset.stages.find((stage) => stage.stageId === stageId)?.order ?? 0;
    const preparedWorkflowRun = {
        ...workflowRun,
        stageStates: workflowRun.stageStates.map((stageState) => {
            const presetStage = preset.stages.find((stage) => stage.stageId === stageState.stageId);
            if ((presetStage?.order ?? 0) >= targetStageOrder) return stageState;
            return { ...stageState, status: "approved" as const, approvedAt: "2026-01-12T00:00:00.000Z", blockedReason: undefined };
        }),
    };
    const runnerRun = approveAgentRun(
        setWorkflowTextRunCompleted(
            createWorkflowTextRunRecord({
                input: {
                    projectId: "project-workflow",
                    sourceType: "workflow_text_stage",
                    sourceId: stageId,
                    variables: { stageId },
                    workflowRunId: preparedWorkflowRun.id,
                    workflowId: preset.workflowId,
                    workflowVersion: preset.version,
                    stageId,
                    agentId: core.agentId,
                },
                id: `runner-${stageId}`,
                now: "2026-01-12T00:01:00.000Z",
            }),
            rawText,
            "2026-01-12T00:02:00.000Z",
        ),
        "2026-01-12T00:03:00.000Z",
    );
    const output = buildAgentWorkflowStageOutput({ workflowRunId: preparedWorkflowRun.id, runnerRun, outputId: `output-${stageId}`, now: "2026-01-12T00:02:00.000Z" })!;
    const reviewedRun = completeAgentWorkflowStageRun(startAgentWorkflowStageRun(preparedWorkflowRun, stageId, runnerRun.id, "2026-01-12T00:01:00.000Z"), output, "2026-01-12T00:02:00.000Z");
    const evidence = buildAgentWorkflowReviewEvidence({ workflowRun: reviewedRun, runnerRun, evidenceId: `evidence-${stageId}`, decision: "approved", now: "2026-01-12T00:03:00.000Z" })!;
    return { workflowRun: reviewAgentWorkflowStageRun(reviewedRun, evidence, "2026-01-12T00:03:00.000Z"), output };
}
