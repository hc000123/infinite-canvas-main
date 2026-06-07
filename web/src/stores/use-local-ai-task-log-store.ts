"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { LOCAL_BILLING_RATE_CARD, normalizeBillingNote, type LocalBillingCurrency } from "@/services/ai-local-billing";

export type LocalAiTaskSourceType = "workflow_text_stage" | "agent_text_run" | "image_generation" | "brief_image_generation";
export type LocalAiTaskRequestType = "text" | "image";
export type LocalAiTaskStatus = "running" | "success" | "error" | "cancelled";
export type LocalAiTaskBillingSource = "local_external" | "unknown";

export type LocalAiTaskRecord = {
    id: string;
    projectId: string;
    episodeId?: string;
    canvasId?: string;
    sourceType: LocalAiTaskSourceType;
    sourceId: string;
    agentKind?: string;
    workflowId?: string;
    stageId?: string;
    provider: string;
    model: string;
    channelMode: string;
    requestType: LocalAiTaskRequestType;
    status: LocalAiTaskStatus;
    startedAt: string;
    completedAt?: string;
    errorMessage?: string;
    inputSummary: string;
    outputSummary: string;
    imageCount?: number;
    imageSize?: string;
    requestedImageSize?: string;
    resultImageSize?: string;
    estimatedCost?: number | null;
    estimatedCostCurrency: LocalBillingCurrency;
    billingSource: LocalAiTaskBillingSource;
    billingNote: string;
};

type LocalAiTaskStartInput = Omit<LocalAiTaskRecord, "id" | "status" | "startedAt" | "completedAt" | "errorMessage" | "estimatedCostCurrency" | "billingSource" | "billingNote"> & {
    id?: string;
    startedAt?: string;
    status?: LocalAiTaskStatus;
    estimatedCostCurrency?: LocalBillingCurrency;
    billingSource?: LocalAiTaskBillingSource;
    billingNote?: string;
};

type LocalAiTaskPatch = Partial<Omit<LocalAiTaskRecord, "id" | "startedAt">>;

type LocalAiTaskLogStore = {
    records: LocalAiTaskRecord[];
    startTask: (input: LocalAiTaskStartInput) => string;
    updateTask: (id: string, patch: LocalAiTaskPatch) => void;
    completeTask: (id: string, patch?: LocalAiTaskPatch) => void;
    failTask: (id: string, errorMessage: string, patch?: LocalAiTaskPatch) => void;
    cancelTask: (id: string, patch?: LocalAiTaskPatch) => void;
    listByProject: (projectId: string) => LocalAiTaskRecord[];
};

const LOCAL_AI_TASK_LOG_STORE_KEY = "infinite-canvas:local_ai_task_log_store";
const MAX_LOCAL_AI_TASK_RECORDS = 300;

