import type { AgentConfigKind } from "./agent-settings.ts";
import type { WorkflowReadingRecord } from "./workflow-quality-gates.ts";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
};

export type AgentRunStatus = "draft" | "ready_for_review" | "running" | "review" | "approved" | "rejected" | "applied" | "error" | "failed";
export type AgentRunKind = AgentConfigKind | "workflow_text";

export type WorkflowTextOutputFormat = "json" | "text";

export type WorkflowTextRunOutput = {
    rawText: string;
    summary: string;
    structuredOutput?: unknown;
    outputFormat: WorkflowTextOutputFormat;
    stageId: string;
    agentId: string;
    workflowId: string;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

export type AgentRunInput = {
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptId?: string;
    scriptSnapshot?: string;
    sourceType: string;
    sourceId?: string;
    variables: Record<string, unknown>;
    workflowRunId?: string;
    workflowId?: string;
    workflowVersion?: string;
    stageId?: string;
    agentId?: string;
    agentName?: string;
    sourcePresetId?: string;
    presetId?: string;
    inputSnapshot?: Record<string, unknown>;
    promptMessages?: ChatCompletionMessage[];
    model?: string;
    provider?: string;
    configSummary?: string;
    sourceFiles?: string[];
    qualityGateIds?: string[];
};

export type AgentDraftOutput = {
    summary: string;
    items: unknown[];
    rawJson: unknown;
    warnings: string[];
    schemaVersion: string;
};

export type AgentRunProposedAction = {
    type: string;
    title: string;
    targetRefs: Array<{
        kind: string;
        id: string;
        label?: string;
    }>;
    payload: unknown;
    requiresConfirmation: boolean;
};

export type AgentRunRecord = {
    id: string;
    agentKind: AgentRunKind;
    agentConfigId: string;
    agentConfigVersion: string;
    status: AgentRunStatus;
    input: AgentRunInput;
    draftOutput: AgentDraftOutput;
    proposedActions: AgentRunProposedAction[];
    approvedAt?: string;
    appliedAt?: string;
    rejectedAt?: string;
    errorMessage?: string;
    workflowTextOutput?: WorkflowTextRunOutput;
    createdAt: string;
    updatedAt: string;
};

export type AgentWorkflowStageStatus = "idle" | "running" | "review" | "approved" | "rejected" | "error" | "blocked";
export type AgentWorkflowSceneRunStatus = AgentWorkflowStageStatus;

export type AgentWorkflowStageState = {
    stageId: string;
    agentId: string;
    status: AgentWorkflowStageStatus;
    runnerRunId?: string;
    outputId?: string;
    approvedAt?: string;
    rejectedAt?: string;
    errorMessage?: string;
    evidenceIds: string[];
    dependsOnStageIds: string[];
    readingRecords: WorkflowReadingRecord[];
    blockedReason?: string;
};

export type AgentWorkflowSceneRunState = {
    stageId: string;
    sceneKey: string;
    sceneLabel: string;
    subSceneKey?: string;
    status: AgentWorkflowSceneRunStatus;
    visualDnaSummary: string;
    promptPlanSummary: string;
    promptTextSummary: string;
    industrialPrecheckSummary: string;
    runnerRunId?: string;
    outputId?: string;
    evidenceIds: string[];
    warnings: string[];
    errorMessage?: string;
    blockedReason?: string;
    updatedAt: string;
};

export type AgentWorkflowRunRecord = {
    id: string;
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    workflowId: string;
    workflowVersion: string;
    presetId: string;
    currentStageId: string;
    stageStates: AgentWorkflowStageState[];
    sceneStates?: AgentWorkflowSceneRunState[];
    createdAt: string;
    updatedAt: string;
};

export type AgentWorkflowStageOutput = {
    outputId: string;
    workflowRunId: string;
    stageId: string;
    runnerRunId: string;
    rawText: string;
    summary: string;
    structuredOutput?: unknown;
    outputFormat: WorkflowTextOutputFormat;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

export type AgentWorkflowReviewEvidence = {
    evidenceId: string;
    projectId: string;
    workflowRunId: string;
    stageId: string;
    runnerRunId: string;
    sceneKey?: string;
    sceneLabel?: string;
    decision: "approved" | "rejected";
    reviewer: string;
    reviewerNote?: string;
    outputSummary: string;
    outputHash: string;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

export type WorkflowMappingPreviewTargetType = "production_bible" | "storyboard_table" | "video_node";

export type AgentWorkflowMappingPreviewItem = {
    itemId: string;
    targetType: WorkflowMappingPreviewTargetType;
    action: "create" | "update" | "skip";
    title: string;
    reason: string;
    sourceText: string;
    mappedFields: Record<string, unknown>;
    confidence?: number;
    warnings: string[];
};

export type AgentWorkflowMappingPreview = {
    previewId: string;
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    workflowRunId: string;
    sourceStageId: string;
    sourceOutputId: string;
    targetType: WorkflowMappingPreviewTargetType;
    title: string;
    summary: string;
    items: AgentWorkflowMappingPreviewItem[];
    warnings: string[];
    createdAt: string;
};
