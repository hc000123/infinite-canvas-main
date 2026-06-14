"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { resolveMediaUrl } from "@/services/file-storage";

import { buildImportedVideoPackage } from "./video-package-builders";

export { buildImportedVideoPackage };

export type PromptStatus = "待审核" | "已确认" | "需修改";
export type AssetStatus = "完整" | "缺角色图" | "缺场景图";
export type CanvasStatus = "未导入" | "已导入" | "已生成";
export type AssetKind = "角色图" | "场景图" | "道具图" | "上一镜尾帧";
export type PackageGenerationStatus = "idle" | "checking" | "creating" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type WorkflowVideoReference = {
    ref: string;
    type: string;
    name: string;
    usage?: string;
};

export type PackageGeneration = {
    aiTaskCredits?: number;
    aiTaskId?: string;
    assetId?: string;
    errorMessage?: string;
    status: PackageGenerationStatus;
    taskId?: string;
    taskStatus?: string;
    updatedAt: string;
    video?: {
        bytes: number;
        height: number;
        mimeType: string;
        storageKey?: string;
        url: string;
        width: number;
    };
};

export type ProductionPackage = {
    id: string;
    segment: string;
    duration: string;
    promptStatus: PromptStatus;
    assetStatus: AssetStatus;
    canvasStatus: CanvasStatus;
    prompt: string;
    tags: Record<"运镜" | "主体动作" | "环境" | "光影" | "节奏", string>;
    assets: { kind: AssetKind; name: string; status: "已绑定" | "缺失" }[];
    config: { model: string; ratio: string; duration: string; resolution: string; motion: string; frames: string };
    generation?: PackageGeneration;
    generationVersions?: PackageGeneration[];
    risks: { level: "提示" | "注意" | "阻断"; text: string }[];
    source?: string;
    sourceEpisode?: string;
    sourceProjectSlug?: string;
    workflowReferences?: WorkflowVideoReference[];
};

type VideoPackageStore = {
    importedPackages: ProductionPackage[];
    clearImportedPackages: () => void;
    updateImportedPackage: (id: string, patch: Partial<ProductionPackage>) => void;
    upsertImportedPackages: (packages: ProductionPackage[]) => number;
};

const videoPackageStorage: PersistStorage<VideoPackageStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<VideoPackageStore>;
        parsed.state.importedPackages = await Promise.all(
            (parsed.state.importedPackages || []).map(async (item): Promise<ProductionPackage> => {
                const generation = item.generation;
                const video = generation?.video;
                if (!generation || !video?.storageKey) return item;
                return {
                    ...item,
                    generation: {
                        ...generation,
                        video: {
                            ...video,
                            url: await resolveMediaUrl(video.storageKey, video.url),
                        },
                    },
                };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useVideoPackageStore = create<VideoPackageStore>()(
    persist(
        (set) => ({
            importedPackages: [],
            clearImportedPackages: () => set({ importedPackages: [] }),
            updateImportedPackage: (id, patch) =>
                set((state) => ({
                    importedPackages: state.importedPackages.map((item) => (item.id === id ? { ...item, ...patch } : item)),
                })),
            upsertImportedPackages: (packages) => {
                set((state) => {
                    const next = [...state.importedPackages];
                    for (const item of packages) {
                        const index = next.findIndex((existing) => existing.id === item.id);
                        if (index >= 0) next[index] = { ...next[index], ...item };
                        else next.push(item);
                    }
                    return { importedPackages: next };
                });
                return packages.length;
            },
        }),
        {
            name: "infinite-canvas:video_prompt_packages",
            storage: videoPackageStorage,
            partialize: (state) => ({ importedPackages: state.importedPackages }) as StorageValue<VideoPackageStore>["state"],
        },
    ),
);
