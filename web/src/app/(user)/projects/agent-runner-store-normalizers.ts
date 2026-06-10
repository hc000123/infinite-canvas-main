import type {
    AgentDraftOutput,
    AgentRunRecord,
    AgentWorkflowMappingPreview,
    AgentWorkflowReviewEvidence,
    AgentWorkflowRunRecord,
    AgentWorkflowSceneRunState,
    AgentWorkflowStageOutput,
    WorkflowTextRunOutput,
} from "./agent-runner-types";

export type AgentRunnerPersistedState = {
    runs: AgentRunRecord[];
    workflowRuns: AgentWorkflowRunRecord[];
    workflowOutputs: AgentWorkflowStageOutput[];
    workflowEvidences: AgentWorkflowReviewEvidence[];
    workflowMappingPreviews: AgentWorkflowMappingPreview[];
    workflowAppliedPreviewItemIds: string[];
};

export function normalizeAgentRunnerPersistedState(state: Partial<AgentRunnerPersistedState>): AgentRunnerPersistedState {
    return {
        runs: (state.runs || []).map(normalizeStoredRun),
        workflowRuns: (state.workflowRuns || []).map(normalizeStoredWorkflowRun),
        workflowOutputs: (state.workflowOutputs || []).map(normalizeStoredWorkflowOutput),
        workflowEvidences: (state.workflowEvidences || []).map(normalizeStoredWorkflowEvidence),
        workflowMappingPreviews: (state.workflowMappingPreviews || []).map(normalizeStoredWorkflowMappingPreview),
        workflowAppliedPreviewItemIds: Array.isArray(state.workflowAppliedPreviewItemIds) ? state.workflowAppliedPreviewItemIds : [],
    };
}

export function normalizeStoredRun(run: AgentRunRecord): AgentRunRecord {
    return {
        ...run,
        draftOutput: normalizeStoredDraftOutput(run.draftOutput),
        workflowTextOutput: normalizeStoredWorkflowTextOutput(run.workflowTextOutput),
        proposedActions: run.proposedActions || [],
    };
}

export function normalizeStoredWorkflowRun(run: AgentWorkflowRunRecord): AgentWorkflowRunRecord {
    return {
        id: run.id || "",
        projectId: run.projectId || "",
        canvasId: run.canvasId,
        episodeId: run.episodeId,
        workflowId: run.workflowId || "",
        workflowVersion: run.workflowVersion || "1.0.0",
        presetId: run.presetId || run.workflowId || "",
        currentStageId: run.currentStageId || "",
        stageStates: (run.stageStates || []).map((stage) => ({
            stageId: stage.stageId || "",
            agentId: stage.agentId || "",
            status: stage.status || "idle",
            runnerRunId: stage.runnerRunId,
            outputId: stage.outputId,
            approvedAt: stage.approvedAt,
            rejectedAt: stage.rejectedAt,
            errorMessage: stage.errorMessage,
            evidenceIds: Array.isArray(stage.evidenceIds) ? stage.evidenceIds : [],
            dependsOnStageIds: Array.isArray(stage.dependsOnStageIds) ? stage.dependsOnStageIds : [],
            blockedReason: stage.blockedReason,
            readingRecords: Array.isArray(stage.readingRecords)
                ? stage.readingRecords.map((record) => ({
                      recordId: record.recordId || "",
                      workflowRunId: record.workflowRunId || run.id || "",
                      stageId: record.stageId || stage.stageId || "",
                      sourceFile: record.sourceFile || "",
                      sourceType: record.sourceType || "rule",
                      readAt: record.readAt || new Date().toISOString(),
                      status: record.status === "missing" || record.status === "skipped" ? record.status : "read",
                      note: record.note,
                      readingId: record.readingId,
                  }))
                : [],
        })),
        sceneStates: Array.isArray(run.sceneStates) ? run.sceneStates.map(normalizeStoredWorkflowSceneState) : [],
        createdAt: run.createdAt || new Date().toISOString(),
        updatedAt: run.updatedAt || run.createdAt || new Date().toISOString(),
    };
}

