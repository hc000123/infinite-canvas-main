"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { useProductionBibleStore } from "../canvas/stores/use-production-bible-store";
import type { AgentConfig } from "./agent-settings";
import type { AgentWorkflowPreset } from "./agent-workflow-presets";
import {
    applyWorkflowMappingPreviewToProductionBible,
    buildWorkflowMappingPreviews,
    buildAgentWorkflowReviewEvidence,
    buildAgentWorkflowStageOutput,
    canApplyWorkflowMappingPreviewToProductionBible,
    canGenerateWorkflowMappingPreview,
    approveAgentRun,
    completeAgentWorkflowStageRun,
    createAgentWorkflowRunRecord,
    createAgentRunRecord,
    createWorkflowTextRunRecord,
    failAgentWorkflowStageRun,
    listAgentRunsByAgentKind,
    listAgentRunsByEpisode,
    listAgentRunsByProject,
    markAgentRunApplied,
    markAgentRunFailed,
    reviewAgentWorkflowStageRun,
    startAgentWorkflowStageRun,
    setWorkflowTextRunCompleted,
    setWorkflowTextRunFailed,
    rejectAgentRun,
    updateAgentRunDraft,
    type AgentDraftOutput,
    type AgentWorkflowReviewEvidence,
    type AgentWorkflowRunRecord,
    type AgentWorkflowMappingPreview,
    type AgentWorkflowStageOutput,
    type WorkflowTextRunOutput,
    type AgentRunInput,
    type AgentRunKind,
    type AgentRunRecord,
} from "./agent-runner";

type AgentRunnerStore = {
    runs: AgentRunRecord[];
    workflowRuns: AgentWorkflowRunRecord[];
    workflowOutputs: AgentWorkflowStageOutput[];
    workflowEvidences: AgentWorkflowReviewEvidence[];
    workflowMappingPreviews: AgentWorkflowMappingPreview[];
    workflowAppliedPreviewItemIds: string[];
    ensureWorkflowRun: (input: { projectId: string; canvasId?: string; episodeId?: string; preset: AgentWorkflowPreset }) => string;
    generateWorkflowMappingPreview: (workflowRunId: string, stageId: string) => { ok: boolean; reason?: string; previewIds?: string[] };
    applyProductionBiblePreview: (previewId: string, selectedItemIds?: string[]) => { ok: boolean; reason?: string; appliedCount?: number; skippedCount?: number; warnings: string[] };
    createRun: (config: AgentConfig, input: AgentRunInput, draftOutput?: unknown) => string;
    startWorkflowTextRun: (input: AgentRunInput) => string;
    completeWorkflowTextRun: (id: string, rawText: string) => void;
    failWorkflowTextRun: (id: string, errorMessage: string) => void;
    updateDraft: (id: string, draftOutput: unknown) => void;
    approveRun: (id: string, reviewerNote?: string) => void;
    rejectRun: (id: string, reviewerNote?: string) => void;
    markApplied: (id: string) => void;
    markFailed: (id: string, errorMessage: string) => void;
    listRunsByProject: (projectId: string) => AgentRunRecord[];
    listRunsByEpisode: (episodeId: string) => AgentRunRecord[];
    listRunsByAgentKind: (agentKind: AgentRunKind) => AgentRunRecord[];
};

const AGENT_RUNNER_STORE_KEY = "infinite-canvas:agent_runner_store";

