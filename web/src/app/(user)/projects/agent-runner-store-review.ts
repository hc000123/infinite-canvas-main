import {
    buildAgentWorkflowReviewEvidence,
    reviewAgentWorkflowSceneRun,
    reviewAgentWorkflowStageRun,
    startAgentWorkflowSceneRun,
    startAgentWorkflowStageRun,
    validateAgentWorkflowSceneOutput,
} from "./agent-runner-workflow-state.ts";
import { approveAgentRun, rejectAgentRun } from "./agent-runner-records.ts";
import type { AgentRunInput, AgentRunRecord, AgentWorkflowReviewEvidence, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner-types.ts";
import { buildSeedanceQualityGateManifest, buildWorkflowReadingRecords } from "./workflow-quality-gates.ts";

type AgentRunnerReviewState = {
    runs: AgentRunRecord[];
    workflowRuns: AgentWorkflowRunRecord[];
    workflowOutputs: AgentWorkflowStageOutput[];
    workflowEvidences: AgentWorkflowReviewEvidence[];
};

export function markStartedWorkflowStageReadings(workflowRun: AgentWorkflowRunRecord, input: AgentRunInput, runnerRunId: string, now: string) {
    if (!input.stageId) return workflowRun;
    const started =
        typeof input.variables.sceneKey === "string"
            ? startAgentWorkflowSceneRun(workflowRun, {
                  stageId: input.stageId,
                  sceneKey: input.variables.sceneKey,
                  sceneLabel: typeof input.variables.sceneLabel === "string" ? input.variables.sceneLabel : input.variables.sceneKey,
                  runnerRunId,
                  now,
              })
            : startAgentWorkflowStageRun(workflowRun, input.stageId, runnerRunId, now);
    const stageState = started.stageStates.find((stage) => stage.stageId === input.stageId);
    if (!stageState || stageState.status === "blocked") return started;
    const records = buildWorkflowReadingRecords({
        manifest: buildSeedanceQualityGateManifest({ workflowId: started.workflowId, version: started.workflowVersion }),
        workflowRunId: started.id,
        stageId: input.stageId,
        now,
        status: "read",
    });
    return {
        ...started,
        stageStates: started.stageStates.map((stage) => (stage.stageId === input.stageId ? { ...stage, readingRecords: records } : stage)),
    };
}

export function updateRunReviewState(state: AgentRunnerReviewState, id: string, decision: "approved" | "rejected", reviewerNote?: string): Partial<AgentRunnerReviewState> {
    const now = new Date().toISOString();
    const targetRun = state.runs.find((run) => run.id === id);
    if (!targetRun) return state;
    const sceneKey = typeof targetRun.input.variables.sceneKey === "string" ? targetRun.input.variables.sceneKey : "";
    if (decision === "approved" && sceneKey && targetRun.input.workflowRunId) {
        const workflowRun = state.workflowRuns.find((item) => item.id === targetRun.input.workflowRunId);
        const scene = workflowRun?.sceneStates?.find((item) => item.sceneKey === sceneKey && item.stageId === targetRun.input.stageId);
        const output = scene?.outputId ? state.workflowOutputs.find((item) => item.outputId === scene.outputId) : undefined;
        const validation = output ? validateAgentWorkflowSceneOutput(output) : { valid: false, errors: ["未找到当前场次产物快照"] };
        if (!validation.valid) {
            return {
                workflowRuns: state.workflowRuns.map((run) =>
                    run.id === workflowRun?.id
                        ? {
                              ...run,
                              stageStates: run.stageStates.map((stage) => (stage.stageId === targetRun.input.stageId ? { ...stage, status: "error", errorMessage: validation.errors.join("；") } : stage)),
                              sceneStates: (run.sceneStates || []).map((item) =>
                                  item.sceneKey === sceneKey && item.stageId === targetRun.input.stageId ? { ...item, status: "error", warnings: validation.errors, errorMessage: validation.errors.join("；"), updatedAt: now } : item,
                              ),
                              updatedAt: now,
                          }
                        : run,
                ),
            };
        }
    }
    const run = decision === "approved" ? approveAgentRun(targetRun, now) : rejectAgentRun(targetRun, now);
    const workflowRun = run.input.workflowRunId ? state.workflowRuns.find((item) => item.id === run.input.workflowRunId) : undefined;
    const evidence = workflowRun ? buildAgentWorkflowReviewEvidence({ workflowRun, runnerRun: run, evidenceId: `workflow-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, decision, reviewerNote, now }) : undefined;
    const isSceneRun = Boolean(evidence?.sceneKey);
    return {
        runs: state.runs.map((item) => (item.id === id ? run : item)),
        workflowEvidences: evidence ? [evidence, ...state.workflowEvidences] : state.workflowEvidences,
        workflowRuns: evidence ? state.workflowRuns.map((item) => (item.id === workflowRun?.id ? (isSceneRun ? reviewAgentWorkflowSceneRun(item, evidence, now) : reviewAgentWorkflowStageRun(item, evidence, now)) : item)) : state.workflowRuns,
    };
}
