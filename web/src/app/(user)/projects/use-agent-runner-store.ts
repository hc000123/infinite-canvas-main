"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasNodeData, Position } from "../canvas/types";
import type { AgentConfig } from "./agent-settings";
import type { AgentWorkflowPreset } from "./agent-workflow-presets";
import { buildSeedanceQualityGateManifest, buildWorkflowReadingRecords } from "./workflow-quality-gates";
import {
    applyProductionBiblePreviewToStores,
    applyStoryboardPreviewToStores,
    applyVideoNodePreviewToStores,
    nextAppliedPreviewItemIds,
} from "./agent-runner-store-preview";
import { markStartedWorkflowStageReadings, updateRunReviewState } from "./agent-runner-store-review";
import { getSeedanceWorkflowAgentCore } from "./workflow-agents/seedance-workflow-agents";
import { normalizeAgentRunnerPersistedState } from "./agent-runner-store-normalizers";
import {
    listAgentRunsByAgentKind,
    listAgentRunsByEpisode,
    listAgentRunsByProject,
    markAgentRunApplied,
    markAgentRunFailed,
    setWorkflowTextRunCompleted,
    setWorkflowTextRunFailed,
    updateAgentRunDraft,
} from "./agent-runner-records";
import type {
    AgentRunInput,
    AgentRunKind,
    AgentRunRecord,
    AgentWorkflowMappingPreview,
    AgentWorkflowReviewEvidence,
    AgentWorkflowRunRecord,
    AgentWorkflowStageOutput,
} from "./agent-runner-types";
import { buildWorkflowMappingPreviews, canGenerateWorkflowMappingPreview } from "./agent-runner-workflow-preview";
import {
    bindAgentWorkflowRunCanvas,
    buildAgentWorkflowStageOutput,
    buildApprovedWorkflowSceneAggregateOutput,
    completeAgentWorkflowSceneRun,
    completeAgentWorkflowStageRun,
    createAgentWorkflowRunRecord,
    failAgentWorkflowSceneRun,
    failAgentWorkflowStageRun,
} from "./agent-runner-workflow-state";