export function normalizeStoredWorkflowSceneState(scene: AgentWorkflowSceneRunState): AgentWorkflowSceneRunState {
    return {
        stageId: scene.stageId || "seedance-storyboard",
        sceneKey: scene.sceneKey || "",
        sceneLabel: scene.sceneLabel || scene.sceneKey || "未命名场次",
        subSceneKey: scene.subSceneKey,
        status: scene.status || "idle",
        visualDnaSummary: scene.visualDnaSummary || "",
        promptPlanSummary: scene.promptPlanSummary || "",
        promptTextSummary: scene.promptTextSummary || "",
        industrialPrecheckSummary: scene.industrialPrecheckSummary || "",
        runnerRunId: scene.runnerRunId,
        outputId: scene.outputId,
        evidenceIds: Array.isArray(scene.evidenceIds) ? scene.evidenceIds : [],
        warnings: Array.isArray(scene.warnings) ? scene.warnings : [],
        errorMessage: scene.errorMessage,
        blockedReason: scene.blockedReason,
        updatedAt: scene.updatedAt || new Date().toISOString(),
    };
}

export function normalizeStoredWorkflowOutput(output: AgentWorkflowStageOutput): AgentWorkflowStageOutput {
    return {
        outputId: output.outputId || "",
        workflowRunId: output.workflowRunId || "",
        stageId: output.stageId || "",
        runnerRunId: output.runnerRunId || "",
        rawText: output.rawText || "",
        summary: output.summary || "",
        structuredOutput: output.structuredOutput,
        outputFormat: output.outputFormat === "text" ? "text" : "json",
        sourceFiles: Array.isArray(output.sourceFiles) ? output.sourceFiles : [],
        qualityGateIds: Array.isArray(output.qualityGateIds) ? output.qualityGateIds : [],
        createdAt: output.createdAt || new Date().toISOString(),
    };
}

export function normalizeStoredWorkflowEvidence(evidence: AgentWorkflowReviewEvidence): AgentWorkflowReviewEvidence {
    return {
        evidenceId: evidence.evidenceId || "",
        projectId: evidence.projectId || "",
        workflowRunId: evidence.workflowRunId || "",
        stageId: evidence.stageId || "",
        runnerRunId: evidence.runnerRunId || "",
        sceneKey: evidence.sceneKey,
        sceneLabel: evidence.sceneLabel,
        decision: evidence.decision === "rejected" ? "rejected" : "approved",
        reviewer: evidence.reviewer || "local",
        reviewerNote: evidence.reviewerNote,
        outputSummary: evidence.outputSummary || "",
        outputHash: evidence.outputHash || "",
        sourceFiles: Array.isArray(evidence.sourceFiles) ? evidence.sourceFiles : [],
        qualityGateIds: Array.isArray(evidence.qualityGateIds) ? evidence.qualityGateIds : [],
        createdAt: evidence.createdAt || new Date().toISOString(),
    };
}

export function normalizeStoredWorkflowMappingPreview(preview: AgentWorkflowMappingPreview): AgentWorkflowMappingPreview {
    return {
        previewId: preview.previewId || "",
        projectId: preview.projectId || "",
        canvasId: preview.canvasId,
        episodeId: preview.episodeId,
        workflowRunId: preview.workflowRunId || "",
        sourceStageId: preview.sourceStageId || "",
        sourceOutputId: preview.sourceOutputId || "",
        targetType: preview.targetType || "production_bible",
        title: preview.title || "",
        summary: preview.summary || "",
        items: Array.isArray(preview.items) ? preview.items : [],
        warnings: Array.isArray(preview.warnings) ? preview.warnings : [],
        createdAt: preview.createdAt || new Date().toISOString(),
    };
}

function normalizeStoredDraftOutput(output: AgentDraftOutput | undefined): AgentDraftOutput {
    return {
        summary: output?.summary || "",
        items: output?.items || [],
        rawJson: output?.rawJson || {},
        warnings: output?.warnings || [],
        schemaVersion: output?.schemaVersion || "1.0.0",
    };
}

function normalizeStoredWorkflowTextOutput(output: WorkflowTextRunOutput | undefined): WorkflowTextRunOutput | undefined {
    if (!output) return undefined;
    return {
        rawText: output.rawText || "",
        summary: output.summary || "暂无文本摘要",
        structuredOutput: output.structuredOutput,
        outputFormat: output.outputFormat === "text" ? "text" : "json",
        stageId: output.stageId || "",
        agentId: output.agentId || "",
        workflowId: output.workflowId || "",
        sourceFiles: Array.isArray(output.sourceFiles) ? output.sourceFiles : [],
        qualityGateIds: Array.isArray(output.qualityGateIds) ? output.qualityGateIds : [],
        createdAt: output.createdAt || new Date().toISOString(),
    };
}
