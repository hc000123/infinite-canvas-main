import type { AgentWorkflowPreset } from "./agent-workflow-presets";
import {
    orderedWorkflowPresetStages,
    refreshWorkflowStageBlocks,
    stableWorkflowSnapshotHash,
} from "./agent-runner-workflow-scene-utils.ts";
import type {
    AgentRunRecord,
    AgentWorkflowReviewEvidence,
    AgentWorkflowRunRecord,
    AgentWorkflowStageOutput,
} from "./agent-runner-types";

export {
    buildApprovedWorkflowSceneAggregateOutput,
    completeAgentWorkflowSceneRun,
    failAgentWorkflowSceneRun,
    reviewAgentWorkflowSceneRun,
    startAgentWorkflowSceneRun,
    validateAgentWorkflowSceneOutput,
} from "./agent-runner-workflow-scene-state";

export function createAgentWorkflowRunRecord({ preset, projectId, canvasId, episodeId, id, now }: { preset: AgentWorkflowPreset; projectId: string; canvasId?: string; episodeId?: string; id: string; now: string }): AgentWorkflowRunRecord {
    const stages = orderedWorkflowPresetStages(preset);
    const firstStageId = stages[0]?.stageId || "";
    return refreshWorkflowStageBlocks(
        {
            id,
            projectId,
            canvasId,
            episodeId,
            workflowId: preset.workflowId,
            workflowVersion: preset.version,
            presetId: preset.workflowId,
            currentStageId: firstStageId,
            stageStates: stages.map((stage, index) => ({
                stageId: stage.stageId,
                agentId: stage.agentId,
                status: index === 0 ? "idle" : "blocked",
                evidenceIds: [],
                dependsOnStageIds: index === 0 ? [] : [stages[index - 1].stageId],
                readingRecords: [],
                blockedReason: index === 0 ? undefined : `需先批准前置阶段：${stages[index - 1].name}`,
            })),
            createdAt: now,
            updatedAt: now,
        },
        now,
    );
}

export function bindAgentWorkflowRunCanvas(workflowRun: AgentWorkflowRunRecord, canvasId: string, now: string): AgentWorkflowRunRecord {
    if (!canvasId || workflowRun.canvasId === canvasId) return workflowRun;
    return { ...workflowRun, canvasId, updatedAt: now };
}

export function startAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, stageId: string, runnerRunId: string, now: string): AgentWorkflowRunRecord {
    const checked = refreshWorkflowStageBlocks(workflowRun, now);
    const stageState = checked.stageStates.find((stage) => stage.stageId === stageId);
    if (!stageState || stageState.status === "blocked") return checked;
    return {
        ...checked,
        currentStageId: stageId,
        stageStates: checked.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "running", runnerRunId, errorMessage: undefined, blockedReason: undefined } : stage)),
        updatedAt: now,
    };
}

export function buildAgentWorkflowStageOutput({ workflowRunId, runnerRun, outputId, now }: { workflowRunId: string; runnerRun: AgentRunRecord; outputId: string; now: string }): AgentWorkflowStageOutput | undefined {
    if (!runnerRun.workflowTextOutput || !runnerRun.input.stageId) return undefined;
    return {
        outputId,
        workflowRunId,
        stageId: runnerRun.input.stageId,
        runnerRunId: runnerRun.id,
        rawText: runnerRun.workflowTextOutput.rawText,
        summary: runnerRun.workflowTextOutput.summary,
        structuredOutput: runnerRun.workflowTextOutput.structuredOutput,
        outputFormat: runnerRun.workflowTextOutput.outputFormat,
        sourceFiles: runnerRun.workflowTextOutput.sourceFiles,
        qualityGateIds: runnerRun.workflowTextOutput.qualityGateIds,
        createdAt: now,
    };
}

export function completeAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, output: AgentWorkflowStageOutput, now: string): AgentWorkflowRunRecord {
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: output.stageId,
            stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === output.stageId ? { ...stage, status: "review", runnerRunId: output.runnerRunId, outputId: output.outputId, errorMessage: undefined, blockedReason: undefined } : stage)),
            updatedAt: now,
        },
        now,
    );
}

export function failAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, stageId: string, runnerRunId: string, errorMessage: string, now: string): AgentWorkflowRunRecord {
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: stageId,
            stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "error", runnerRunId, errorMessage, blockedReason: undefined } : stage)),
            updatedAt: now,
        },
        now,
    );
}

export function buildAgentWorkflowReviewEvidence({
    workflowRun,
    runnerRun,
    evidenceId,
    decision,
    reviewerNote,
    now,
}: {
    workflowRun: AgentWorkflowRunRecord;
    runnerRun: AgentRunRecord;
    evidenceId: string;
    decision: "approved" | "rejected";
    reviewerNote?: string;
    now: string;
}): AgentWorkflowReviewEvidence | undefined {
    if (!runnerRun.input.stageId || !runnerRun.workflowTextOutput) return undefined;
    const sceneKey = typeof runnerRun.input.variables.sceneKey === "string" ? runnerRun.input.variables.sceneKey : undefined;
    const sceneLabel = typeof runnerRun.input.variables.sceneLabel === "string" ? runnerRun.input.variables.sceneLabel : undefined;
    return {
        evidenceId,
        projectId: workflowRun.projectId,
        workflowRunId: workflowRun.id,
        stageId: runnerRun.input.stageId,
        runnerRunId: runnerRun.id,
        sceneKey,
        sceneLabel,
        decision,
        reviewer: "local",
        reviewerNote: reviewerNote?.trim() || undefined,
        outputSummary: runnerRun.workflowTextOutput.summary,
        outputHash: stableWorkflowSnapshotHash({
            rawText: runnerRun.workflowTextOutput.rawText,
            summary: runnerRun.workflowTextOutput.summary,
            outputFormat: runnerRun.workflowTextOutput.outputFormat,
            stageId: runnerRun.input.stageId,
            runnerRunId: runnerRun.id,
        }),
        sourceFiles: runnerRun.workflowTextOutput.sourceFiles,
        qualityGateIds: runnerRun.workflowTextOutput.qualityGateIds,
        createdAt: now,
    };
}

export function reviewAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, evidence: AgentWorkflowReviewEvidence, now: string): AgentWorkflowRunRecord {
    const status = evidence.decision === "approved" ? "approved" : "rejected";
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: evidence.stageId,
            stageStates: workflowRun.stageStates.map((stage) =>
                stage.stageId === evidence.stageId
                    ? {
                          ...stage,
                          status,
                          runnerRunId: evidence.runnerRunId,
                          approvedAt: evidence.decision === "approved" ? now : stage.approvedAt,
                          rejectedAt: evidence.decision === "rejected" ? now : undefined,
                          errorMessage: undefined,
                          blockedReason: undefined,
                          evidenceIds: Array.from(new Set([...stage.evidenceIds, evidence.evidenceId])),
                      }
                    : stage,
            ),
            updatedAt: now,
        },
        now,
    );
}