type AgentRunnerStore = {
    runs: AgentRunRecord[];
    workflowRuns: AgentWorkflowRunRecord[];
    workflowOutputs: AgentWorkflowStageOutput[];
    workflowEvidences: AgentWorkflowReviewEvidence[];
    workflowMappingPreviews: AgentWorkflowMappingPreview[];
    workflowAppliedPreviewItemIds: string[];
    ensureWorkflowRun: (input: { projectId: string; canvasId?: string; episodeId?: string; preset: AgentWorkflowPreset }) => string;
    markWorkflowStageReadingsRead: (workflowRunId: string, stageId: string) => { ok: boolean; reason?: string; count?: number };
    summarizeApprovedStoryboardScenes: (workflowRunId: string) => { ok: boolean; reason?: string; outputId?: string; sceneCount?: number };
    generateWorkflowMappingPreview: (workflowRunId: string, stageId: string) => { ok: boolean; reason?: string; previewIds?: string[] };
    applyProductionBiblePreview: (previewId: string, selectedItemIds?: string[]) => { ok: boolean; reason?: string; appliedCount?: number; skippedCount?: number; warnings: string[] };
    applyStoryboardPreview: (previewId: string, selectedItemIds?: string[]) => { ok: boolean; reason?: string; appliedCount?: number; skippedCount?: number; warnings: string[] };
    applyVideoNodePreview: (
        previewId: string,
        options?: { selectedItemIds?: string[]; existingNodes?: CanvasNodeData[]; placement?: Position },
    ) => { ok: boolean; reason?: string; appliedCount?: number; skippedCount?: number; warnings: string[]; nextNodes?: CanvasNodeData[]; focusNodeIds?: string[] };
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
        Object.assign(parsed.state, normalizeAgentRunnerPersistedState(parsed.state));
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
                const unboundExisting = canvasId ? get().workflowRuns.find((run) => run.projectId === projectId && !run.canvasId && run.episodeId === episodeId && run.workflowId === preset.workflowId) : undefined;
                if (unboundExisting && canvasId) {
                    set((state) => ({
                        workflowRuns: state.workflowRuns.map((run) => (run.id === unboundExisting.id ? bindAgentWorkflowRunCanvas(run, canvasId, now) : run)),
                    }));
                    return unboundExisting.id;
                }
                const id = `agent-workflow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const workflowRun = createAgentWorkflowRunRecord({ preset, projectId, canvasId, episodeId, id, now });
                set((state) => ({ workflowRuns: [workflowRun, ...state.workflowRuns] }));
                return id;
            },
            markWorkflowStageReadingsRead: (workflowRunId, stageId) => {
                const workflowRun = get().workflowRuns.find((run) => run.id === workflowRunId);
                if (!workflowRun) return { ok: false, reason: "未找到 workflow run" };
                if (!workflowRun.stageStates.some((stage) => stage.stageId === stageId)) return { ok: false, reason: "未找到阶段状态" };
                const now = new Date().toISOString();
                const records = buildWorkflowReadingRecords({ manifest: buildSeedanceQualityGateManifest({ workflowId: workflowRun.workflowId, version: workflowRun.workflowVersion }), workflowRunId, stageId, now, status: "read" });
                set((state) => ({
                    workflowRuns: state.workflowRuns.map((run) =>
                        run.id === workflowRunId
                            ? {
                                  ...run,
                                  stageStates: run.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, readingRecords: records } : stage)),
                                  updatedAt: now,
                              }
                            : run,
                    ),
                }));
                return { ok: true, count: records.length };
            },
            summarizeApprovedStoryboardScenes: (workflowRunId) => {
                const workflowRun = get().workflowRuns.find((run) => run.id === workflowRunId);
                if (!workflowRun) return { ok: false, reason: "未找到 workflow run" };
                const now = new Date().toISOString();
                const result = buildApprovedWorkflowSceneAggregateOutput({ workflowRun, outputs: get().workflowOutputs, outputId: `workflow-output-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, now });
                if (!result.ok) return result;
                set((state) => ({
                    workflowOutputs: [result.output, ...state.workflowOutputs],
                    workflowRuns: state.workflowRuns.map((run) =>
                        run.id === workflowRunId
                            ? {
                                  ...run,
                                  currentStageId: "seedance-storyboard",
                                  stageStates: run.stageStates.map((stage) =>
                                      stage.stageId === "seedance-storyboard"
                                          ? {
                                                ...stage,
                                                status: "approved",
                                                runnerRunId: result.output.runnerRunId,
                                                outputId: result.output.outputId,
                                                approvedAt: now,
                                                errorMessage: undefined,
                                                blockedReason: undefined,
                                            }
                                          : stage,
                                  ),
                                  updatedAt: now,
                              }
                            : run,
                    ),
                }));
                return { ok: true, outputId: result.output.outputId, sceneCount: result.sceneCount };
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
                const core = getSeedanceWorkflowAgentCore(stageId);
                const previews = core ? core.buildMappingPreviews(output, { workflowRun, now }) : buildWorkflowMappingPreviews({ workflowRun, stageId, output, now });
                set((state) => ({
                    workflowMappingPreviews: [...state.workflowMappingPreviews.filter((item) => !previews.some((preview) => preview.previewId === item.previewId)), ...previews],
                }));
                return { ok: true, previewIds: previews.map((preview) => preview.previewId) };
            },
            applyProductionBiblePreview: (previewId, selectedItemIds) => {
                const result = applyProductionBiblePreviewToStores(get(), previewId, selectedItemIds);
                if (result.ok) set((state) => ({ workflowAppliedPreviewItemIds: nextAppliedPreviewItemIds(state.workflowAppliedPreviewItemIds, result.appliedPreviewItemIds) }));
                return result;
            },
            applyStoryboardPreview: (previewId, selectedItemIds) => {
                const result = applyStoryboardPreviewToStores(get(), previewId, selectedItemIds);
                if (result.ok) set((state) => ({ workflowAppliedPreviewItemIds: nextAppliedPreviewItemIds(state.workflowAppliedPreviewItemIds, result.appliedPreviewItemIds) }));
                return result;
            },
            applyVideoNodePreview: (previewId, options) => {
                const result = applyVideoNodePreviewToStores(get(), previewId, options);
                if (result.ok) set((state) => ({ workflowAppliedPreviewItemIds: nextAppliedPreviewItemIds(state.workflowAppliedPreviewItemIds, result.appliedPreviewItemIds) }));
                return result;
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
                    workflowRuns: input.workflowRunId && input.stageId ? state.workflowRuns.map((workflowRun) => (workflowRun.id === input.workflowRunId ? markStartedWorkflowStageReadings(workflowRun, input, id, now) : workflowRun)) : state.workflowRuns,
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
                        workflowRuns: output
                            ? state.workflowRuns.map((workflowRun) =>
                                  workflowRun.id === workflowRunId
                                      ? typeof run.input.variables.sceneKey === "string"
                                          ? completeAgentWorkflowSceneRun(workflowRun, { stageId: run.input.stageId!, sceneKey: run.input.variables.sceneKey, output, now })
                                          : completeAgentWorkflowStageRun(workflowRun, output, now)
                                      : workflowRun,
                              )
                            : state.workflowRuns,
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
                                ? state.workflowRuns.map((workflowRun) =>
                                      workflowRun.id === run.input.workflowRunId
                                          ? typeof run.input.variables.sceneKey === "string"
                                              ? failAgentWorkflowSceneRun(workflowRun, run.input.stageId!, run.input.variables.sceneKey, id, errorMessage, now)
                                              : failAgentWorkflowStageRun(workflowRun, run.input.stageId!, id, errorMessage, now)
                                          : workflowRun,
                                  )
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
