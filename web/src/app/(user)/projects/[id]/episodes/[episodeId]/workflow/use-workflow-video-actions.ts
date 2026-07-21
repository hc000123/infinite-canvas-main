"use client";

import { useEffect, useState } from "react";
import { App } from "antd";

import { runCanvasVideoGeneration } from "@/app/(user)/canvas/utils/canvas-generation-runner";
import { alignWorkflowPromptReferencesForSeedance, enterpriseVideoChannelReadiness, resolveWorkflowReferenceImages, workflowVideoGenerationReadiness } from "@/app/(user)/video/video-package-builders";
import { formatVideoGenerationError } from "@/app/(user)/video/video-generation-errors";
import { aiTaskLedgerFromVideoTask, buildPackageAssetGeneration, buildPackageVideoConfig, generationFromTask, resolvePackageVideoModel } from "@/app/(user)/video/video-page-utils";
import { useVideoPackageStore, type PackageGeneration, type ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import { fetchVideoTaskContent, preflightVideoGeneration, RecoverableVideoTaskError, refreshVideoTask, type NormalizedVideoTask } from "@/services/api/video";
import { uploadMediaFile } from "@/services/file-storage";
import { useAssetStore, type AssetWriteInput } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";

import { eligibleBatchPackages } from "./workflow-batch-eligibility";

export function useWorkflowVideoActions(packages: ProductionPackage[]) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const hasLoadedPublicSettings = useConfigStore((state) => state.hasLoadedPublicSettings);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const assets = useAssetStore((state) => state.assets);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const updatePackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const [generating, setGenerating] = useState<Record<string, boolean>>({});
    const [preflighting, setPreflighting] = useState<Record<string, boolean>>({});

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    const scopeKey = (item: ProductionPackage) => `${item.projectId}:${item.episodeId}:${item.id}`;
    const prepare = (item: ProductionPackage) => {
        const config = buildPackageVideoConfig(effectiveConfig, item);
        const model = resolvePackageVideoModel(config);
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            message.warning("请先完成现有视频模型配置");
            return null;
        }
        const channel = enterpriseVideoChannelReadiness({ isPublicSettingsLoading: isPublicSettingsLoading || !hasLoadedPublicSettings, videoProtocol: config.videoProtocol });
        if (channel.status !== "ready") {
            message.error(channel.message);
            return null;
        }
        const readiness = workflowVideoGenerationReadiness(item, assets, config.videoProtocol);
        if (readiness.status === "blocked") {
            message.error(readiness.message);
            return null;
        }
        if (readiness.status === "warning") message.warning(readiness.message);
        return config;
    };

    const preflight = async (item: ProductionPackage) => {
        const config = prepare(item);
        if (!config) return false;
        const key = scopeKey(item);
        setPreflighting((current) => ({ ...current, [key]: true }));
        try {
            await preflightVideoGeneration(config);
            message.success(`${item.id} 视频通道预检通过`);
            return true;
        } catch (error) {
            message.error(formatVideoGenerationError(error));
            return false;
        } finally {
            setPreflighting((current) => ({ ...current, [key]: false }));
        }
    };

    const archiveResult = async (item: ProductionPackage, config: ReturnType<typeof buildPackageVideoConfig>, video: Awaited<ReturnType<typeof uploadMediaFile>> & { aiTask?: ReturnType<typeof aiTaskLedgerFromVideoTask> }, task: NormalizedVideoTask | null) => {
        const savedAt = new Date().toISOString();
        const generationRecord = buildPackageAssetGeneration(item, config, video, task, savedAt);
        const input = {
            coverUrl: "",
            data: { bytes: video.bytes, height: video.height || 720, mimeType: video.mimeType || "video/mp4", storageKey: video.storageKey, url: video.url, width: video.width || 1280 },
            kind: "video",
            metadata: { aiTask: video.aiTask, generation: generationRecord, originalWorkflow: { episodeId: item.episodeId, packageId: item.id, projectId: item.projectId, source: item.source }, videoGeneration: { model: config.model, protocol: config.videoProtocol } },
            note: item.prompt,
            source: "unified-video-workflow",
            tags: ["视频工作流", item.episodeId, item.id],
            title: `${item.id} ${item.segment}`.trim(),
        } satisfies AssetWriteInput;
        const assetId = await addAssetOnce(input);
        const next: PackageGeneration = { aiTaskCredits: video.aiTask?.aiTaskCredits, aiTaskId: video.aiTask?.aiTaskId, assetId, status: "succeeded", taskId: task?.id, taskStatus: task?.rawStatus || task?.status || "succeeded", updatedAt: savedAt, video: input.data };
        updatePackage(item, { canvasStatus: "已生成", generation: next, generationVersions: [...(item.generationVersions || []), next], promptStatus: "已确认" });
    };

    const generate = async (item: ProductionPackage, skipPreflight = false) => {
        const config = prepare(item);
        if (!config) return false;
        const key = scopeKey(item);
        if (generating[key]) return false;
        setGenerating((current) => ({ ...current, [key]: true }));
        updatePackage(item, { generation: { ...item.generation, status: "checking", taskStatus: "preflight", updatedAt: new Date().toISOString() } });
        try {
            if (!skipPreflight) await preflightVideoGeneration(config);
            updatePackage(item, { generation: { ...item.generation, status: "creating", taskStatus: "creating", updatedAt: new Date().toISOString() } });
            const images = resolveWorkflowReferenceImages(item, assets);
            const prompt = config.videoProtocol === "volcengine-ark" ? alignWorkflowPromptReferencesForSeedance(item.prompt, images) : item.prompt;
            const { completedTask, video } = await runCanvasVideoGeneration(config, prompt, images, (task) => updatePackage(item, { generation: generationFromTask(task) }));
            await archiveResult(item, config, video, completedTask);
            message.success(`${item.id} 已生成并保存到我的素材`);
            return true;
        } catch (error) {
            const errorMessage = formatVideoGenerationError(error);
            if (error instanceof RecoverableVideoTaskError) {
                updatePackage(item, { generation: { ...generationFromTask(error.task), errorMessage, status: error.task.status === "succeeded" ? "running" : error.task.status } });
                message.warning(`${item.id} 已保留任务 ID，可稍后同步`);
            } else {
                updatePackage(item, { generation: { ...item.generation, errorMessage, status: "failed", updatedAt: new Date().toISOString() } });
                message.error(errorMessage);
            }
            return false;
        } finally {
            setGenerating((current) => ({ ...current, [key]: false }));
        }
    };

    const sync = async (item: ProductionPackage) => {
        const taskId = item.generation?.taskId;
        const config = prepare(item);
        if (!taskId || !config) {
            if (!taskId) message.warning("当前分镜没有可同步的任务 ID");
            return false;
        }
        const key = scopeKey(item);
        setGenerating((current) => ({ ...current, [key]: true }));
        try {
            const task = await refreshVideoTask(config, taskId);
            updatePackage(item, { generation: generationFromTask(task) });
            if (task.status !== "succeeded") {
                message.info(`${item.id} 当前状态：${task.status}`);
                return false;
            }
            const blob = await fetchVideoTaskContent(config, task);
            const video = await uploadMediaFile(blob, "video");
            await archiveResult(item, config, { ...video, aiTask: aiTaskLedgerFromVideoTask(task) }, task);
            message.success(`${item.id} 结果已同步并归档`);
            return true;
        } catch (error) {
            const errorMessage = formatVideoGenerationError(error);
            updatePackage(item, { generation: { ...item.generation, errorMessage, status: "failed", updatedAt: new Date().toISOString() } });
            message.error(errorMessage);
            return false;
        } finally {
            setGenerating((current) => ({ ...current, [key]: false }));
        }
    };

    const batch = async () => {
        const eligible = eligibleBatchPackages(packages);
        for (const item of eligible.included) await generate(item);
        return eligible;
    };

    return { batch, eligibility: eligibleBatchPackages(packages), generate, generating, preflight, preflighting, scopeKey, sync };
}
