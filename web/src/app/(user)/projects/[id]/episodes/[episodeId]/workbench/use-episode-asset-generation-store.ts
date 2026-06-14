"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export type EpisodeAssetGenerationStatus = "running" | "success" | "error";

export type EpisodeAssetGenerationRecord = {
    assetId: string;
    assetIds: string[];
    assetName: string;
    completedAt?: string;
    episodeId: string;
    errorMessage?: string;
    key: string;
    model?: string;
    projectId: string;
    size?: string;
    startedAt: string;
    status: EpisodeAssetGenerationStatus;
};

type EpisodeAssetGenerationStartInput = {
    assetId: string;
    assetName: string;
    episodeId: string;
    model?: string;
    projectId: string;
    size?: string;
};

type EpisodeAssetGenerationPatchInput = {
    assetId: string;
    assetIds?: string[];
    episodeId: string;
    errorMessage?: string;
    projectId: string;
};

type EpisodeAssetGenerationStore = {
    records: EpisodeAssetGenerationRecord[];
    completeGeneration: (input: EpisodeAssetGenerationPatchInput) => void;
    failGeneration: (input: EpisodeAssetGenerationPatchInput) => void;
    pruneStaleGenerationRecords: (now?: number) => void;
    startGeneration: (input: EpisodeAssetGenerationStartInput) => void;
};

const STORE_KEY = "infinite-canvas:episode_asset_generation_store";
const MAX_RECORDS = 120;
export const EPISODE_ASSET_GENERATION_RUNNING_TTL_MS = 30 * 60 * 1000;

const generationStorage: PersistStorage<EpisodeAssetGenerationStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<EpisodeAssetGenerationStore>;
        parsed.state.records = (parsed.state.records || []).map(normalizeRecord).filter(Boolean) as EpisodeAssetGenerationRecord[];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useEpisodeAssetGenerationStore = create<EpisodeAssetGenerationStore>()(
    persist(
        (set) => ({
            records: [],
            startGeneration: (input) =>
                set((state) => {
                    const key = generationKey(input.projectId, input.episodeId, input.assetId);
                    const record = normalizeRecord({
                        ...input,
                        key,
                        assetIds: [],
                        startedAt: new Date().toISOString(),
                        status: "running",
                    });
                    return { records: [record, ...state.records.filter((item) => item.key !== key)].slice(0, MAX_RECORDS) };
                }),
            completeGeneration: (input) =>
                set((state) => patchRecord(state.records, input, { status: "success", assetIds: input.assetIds || [], completedAt: new Date().toISOString(), errorMessage: undefined })),
            failGeneration: (input) =>
                set((state) =>
                    patchRecord(state.records, input, {
                        status: "error",
                        assetIds: input.assetIds || [],
                        completedAt: new Date().toISOString(),
                        errorMessage: input.errorMessage || "生成图片失败",
                    }),
                ),
            pruneStaleGenerationRecords: (now = Date.now()) =>
                set((state) => ({
                    records: state.records.map((record) => {
                        if (record.status !== "running" || now - Date.parse(record.startedAt) <= EPISODE_ASSET_GENERATION_RUNNING_TTL_MS) return record;
                        return {
                            ...record,
                            completedAt: new Date(now).toISOString(),
                            errorMessage: "生成状态已超时，请重新生成。",
                            status: "error",
                        };
                    }),
                })),
        }),
        {
            name: STORE_KEY,
            storage: generationStorage,
            partialize: (state) => ({ records: state.records }) as StorageValue<EpisodeAssetGenerationStore>["state"],
        },
    ),
);

export function runningEpisodeAssetGenerationIds(records: EpisodeAssetGenerationRecord[], projectId: string, episodeId: string) {
    const now = Date.now();
    return Object.fromEntries(
        records
            .filter((record) => record.projectId === projectId && record.episodeId === episodeId && record.status === "running" && now - Date.parse(record.startedAt) <= EPISODE_ASSET_GENERATION_RUNNING_TTL_MS)
            .map((record) => [record.assetId, true]),
    );
}

function patchRecord(records: EpisodeAssetGenerationRecord[], input: EpisodeAssetGenerationPatchInput, patch: Partial<EpisodeAssetGenerationRecord>) {
    const key = generationKey(input.projectId, input.episodeId, input.assetId);
    let matched = false;
    const next = records.map((record) => {
        if (record.key !== key) return record;
        matched = true;
        return normalizeRecord({ ...record, ...patch, key, projectId: input.projectId, episodeId: input.episodeId, assetId: input.assetId });
    });
    if (matched) return { records: next };
    return {
        records: [
            normalizeRecord({
                key,
                projectId: input.projectId,
                episodeId: input.episodeId,
                assetId: input.assetId,
                assetName: "",
                assetIds: input.assetIds || [],
                startedAt: new Date().toISOString(),
                ...patch,
            }),
            ...next,
        ].slice(0, MAX_RECORDS),
    };
}

function normalizeRecord(record: EpisodeAssetGenerationRecord | (Partial<EpisodeAssetGenerationRecord> & { assetId: string; episodeId: string; projectId: string })): EpisodeAssetGenerationRecord {
    const projectId = record.projectId || "";
    const episodeId = record.episodeId || "";
    const assetId = record.assetId || "";
    return {
        assetId,
        assetIds: Array.isArray(record.assetIds) ? record.assetIds.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [],
        assetName: record.assetName || "",
        completedAt: record.completedAt,
        episodeId,
        errorMessage: record.errorMessage,
        key: record.key || generationKey(projectId, episodeId, assetId),
        model: record.model,
        projectId,
        size: record.size,
        startedAt: record.startedAt || new Date().toISOString(),
        status: record.status === "success" || record.status === "error" ? record.status : "running",
    };
}

function generationKey(projectId: string, episodeId: string, assetId: string) {
    return `${projectId}:${episodeId}:${assetId}`;
}
