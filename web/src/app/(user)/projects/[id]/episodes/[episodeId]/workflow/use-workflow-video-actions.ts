"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";

import { runCanvasVideoGeneration } from "@/app/(user)/canvas/utils/canvas-generation-runner";
import { alignWorkflowPromptReferencesForSeedance, enterpriseVideoChannelReadiness, resolveWorkflowReferenceImages, workflowVideoGenerationReadiness } from "@/app/(user)/video/video-package-builders";
import { formatVideoGenerationError } from "@/app/(user)/video/video-generation-errors";
import { aiTaskLedgerFromVideoTask, buildPackageAssetGeneration, buildPackageVideoConfig, generationFromTask, resolvePackageVideoModel } from "@/app/(user)/video/video-page-utils";
import { useVideoPackageStore, type PackageGeneration, type ProductionPackage, type ProductionPackageConfig } from "@/app/(user)/video/use-video-package-store";
import { fetchVideoTaskContent, preflightVideoGeneration, RecoverableVideoTaskError, refreshVideoTask, type NormalizedVideoTask } from "@/services/api/video";
import { uploadMediaFile } from "@/services/file-storage";
import { archiveLocalMediaToProjectCache } from "@/services/project-cache-archive";
import { projectCacheContextFromGeneration, type ProjectCacheMediaKind } from "@/services/project-cache-context";
import { useAssetStore, type AssetWriteInput } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";

import { eligibleBatchPackages } from "./workflow-batch-eligibility";
import { buildContinuityReference, updateContinuityReference } from "./workflow-production-state";
import { archiveVideoLastFrame } from "./video-last-frame";