const localAiTaskStorage: PersistStorage<LocalAiTaskLogStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<LocalAiTaskLogStore>;
        parsed.state.records = (parsed.state.records || []).map(normalizeStoredRecord);
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useLocalAiTaskLogStore = create<LocalAiTaskLogStore>()(
    persist(
        (set, get) => ({
            records: [],
            startTask: (input) => {
                const id = input.id || `local-ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const record = normalizeStoredRecord({
                    ...input,
                    id,
                    status: input.status || "running",
                    startedAt: input.startedAt || new Date().toISOString(),
                    estimatedCostCurrency: input.estimatedCostCurrency || LOCAL_BILLING_RATE_CARD.currency,
                    billingSource: input.billingSource || "local_external",
                    billingNote: input.billingNote || normalizeBillingNote({ requestType: input.requestType, requestedSize: input.requestedImageSize || input.imageSize, resultSize: input.resultImageSize }),
                });
                set((state) => ({ records: [record, ...state.records.filter((item) => item.id !== id)].slice(0, MAX_LOCAL_AI_TASK_RECORDS) }));
                return id;
            },
            updateTask: (id, patch) =>
                set((state) => ({
                    records: state.records.map((record) =>
                        record.id === id
                            ? normalizeStoredRecord({
                                  ...record,
                                  ...patch,
                                  billingNote:
                                      patch.billingNote ||
                                      normalizeBillingNote({
                                          requestType: record.requestType,
                                          requestedSize: patch.requestedImageSize || record.requestedImageSize || record.imageSize,
                                          resultSize: patch.resultImageSize || record.resultImageSize,
                                      }),
                              })
                            : record,
                    ),
                })),
            completeTask: (id, patch) =>
                set((state) => ({
                    records: state.records.map((record) =>
                        record.id === id
                            ? normalizeStoredRecord({
                                  ...record,
                                  ...patch,
                                  status: "success",
                                  completedAt: patch?.completedAt || new Date().toISOString(),
                                  billingNote:
                                      patch?.billingNote ||
                                      normalizeBillingNote({ requestType: record.requestType, requestedSize: patch?.requestedImageSize || record.requestedImageSize || record.imageSize, resultSize: patch?.resultImageSize || record.resultImageSize }),
                              })
                            : record,
                    ),
                })),
            failTask: (id, errorMessage, patch) =>
                set((state) => ({
                    records: state.records.map((record) =>
                        record.id === id
                            ? normalizeStoredRecord({
                                  ...record,
                                  ...patch,
                                  status: "error",
                                  completedAt: patch?.completedAt || new Date().toISOString(),
                                  errorMessage,
                                  billingNote: patch?.billingNote || normalizeBillingNote({ requestType: record.requestType, requestedSize: record.requestedImageSize || record.imageSize, resultSize: record.resultImageSize }),
                              })
                            : record,
                    ),
                })),
            cancelTask: (id, patch) =>
                set((state) => ({
                    records: state.records.map((record) => (record.id === id ? normalizeStoredRecord({ ...record, ...patch, status: "cancelled", completedAt: patch?.completedAt || new Date().toISOString() }) : record)),
                })),
            listByProject: (projectId) => get().records.filter((record) => record.projectId === projectId),
        }),
        {
            name: LOCAL_AI_TASK_LOG_STORE_KEY,
            storage: localAiTaskStorage,
            partialize: (state) => ({ records: state.records }) as StorageValue<LocalAiTaskLogStore>["state"],
        },
    ),
);

function normalizeStoredRecord(record: LocalAiTaskRecord): LocalAiTaskRecord {
    const requestType = record.requestType === "image" ? "image" : "text";
    return {
        id: record.id || `local-ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        projectId: record.projectId || "unknown",
        episodeId: record.episodeId,
        canvasId: record.canvasId,
        sourceType: normalizeSourceType(record.sourceType),
        sourceId: record.sourceId || "",
        agentKind: record.agentKind,
        workflowId: record.workflowId,
        stageId: record.stageId,
        provider: record.provider || "openai-compatible",
        model: record.model || "unknown",
        channelMode: record.channelMode || "local",
        requestType,
        status: normalizeStatus(record.status),
        startedAt: record.startedAt || new Date().toISOString(),
        completedAt: record.completedAt,
        errorMessage: record.errorMessage,
        inputSummary: record.inputSummary || "暂无输入摘要",
        outputSummary: record.outputSummary || "",
        imageCount: typeof record.imageCount === "number" ? record.imageCount : undefined,
        imageSize: record.imageSize,
        requestedImageSize: record.requestedImageSize || record.imageSize,
        resultImageSize: record.resultImageSize,
        estimatedCost: typeof record.estimatedCost === "number" ? record.estimatedCost : record.estimatedCost == null ? null : undefined,
        estimatedCostCurrency: record.estimatedCostCurrency || LOCAL_BILLING_RATE_CARD.currency,
        billingSource: record.billingSource === "unknown" ? "unknown" : "local_external",
        billingNote: record.billingNote || normalizeBillingNote({ requestType, requestedSize: record.requestedImageSize || record.imageSize, resultSize: record.resultImageSize }),
    };
}

function normalizeSourceType(value: LocalAiTaskSourceType): LocalAiTaskSourceType {
    if (value === "agent_text_run" || value === "image_generation" || value === "brief_image_generation") return value;
    return "workflow_text_stage";
}

function normalizeStatus(value: LocalAiTaskStatus): LocalAiTaskStatus {
    if (value === "success" || value === "error" || value === "cancelled") return value;
    return "running";
}
