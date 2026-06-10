"use client";

import { canvasThemes } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useCanvasStore } from "../stores/use-canvas-store";
import { useGenerationQueueStore } from "../stores/use-generation-queue-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { useCreativeProjectStore } from "../../projects/use-creative-project-store";

export function useCanvasWorkspaceStores(canvasId: string) {
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const volcengineAssetEnabled = useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true);
    const token = useUserStore((state) => state.token);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const assets = useAssetStore((state) => state.assets);
    const attachStoryboardShotCanvasNodes = useStoryboardStore((state) => state.attachShotCanvasNodes);
    const attachShotGroupCanvasNodes = useStoryboardStore((state) => state.attachShotGroupCanvasNodes);
    const storyboardTableShots = useStoryboardStore((state) => state.tableShots);
    const storyboardShotGroups = useStoryboardStore((state) => state.shotGroups);
    const assetBreakdownItems = useAssetBreakdownStore((state) => state.items);
    const queueItems = useGenerationQueueStore((state) => state.items);
    const queuePaused = useGenerationQueueStore((state) => state.paused);
    const queueConcurrency = useGenerationQueueStore((state) => state.concurrency);
    const markQueueItemRunning = useGenerationQueueStore((state) => state.markRunning);
    const markQueueItemSucceeded = useGenerationQueueStore((state) => state.markSucceeded);
    const markQueueItemFailed = useGenerationQueueStore((state) => state.markFailed);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const flushProjects = useCanvasStore((state) => state.flushProjects);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === canvasId));
    const creativeProject = useCreativeProjectStore((state) => state.projects.find((project) => project.id === currentProject?.projectId));
    const attachCanvasToCreativeProject = useCreativeProjectStore((state) => state.attachCanvas);
    const ensureUnfiledProject = useCreativeProjectStore((state) => state.ensureUnfiledProject);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return {
        addAssetOnce,
        assetBreakdownItems,
        assets,
        attachCanvasToCreativeProject,
        attachShotGroupCanvasNodes,
        attachStoryboardShotCanvasNodes,
        cleanupAssetImages,
        createProject,
        creativeProject,
        currentProject,
        deleteProjects,
        effectiveConfig,
        ensureProjectFolder,
        ensureUnfiledProject,
        flushProjects,
        hydrated,
        isAiConfigReady,
        markQueueItemFailed,
        markQueueItemRunning,
        markQueueItemSucceeded,
        openConfigDialog,
        openProject,
        queueConcurrency,
        queueItems,
        queuePaused,
        renameProject,
        storyboardShotGroups,
        storyboardTableShots,
        theme,
        token,
        updateAsset,
        updateConfig,
        updateProject,
        volcengineAssetEnabled,
        workspaceProjectId: currentProject?.projectId || canvasId,
        workspaceProjectTitle: creativeProject?.title || currentProject?.title || "未命名画布",
    };
}