const agentRunnerStorage: PersistStorage<AgentRunnerStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AgentRunnerStore>;
        parsed.state.runs = (parsed.state.runs || []).map(normalizeStoredRun);
        parsed.state.workflowRuns = (parsed.state.workflowRuns || []).map(normalizeStoredWorkflowRun);
        parsed.state.workflowOutputs = (parsed.state.workflowOutputs || []).map(normalizeStoredWorkflowOutput);
        parsed.state.workflowEvidences = (parsed.state.workflowEvidences || []).map(normalizeStoredWorkflowEvidence);
        parsed.state.workflowMappingPreviews = (parsed.state.workflowMappingPreviews || []).map(normalizeStoredWorkflowMappingPreview);
        parsed.state.workflowAppliedPreviewItemIds = Array.isArray(parsed.state.workflowAppliedPreviewItemIds) ? parsed.state.workflowAppliedPreviewItemIds : [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAgentRunnerStore = create<AgentRunnerStore>()(
    persist(
        (set, get) => ({
            runs: [],
            workflowRuns: [],
            workflowOutputs: [],
            workflowEvidences: [],
            workflowMappingPreviews: [],
            workflowAppliedPreviewItemIds: [],
            ensureWorkflowRun: ({ projectId, canvasId, episodeId, preset }) => {
                const existing = get().workflowRuns.find((run) => run.projectId === projectId && run.canvasId === canvasId && run.episodeId === episodeId && run.workflowId === preset.workflowId);
                if (existing) return existing.id;
                const now = new Date().toISOString();
                const id = `agent-workflow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const workflowRun = createAgentWorkflowRunRecord({ preset, projectId, canvasId, episodeId, id, now });
                set((state) => ({ workflowRuns: [workflowRun, ...state.workflowRuns] }));
                return id;
            },
            generateWorkflowMappingPreview: (workflowRunId, stageId) => {
                const now = new Date().toISOString();
                const workflowRun = get().workflowRuns.find((run) => run.id === workflowRunId);
                if (!workflowRun) return { ok: false, reason: "未找到 workflow run" };
                const eligibility = canGenerateWorkflowMappingPreview(workflowRun, stageId);
                if (!eligibility.allowed) return { ok: false, reason: eligibility.reason };
                const outputId = workflowRun.stageStates.find((stage) => stage.stageId === stageId)?.outputId;
                const output = get().workflowOutputs.find((item) => item.outputId === outputId);
                if (!output) return { ok: false, reason: "未找到已批准阶段的产物快照" };
                const previews = buildWorkflowMappingPreviews({ workflowRun, stageId, output, now });
                set((state) => ({
                    workflowMappingPreviews: [...state.workflowMappingPreviews.filter((item) => !previews.some((preview) => preview.previewId === item.previewId)), ...previews],
                }));
                return { ok: true, previewIds: previews.map((preview) => preview.previewId) };
            },
            applyProductionBiblePreview: (previewId, selectedItemIds) => {
                const preview = get().workflowMappingPreviews.find((item) => item.previewId === previewId);
                const workflowRun = preview ? get().workflowRuns.find((item) => item.id === preview.workflowRunId) : undefined;
                const output = preview ? get().workflowOutputs.find((item) => item.outputId === preview.sourceOutputId) : undefined;
                const eligibility = canApplyWorkflowMappingPreviewToProductionBible({ workflowRun, preview, output });
                if (!eligibility.allowed) return { ok: false, reason: eligibility.reason, warnings: [eligibility.reason] };
                const existingItems = useProductionBibleStore.getState().items;
                const result = applyWorkflowMappingPreviewToProductionBible({
                    preview: preview!,
                    workflowRun: workflowRun!,
                    output: output!,
                    selectedItemIds,
                    existingItems,
                });
                if (!result.appliedWrites.length) return { ok: false, reason: result.warnings[0] || "没有可写入的设定库条目", warnings: result.warnings, appliedCount: 0, skippedCount: result.skippedPreviewItemIds.length };
                const addBibleItem = useProductionBibleStore.getState().addItem;
                for (const write of result.appliedWrites) addBibleItem(write.input);
                set((state) => ({
                    workflowAppliedPreviewItemIds: Array.from(new Set([...state.workflowAppliedPreviewItemIds, ...result.appliedPreviewItemIds])),
                }));
                return {
                    ok: true,
                    appliedCount: result.appliedWrites.length,
                    skippedCount: result.skippedPreviewItemIds.length,
                    warnings: result.warnings,
                };
            },
            createRun: (config, input, draftOutput) => {
                const now = new Date().toISOString();
                const id = `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const run = createAgentRunRecord({ config, input, id, now, draftOutput });
                set((state) => ({ runs: [run, ...state.runs] }));
                return id;
            },
            startWorkflowTextRun: (input) => {
                const now = new Date().toISOString();
                const id = `agent-run-workflow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const run = createWorkflowTextRunRecord({ input, id, now });
                set((state) => ({
                    runs: [run, ...state.runs],
                    workflowRuns:
                        input.workflowRunId && input.stageId ? state.workflowRuns.map((workflowRun) => (workflowRun.id === input.workflowRunId ? startAgentWorkflowStageRun(workflowRun, input.stageId!, id, now) : workflowRun)) : state.workflowRuns,
                }));
                return id;
            },
            completeWorkflowTextRun: (id, rawText) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const completedRun = state.runs.find((run) => run.id === id);
                    if (!completedRun) return state;
                    const run = setWorkflowTextRunCompleted(completedRun, rawText, now);
                    const workflowRunId = run.input.workflowRunId;
                    const outputId = workflowRunId ? `workflow-output-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : "";
                    const output = workflowRunId ? buildAgentWorkflowStageOutput({ workflowRunId, runnerRun: run, outputId, now }) : undefined;
                    return {
                        runs: state.runs.map((item) => (item.id === id ? run : item)),
                        workflowOutputs: output ? [output, ...state.workflowOutputs] : state.workflowOutputs,
                        workflowRuns: output ? state.workflowRuns.map((workflowRun) => (workflowRun.id === workflowRunId ? completeAgentWorkflowStageRun(workflowRun, output, now) : workflowRun)) : state.workflowRuns,
                    };
                }),
            failWorkflowTextRun: (id, errorMessage) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const failedRun = state.runs.find((run) => run.id === id);
                    if (!failedRun) return state;
                    const run = setWorkflowTextRunFailed(failedRun, errorMessage, now);
                    return {
                        runs: state.runs.map((item) => (item.id === id ? run : item)),
                        workflowRuns:
                            run.input.workflowRunId && run.input.stageId
                                ? state.workflowRuns.map((workflowRun) => (workflowRun.id === run.input.workflowRunId ? failAgentWorkflowStageRun(workflowRun, run.input.stageId!, id, errorMessage, now) : workflowRun))
                                : state.workflowRuns,
                    };
                }),
            updateDraft: (id, draftOutput) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? updateAgentRunDraft(run, draftOutput, new Date().toISOString()) : run)),
                })),
            approveRun: (id, reviewerNote) => set((state) => updateRunReviewState(state, id, "approved", reviewerNote)),
            rejectRun: (id, reviewerNote) => set((state) => updateRunReviewState(state, id, "rejected", reviewerNote)),
            markApplied: (id) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? markAgentRunApplied(run, new Date().toISOString()) : run)),
                })),
            markFailed: (id, errorMessage) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? markAgentRunFailed(run, errorMessage, new Date().toISOString()) : run)),
                })),
            listRunsByProject: (projectId) => listAgentRunsByProject(get().runs, projectId),
            listRunsByEpisode: (episodeId) => listAgentRunsByEpisode(get().runs, episodeId),
            listRunsByAgentKind: (agentKind) => listAgentRunsByAgentKind(get().runs, agentKind),
        }),
        {
            name: AGENT_RUNNER_STORE_KEY,
            storage: agentRunnerStorage,
            partialize: (state) =>
                ({
                    runs: state.runs,
                    workflowRuns: state.workflowRuns,
                    workflowOutputs: state.workflowOutputs,
                    workflowEvidences: state.workflowEvidences,
                    workflowMappingPreviews: state.workflowMappingPreviews,
                    workflowAppliedPreviewItemIds: state.workflowAppliedPreviewItemIds,
                }) as StorageValue<AgentRunnerStore>["state"],
        },
    ),
);

