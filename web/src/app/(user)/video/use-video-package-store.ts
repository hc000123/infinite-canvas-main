"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { resolveMediaUrl } from "@/services/file-storage";

import { buildImportedVideoPackage } from "./video-package-builders";
import { updateScopedPackage, upsertScopedPackages, type ProductionPackageScope } from "./video-package-scope";

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
    logicalAssetId?: string;
    libraryAssetId?: string;
    version?: string;
};

export type WorkflowShotDraft = {
    shotSize: string;
    camera: string;
    movement: string;
    action: string;
    performance: string;
    dialogue: string;
    durationSeconds: number;
    continuityMode: "continuous" | "cut";
};

export type WorkflowReferenceBinding = {
    logicalAssetId: string;
    libraryAssetId: string;
    version: string;
    usage: string;
};

export type WorkflowContinuityReference = {
    sourceShotId: string;
    sourceVideoVersion: string;
    libraryAssetId: string;
    version: string;
    role: "continuity_reference";
    updateAvailable?: boolean;
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

export type ProductionPackageConfig = {
    model: string;
    ratio: string;
    duration: string;
    resolution: string;
    motion: string;
    frames: string;
    size?: string;
    videoSeconds?: string;
    vquality?: string;
    videoGenerateAudio?: string;
    videoWatermark?: string;
    videoSeed?: string;
    videoPromptReviewEnabled?: string;
    returnLastFrame?: string;
    videoTaskMode?: "generate" | "edit" | "extend";
    videoEditType?: "replace" | "add" | "remove" | "inpaint";
    videoExtendDirection?: "forward" | "backward";
    videoReferenceImageMode?: "reference" | "first_frame" | "first_last_frame" | "continue";
};

export type ProductionPackage = {
    projectId: string;
    episodeId: string;
    sceneKey: string;
    order: number;
    id: string;
    segment: string;
    duration: string;
    promptStatus: PromptStatus;
    assetStatus: AssetStatus;
    canvasStatus: CanvasStatus;
    prompt: string;
    tags: Record<"运镜" | "主体动作" | "环境" | "光影" | "节奏", string>;
    assets: { kind: AssetKind; name: string; status: "已绑定" | "缺失" }[];
    config: ProductionPackageConfig;
    generation?: PackageGeneration;
    generationVersions?: PackageGeneration[];
    risks: { level: "提示" | "注意" | "阻断"; text: string }[];
    source?: string;
    sourceEpisode?: string;
    sourceProjectId?: string;
    sourceProjectSlug?: string;
    workflowReferences?: WorkflowVideoReference[];
    sourceScript?: string;
    shotDraft?: WorkflowShotDraft;
    shotStatus?: "draft" | "confirmed";
    promptInputHash?: string;
    referenceBindings?: WorkflowReferenceBinding[];
    continuityReference?: WorkflowContinuityReference;
    lastFrameAssetId?: string;
    lastFrameVersion?: string;
};

type VideoPackageStore = {
    importedPackages: ProductionPackage[];
    clearImportedPackages: () => void;
    updateImportedPackage: (scope: ProductionPackageScope, patch: Partial<ProductionPackage>) => void;
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
            updateImportedPackage: (scope, patch) =>
                set((state) => ({
                    importedPackages: updateScopedPackage(state.importedPackages, scope, patch),
                })),
            upsertImportedPackages: (packages) => {
                set((state) => ({ importedPackages: upsertScopedPackages(state.importedPackages, packages) }));
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