export function useWorkflowVideoActions(packages: ProductionPackage[]) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const hasLoadedPublicSettings = useConfigStore((state) => state.hasLoadedPublicSettings);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const token = useUserStore((state) => state.token);
    const creativeProjects = useCreativeProjectStore((state) => state.projects);
    const assets = useAssetStore((state) => state.assets);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const updatePackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const cachingAssetIdsRef = useRef(new Set<string>());
    const [generating, setGenerating] = useState<Record<string, boolean>>({});
    const [preflighting, setPreflighting] = useState<Record<string, boolean>>({});
    const [channelPreflighting, setChannelPreflighting] = useState(false);
    const [channelPreflight, setChannelPreflight] = useState<{ message: string; status: "failed" | "passed" } | null>(null);

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    const scopeKey = (item: ProductionPackage) => `${item.projectId}:${item.episodeId}:${item.id}`;
    const prepareChannel = (config: ReturnType<typeof buildPackageVideoConfig>) => {
        const model = resolvePackageVideoModel(config);
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            message.warning("请先完成现有视频模型配置");
            return false;
        }
        const channel = enterpriseVideoChannelReadiness({ isPublicSettingsLoading: isPublicSettingsLoading || !hasLoadedPublicSettings, videoProtocol: config.videoProtocol });
        if (channel.status !== "ready") {
            message.error(channel.message);
            return false;
        }
        return true;
    };
    const prepare = (item: ProductionPackage) => {
        const config = buildPackageVideoConfig(effectiveConfig, item);
        if (!prepareChannel(config)) return null;
        const readiness = workflowVideoGenerationReadiness(item, assets, config.videoProtocol);
        if (readiness.status === "blocked") {
            message.error(readiness.message);
            return null;
        }
        if (readiness.status === "warning") message.warning(readiness.message);
        return config;
    };

    const preflightChannel = async () => {
        const config = effectiveConfig;
        if (!prepareChannel(config)) return false;
        setChannelPreflighting(true);
        setChannelPreflight(null);
        try {
            const result = await preflightVideoGeneration(config);
            const endpoint = result?.endpointId ? `，端点 ${result.endpointId}` : "";
            const detail = `${result?.channelName || "企业视频通道"}已就绪，模型 ${result?.model || resolvePackageVideoModel(config)}${endpoint}`;
            setChannelPreflight({ message: detail, status: "passed" });
            message.success("企业视频通道预检通过");
            return true;
        } catch (error) {
            const detail = formatVideoGenerationError(error);
            setChannelPreflight({ message: detail, status: "failed" });
            message.error(detail);
            return false;
        } finally {
            setChannelPreflighting(false);
        }
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

    const cacheWorkflowAsset = useCallback(
        async (item: ProductionPackage, assetId: string, kind: ProjectCacheMediaKind, storageKey: string | undefined, filename: string, versionId: string) => {
            if (!token || !storageKey || !item.projectId || item.projectId === "unscoped-project" || cachingAssetIdsRef.current.has(assetId)) return;
            cachingAssetIdsRef.current.add(assetId);
            const asset = useAssetStore.getState().assets.find((entry) => entry.id === assetId);
            const metadata = asset?.metadata || {};
            const config = buildPackageVideoConfig(effectiveConfig, item);
            const context = projectCacheContextFromGeneration({
                assetId,
                category: "storyboard",
                episodeId: item.episodeId,
                episodeName: item.sourceEpisode,
                kind,
                metadata,
                model: resolvePackageVideoModel(config),
                nodeId: item.id,
                projectId: item.projectId,
                projectName: creativeProjects.find((project) => project.id === item.projectId)?.title || item.sourceProjectSlug || item.projectId,
                prompt: item.prompt,
                provider: config.videoProtocol,
                source: "episode-workflow",
                versionId,
            });
            try {
                const cached = await archiveLocalMediaToProjectCache({ id: `workflow:${assetId}`, storageKey, kind, filename, context, token });
                const current = useAssetStore.getState().assets.find((entry) => entry.id === assetId);
                updateAsset(assetId, { metadata: { ...current?.metadata, projectCache: { fileId: cached.file.id, relativePath: cached.file.relativePath, status: "ready" } } });
            } catch (error) {
                const current = useAssetStore.getState().assets.find((entry) => entry.id === assetId);
                updateAsset(assetId, { metadata: { ...current?.metadata, projectCache: { status: "pending", error: error instanceof Error ? error.message : "缓存失败" } } });
            }
        },
        [creativeProjects, effectiveConfig, token, updateAsset],
    );

    useEffect(() => {
        packages.forEach((item) => {
            const candidates = [
                { assetId: item.generation?.assetId, kind: "video" as const, versionId: item.generation?.taskId || item.generation?.updatedAt || "" },
                { assetId: item.lastFrameAssetId, kind: "image" as const, versionId: item.lastFrameVersion || "" },
            ];
            candidates.forEach(({ assetId, kind, versionId }) => {
                const asset = assets.find((entry) => entry.id === assetId && entry.kind === kind);
                if (!asset || (asset.kind !== "image" && asset.kind !== "video") || !asset.data.storageKey || projectCacheStatus(asset.metadata?.projectCache)) return;
                const filename = workflowCacheFilename(item.id, kind, asset.data.mimeType);
                void cacheWorkflowAsset(item, asset.id, kind, asset.data.storageKey, filename, versionId);
            });
        });
    }, [assets, cacheWorkflowAsset, packages]);

    const bindTailFrame = async (item: ProductionPackage, input: { lastFrameUrl?: string; videoUrl?: string }, sourceVideoVersion: string) => {
        const tail = await archiveVideoLastFrame(input);
        if (!tail) throw new Error("没有可提取的尾帧来源");
        const savedAt = new Date().toISOString();
        const tailAssetId = await addAssetOnce({ coverUrl: tail.url, data: { bytes: tail.bytes, dataUrl: tail.url, height: tail.height, mimeType: tail.mimeType, storageKey: tail.storageKey, width: tail.width }, kind: "image", metadata: { originalWorkflow: { episode: item.episodeId, kind: "scene", name: `${item.id} 尾帧连续性参考`, projectId: item.projectId, role: "continuity_reference", sourceShotId: item.id, sourceVideoVersion, version: savedAt } }, note: "上一视频的尾帧参考图；供下一连续镜头理解剧情延续，不作为首帧。", source: "workflow-video-tail-frame", tags: ["视频工作流", "尾帧连续性参考", item.episodeId, item.id], title: `${item.id} 尾帧连续性参考` });
        await cacheWorkflowAsset(item, tailAssetId, "image", tail.storageKey, workflowCacheFilename(item.id, "image", tail.mimeType), sourceVideoVersion);
        const completed = { ...item, lastFrameAssetId: tailAssetId, lastFrameVersion: savedAt };
        updatePackage(item, { lastFrameAssetId: tailAssetId, lastFrameVersion: savedAt });
        const ordered = [...packages].sort((left, right) => left.order - right.order);
        const nextShot = ordered[ordered.findIndex((entry) => entry.id === item.id) + 1];
        if (nextShot && nextShot.sceneKey === item.sceneKey && nextShot.shotDraft?.continuityMode === "continuous") {
            const reference = buildContinuityReference(completed);
            if (reference && !nextShot.continuityReference) updatePackage(nextShot, updateContinuityReference(nextShot, reference));
            else if (reference && nextShot.continuityReference && nextShot.continuityReference.version !== reference.version) updatePackage(nextShot, { continuityReference: { ...nextShot.continuityReference, updateAvailable: true } });
        }
        return tailAssetId;
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
        await cacheWorkflowAsset(item, assetId, "video", video.storageKey, workflowCacheFilename(item.id, "video", input.data.mimeType), task?.id || savedAt);
        const next: PackageGeneration = { aiTaskCredits: video.aiTask?.aiTaskCredits, aiTaskId: video.aiTask?.aiTaskId, assetId, status: "succeeded", taskId: task?.id, taskStatus: task?.rawStatus || task?.status || "succeeded", updatedAt: savedAt, video: input.data };
        const completed = { ...item, canvasStatus: "已生成" as const, generation: next, generationVersions: [...(item.generationVersions || []), next], promptStatus: "已确认" as const };
        updatePackage(item, completed);
        try { await bindTailFrame(completed, { lastFrameUrl: task?.lastFrameUrl, videoUrl: video.url }, task?.id || savedAt); }
        catch { message.warning(`${item.id} 视频已归档，但尾帧提取失败，可稍后从视频重新提取`); }
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

    const retryTailFrame = async (item: ProductionPackage) => {
        const videoUrl = item.generation?.video?.url;
        if (!videoUrl) {
            message.warning("当前分镜没有可提取尾帧的已归档视频");
            return false;
        }
        const key = scopeKey(item);
        setGenerating((current) => ({ ...current, [key]: true }));
        try {
            await bindTailFrame(item, { videoUrl }, item.generation?.taskId || item.generation?.updatedAt || new Date().toISOString());
            message.success(`${item.id} 尾帧已提取，并作为下一连续镜头的剧情延续参考`);
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "尾帧提取失败");
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

    const updateConfig = (item: ProductionPackage, patch: Partial<ProductionPackageConfig>) => {
        const config = {
            ...item.config,
            ...patch,
            ...(patch.duration ? { videoSeconds: patch.duration.match(/\d+/)?.[0] || patch.duration } : {}),
            ...(patch.ratio ? { size: patch.ratio } : {}),
            ...(patch.resolution ? { vquality: patch.resolution.match(/\d+/)?.[0] || patch.resolution } : {}),
        };
        updatePackage(item, { config, ...(patch.duration ? { duration: patch.duration } : {}) });
    };

    const configSummary = (item: ProductionPackage) => {
        const config = buildPackageVideoConfig(effectiveConfig, item);
        return {
            duration: `${config.videoSeconds || "6"}秒`,
            model: config.videoModel || config.seedanceModel || resolvePackageVideoModel(config),
            ratio: config.size || item.config.ratio,
            resolution: `${config.vquality || "720"}p`,
        };
    };

    return { batch, channelPreflight, channelPreflighting, configSummary, eligibility: eligibleBatchPackages(packages), generate, generating, preflight, preflightChannel, preflighting, retryTailFrame, scopeKey, sync, updateConfig };
}

function projectCacheStatus(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const status = (value as Record<string, unknown>).status;
    return status === "ready" || status === "pending" ? status : "";
}

function workflowCacheFilename(shotId: string, kind: "image" | "video", mimeType: string) {
    const extension = kind === "video" ? (mimeType.includes("webm") ? "webm" : "mp4") : mimeType.includes("png") ? "png" : "jpg";
    return `${shotId}-${kind === "video" ? "video" : "tail-frame"}.${extension}`;
}