function normalizeStoredRun(run: AgentRunRecord): AgentRunRecord {
    return {
        ...run,
        draftOutput: normalizeStoredDraftOutput(run.draftOutput),
        workflowTextOutput: normalizeStoredWorkflowTextOutput(run.workflowTextOutput),
        proposedActions: run.proposedActions || [],
    };
}

function updateRunReviewState(state: AgentRunnerStore, id: string, decision: "approved" | "rejected", reviewerNote?: string): Partial<AgentRunnerStore> {
    const now = new Date().toISOString();
    const targetRun = state.runs.find((run) => run.id === id);
    if (!targetRun) return state;
    const run = decision === "approved" ? approveAgentRun(targetRun, now) : rejectAgentRun(targetRun, now);
    const workflowRun = run.input.workflowRunId ? state.workflowRuns.find((item) => item.id === run.input.workflowRunId) : undefined;
    const evidence = workflowRun ? buildAgentWorkflowReviewEvidence({ workflowRun, runnerRun: run, evidenceId: `workflow-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, decision, reviewerNote, now }) : undefined;
    return {
        runs: state.runs.map((item) => (item.id === id ? run : item)),
        workflowEvidences: evidence ? [evidence, ...state.workflowEvidences] : state.workflowEvidences,
        workflowRuns: evidence ? state.workflowRuns.map((item) => (item.id === workflowRun?.id ? reviewAgentWorkflowStageRun(item, evidence, now) : item)) : state.workflowRuns,
    };
}

function normalizeStoredWorkflowRun(run: AgentWorkflowRunRecord): AgentWorkflowRunRecord {
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
        })),
        createdAt: run.createdAt || new Date().toISOString(),
        updatedAt: run.updatedAt || run.createdAt || new Date().toISOString(),
    };
}

function normalizeStoredWorkflowOutput(output: AgentWorkflowStageOutput): AgentWorkflowStageOutput {
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

function normalizeStoredWorkflowEvidence(evidence: AgentWorkflowReviewEvidence): AgentWorkflowReviewEvidence {
    return {
        evidenceId: evidence.evidenceId || "",
        projectId: evidence.projectId || "",
        workflowRunId: evidence.workflowRunId || "",
        stageId: evidence.stageId || "",
        runnerRunId: evidence.runnerRunId || "",
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

function normalizeStoredWorkflowMappingPreview(preview: AgentWorkflowMappingPreview): AgentWorkflowMappingPreview {
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
