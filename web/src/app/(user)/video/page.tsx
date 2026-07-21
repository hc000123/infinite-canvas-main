"use client";

import { ChevronRight, Trash2, Video, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button } from "antd";
import { useRouter, useSearchParams } from "next/navigation";

import { runCanvasVideoGeneration } from "@/app/(user)/canvas/utils/canvas-generation-runner";
import { appendSeedanceMediaReviewDiagnostic, seedanceMediaReviewBlockingError } from "@/app/(user)/canvas/utils/canvas-volcengine-review-diagnostics";
import { cn } from "@/lib/utils";
import { fetchVideoTaskContent, preflightVideoGeneration, RecoverableVideoTaskError, refreshVideoTask, type NormalizedVideoTask } from "@/services/api/video";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useVolcengineAssetReview } from "../assets/use-volcengine-asset-review";
import { ToolMetricGrid } from "../components/tool-workbench";
import { buildAssetVersionedUpdatePatch } from "../assets/asset-version-history";
import { buildWorkflowUploadedImagePatch } from "../assets/workflow-asset-image";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { formatVideoGenerationError } from "./video-generation-errors";
import {
    alignWorkflowPromptReferencesForSeedance,
    enterpriseVideoChannelReadiness,
    resolveWorkflowReferenceAssetForName,
    resolveWorkflowReferenceAssets,
    resolveWorkflowReferenceImages,
    workflowVideoGenerationReadiness,
} from "./video-package-builders";
import { useVideoPackageStore, type PackageGeneration, type PackageGenerationStatus, type ProductionPackage } from "./use-video-package-store";
import { VideoNodeDetailDrawer, VideoPromptNodeCard } from "./video-page-components";
import { initialPackages, videoFilters } from "./video-page-data";
import type { FilterKey, PackageAssetSlot, PackageConfigPatch, PackageUploadedVideo, VideoPreflightState } from "./video-page-types";
import {
    aiTaskLedgerFromVideoTask,
    buildPackageAssetGeneration,
    buildPackageVideoConfig,
    buildReferenceUploadPackagePatch,
    buildWorkflowReferenceImageAssetInput,
    canvasHref,
    generationFromTask,
    generationStatusLabel,
    matchFilter,
    mergeVideoPackagesIntoCanvasNodes,
    originalWorkflowHref,
    readGenerationList,
    readGenerationVersions,
    readWorkflowPackageId,
    readWorkflowSourceEpisode,
    referenceSlotUploadKey,
    resolvePackageVideoModel,
    uniqueAssets,
    videoWorkflowCanvasKey,
    videoWorkflowEpisodeLabel,
} from "./video-page-utils";

export default function VideoPage() {
    const { message, modal } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const hasLoadedPublicSettings = useConfigStore((state) => state.hasLoadedPublicSettings);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const token = useUserStore((state) => state.token);
    const volcengineAssetEnabled = useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const libraryAssets = useAssetStore((state) => state.assets);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const importedPackages = useVideoPackageStore((state) => state.importedPackages);
    const updateImportedPackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const clearImportedPackages = useVideoPackageStore((state) => state.clearImportedPackages);
    const canvases = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const flushCanvases = useCanvasStore((state) => state.flushProjects);
    const updateCanvas = useCanvasStore((state) => state.updateProject);
    const attachCanvas = useCreativeProjectStore((state) => state.attachCanvas);
    const ensureUnfiledProject = useCreativeProjectStore((state) => state.ensureUnfiledProject);
    const sourceProjects = useCreativeProjectStore((state) => state.projects);
    const sourceEpisodes = useScriptStore((state) => state.episodes);
    const [demoPackages, setDemoPackages] = useState(initialPackages);
    const [, setReviewPreviewAsset] = useState<Asset | null>(null);
    const [selectedId, setSelectedId] = useState(initialPackages[1].id);
    const [filter, setFilter] = useState<FilterKey>("all");
    const [generatingIds, setGeneratingIds] = useState<Record<string, boolean>>({});
    const [preflightState, setPreflightState] = useState<VideoPreflightState | null>(null);
    const [isPreflightChecking, setIsPreflightChecking] = useState(false);
    const [detailPackageId, setDetailPackageId] = useState("");
    const [uploadingReferenceKey, setUploadingReferenceKey] = useState("");

    const targetEpisode = searchParams.get("episode") || "";
    const targetProjectSlug = searchParams.get("projectSlug") || "";
    const sourceProjectId = searchParams.get("sourceProjectId") || "";
    const sourceEpisodeId = searchParams.get("sourceEpisodeId") || "";
    useEffect(() => {
        if (!sourceProjectId || !sourceEpisodeId) return;
        const shot = searchParams.get("shot") || "";
        router.replace(`/projects/${encodeURIComponent(sourceProjectId)}/episodes/${encodeURIComponent(sourceEpisodeId)}/workflow?stage=video${shot ? `&shot=${encodeURIComponent(shot)}` : ""}`);
    }, [router, searchParams, sourceEpisodeId, sourceProjectId]);
    const scopedImportedPackages = useMemo(
        () =>
            sourceProjectId && sourceEpisodeId
                ? importedPackages.filter((item) => item.projectId === sourceProjectId && item.episodeId === sourceEpisodeId)
                : targetEpisode
                  ? importedPackages.filter((item) => item.sourceEpisode === targetEpisode)
                  : importedPackages,
        [importedPackages, sourceEpisodeId, sourceProjectId, targetEpisode],
    );
    const hasImportedPackages = scopedImportedPackages.length > 0;
    const packages = useMemo(() => (hasImportedPackages ? [...scopedImportedPackages] : targetEpisode ? [] : [...demoPackages]), [demoPackages, hasImportedPackages, scopedImportedPackages, targetEpisode]);
    const selected = packages.find((item) => item.id === selectedId) || packages[0];
    const detailPackage = packages.find((item) => item.id === detailPackageId) || null;
    const sourceProjectSlug = (hasImportedPackages ? packages[0]?.sourceProjectSlug : "") || targetProjectSlug;
    const sourceProject = sourceProjectId ? sourceProjects.find((item) => item.id === sourceProjectId) : undefined;
    const sourceEpisode = sourceEpisodeId ? sourceEpisodes.find((item) => item.id === sourceEpisodeId) : undefined;
    const readableSourceLabel = sourceProject || sourceEpisode ? `${sourceProject?.title || "未命名项目"} / ${sourceEpisode ? `第 ${String(sourceEpisode.order || 1).padStart(2, "0")} 集 · ${sourceEpisode.title}` : "未绑定分集"}` : "";
    const visiblePackages = useMemo(() => packages.filter((item) => matchFilter(item, filter)), [packages, filter]);
    const workflowReferenceAssets = useMemo(
        () => uniqueAssets(packages.flatMap((item) => resolveWorkflowReferenceAssets(item, libraryAssets))).filter((asset) => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"),
        [libraryAssets, packages],
    );
    const sourceLabel = hasImportedPackages ? `视频工作流导入 / ${readableSourceLabel || packages[0]?.sourceEpisode || "未标注集数"}` : targetEpisode ? `视频工作流导入 / ${readableSourceLabel || targetEpisode}` : "霓虹之下 / 第 05 集 / 真相浮出";
    const workflowCanvasKey = videoWorkflowCanvasKey(packages, targetEpisode);
    const workflowCanvas = useMemo(() => (workflowCanvasKey ? canvases.find((canvas) => canvas.episodeId === workflowCanvasKey) : undefined), [canvases, workflowCanvasKey]);
    const confirmedCount = packages.filter((item) => item.promptStatus === "已确认").length;
    const generatedCount = packages.filter((item) => item.canvasStatus === "已生成" || item.generation?.status === "succeeded").length;
    const missingCount = packages.filter((item) => item.assetStatus !== "完整").length;
    const reviewCount = packages.filter((item) => item.promptStatus === "待审核").length;
    const isPublicSettingsPending = isPublicSettingsLoading || !hasLoadedPublicSettings;
    const workflowControlHref = targetEpisode ? originalWorkflowHref(targetEpisode, { projectSlug: sourceProjectSlug, sourceEpisodeId, sourceProjectId }) : "/original-workflow";

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (!packages.length) return;
        if (!packages.some((item) => item.id === selectedId)) setSelectedId(packages[0].id);
    }, [packages, selectedId]);
    const { refreshImageReview, refreshingReviewId, submitImageReview, submittingReviewId } = useVolcengineAssetReview({
        message,
        selectedVolcengineRefreshAssets: [],
        selectedVolcengineSubmitAssets: [],
        setPreviewAsset: setReviewPreviewAsset,
        token,
        updateAsset,
        validAssets: workflowReferenceAssets,
        volcengineAssetEnabled,
    });

    if (!selected) {
        return (
            <main className="studio-workspace studio-shell h-full overflow-hidden text-[var(--studio-text-primary)]">
                <div className="mx-auto flex h-full w-full max-w-[1540px] flex-col gap-4 px-5 py-4 xl:px-8">
                    <section className="shrink-0 border-b border-[var(--studio-border-subtle)] pb-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--studio-text-muted)]">
                                    <span className="font-medium text-[var(--studio-accent)]">AI · 画布</span>
                                    <ChevronRight className="size-3.5" />
                                    <span>{sourceLabel}</span>
                                </div>
                                <h1 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)] sm:text-3xl">视频节点生产台</h1>
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                                <Button icon={<Workflow className="size-4" />} href={workflowControlHref}>
                                    视频工作流控制台
                                </Button>
                            </div>
                        </div>
                    </section>
                    <section className="grid min-h-[520px] place-items-center rounded-lg border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-6 py-16 text-center">
                        <div>
                            <Video className="mx-auto mb-4 size-9 text-[var(--studio-text-muted)]" />
                            <h2 className="text-xl font-semibold text-[var(--studio-text-primary)]">这一集还没有视频生产包</h2>
                            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--studio-text-secondary)]">请先回到视频工作流，完成 Stage 3 质量门并同步 Copy-only 到视频生成界面。</p>
                            <Button className="mt-5" href={workflowControlHref} type="primary">
                                返回视频工作流
                            </Button>
                        </div>
                    </section>
                </div>
            </main>
        );
    }

    const updatePackage = (target: ProductionPackage, patch: Partial<ProductionPackage>) => {
        if (hasImportedPackages) updateImportedPackage(target, patch);
        else setDemoPackages((items) => items.map((item) => (item.id === target.id ? { ...item, ...patch } : item)));
    };
    const updatePackageConfig = (item: ProductionPackage, patch: PackageConfigPatch) => {
        updatePackage(item, { config: { ...item.config, ...patch } });
    };
    const uploadReferenceImage = async (item: ProductionPackage, slot: PackageAssetSlot, file: File) => {
        if (!file.type.startsWith("image/")) {
            message.warning("请选择图片文件");
            return;
        }
        const uploadKey = referenceSlotUploadKey(item.id, slot.name);
        setUploadingReferenceKey(uploadKey);
        try {
            const image = await uploadImage(file);
            const current = resolveWorkflowReferenceAssetForName(item, slot.name, libraryAssets);
            if (current && (current.kind === "image" || current.kind === "text")) {
                updateAsset(current.id, buildWorkflowUploadedImagePatch(current, image, { fileName: file.name }));
            } else {
                await addAssetOnce(
                    buildWorkflowReferenceImageAssetInput({
                        episode: targetEpisode,
                        fileName: file.name,
                        image,
                        item,
                        projectSlug: sourceProjectSlug,
                        slot,
                        sourceEpisodeId,
                        sourceProjectId,
                    }),
                    { blob: file },
                );
            }
            updatePackage(item, buildReferenceUploadPackagePatch(item, slot, libraryAssets));
            message.success(`${slot.name} 已上传并绑定`);
        } catch (error) {
            console.error(error);
            message.error("上传匹配失败，请换一张图片重试");
        } finally {
            setUploadingReferenceKey("");
        }
    };
    const requireEnterpriseVideoChannel = (config: AiConfig, targetId?: string) => {
        const readiness = enterpriseVideoChannelReadiness({ isPublicSettingsLoading: isPublicSettingsPending, videoProtocol: config.videoProtocol });
        if (readiness.status === "ready") return true;
        if (readiness.status === "checking") message.info(readiness.message);
        else {
            if (targetId) setPreflightState({ checkedAt: new Date().toISOString(), message: readiness.message, status: "failed", targetId });
            message.error(readiness.message);
        }
        return false;
    };
    const checkVideoChannel = async (item: ProductionPackage) => {
        const config = buildPackageVideoConfig(effectiveConfig, item);
        const model = resolvePackageVideoModel(config);
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            message.warning("请先完成视频模型配置");
            return;
        }
        if (!requireEnterpriseVideoChannel(config, item.id)) return;
        setIsPreflightChecking(true);
        setPreflightState(null);
        try {
            const result = await preflightVideoGeneration(config);
            const channel = result?.channelName || "企业 Ark / Seedance";
            const resultModel = result?.model || model;
            const endpoint = result?.endpointId ? `，EP ${result.endpointId}` : "";
            setPreflightState({ checkedAt: new Date().toISOString(), message: `${channel} 已通过预检，模型 ${resultModel}${endpoint} 可用于提交视频任务。`, status: "passed", targetId: item.id });
            message.success("企业视频通道预检通过");
        } catch (error) {
            const errorMessage = formatVideoGenerationError(error);
            setPreflightState({ checkedAt: new Date().toISOString(), message: errorMessage, status: "failed", targetId: item.id });
            message.error(errorMessage);
        } finally {
            setIsPreflightChecking(false);
        }
    };
    const confirmPackage = (item: ProductionPackage) => {
        updatePackage(item, { promptStatus: "已确认" });
        message.success(`${item.id} 已确认，可生成视频`);
    };
    const importPackagesToCanvas = (items: ProductionPackage[]) => {
        const sourceEpisode = videoWorkflowEpisodeLabel(items, targetEpisode);
        const canvasTitle = `视频工作流 ${sourceEpisode} 生产画布`;
        const projectId = items.find((item) => item.sourceProjectId)?.sourceProjectId || sourceProjectId || ensureUnfiledProject();
        const canvasId =
            workflowCanvas?.id ||
            createCanvas(canvasTitle, undefined, {
                projectId,
                episodeContext: {
                    episodeId: workflowCanvasKey,
                    episodeTitle: sourceEpisode,
                    scriptId: "video-workflow",
                    scriptSnapshot: items.map((item) => `${item.id} ${item.segment}`).join("\n"),
                },
            });
        attachCanvas(projectId, canvasId);
        const currentCanvas = canvases.find((canvas) => canvas.id === canvasId) || workflowCanvas;
        const { focusNodeId, nodes } = mergeVideoPackagesIntoCanvasNodes(currentCanvas?.nodes || [], items, effectiveConfig);
        updateCanvas(canvasId, {
            projectId,
            nodes,
            scriptSnapshot: packages.map((item) => `${item.id} ${item.segment}`).join("\n"),
        });
        void flushCanvases();
        return { canvasId, count: items.length, nodeId: focusNodeId, title: canvasTitle };
    };
    const openCanvasImportResult = (result: { canvasId: string; count: number; nodeId?: string; title: string }, text: string) => {
        message.success(text);
        window.location.assign(canvasHref(result.canvasId, result.nodeId));
    };
    const importPackage = (item: ProductionPackage) => {
        if (item.promptStatus !== "已确认") {
            message.warning("请先确认提示词，再导入画布");
            return;
        }
        const result = importPackagesToCanvas([item]);
        updatePackage(item, { canvasStatus: "已导入" });
        openCanvasImportResult(result, `${item.id} 已导入画布，正在进入`);
    };
    const savePackageVideoResult = async (item: ProductionPackage, config: AiConfig, video: PackageUploadedVideo, finalTask: NormalizedVideoTask | null) => {
        const existingAsset = libraryAssets.find((asset) => asset.kind === "video" && readWorkflowPackageId(asset) === item.id && readWorkflowSourceEpisode(asset) === (item.sourceEpisode || ""));
        const savedAt = new Date().toISOString();
        const generation = buildPackageAssetGeneration(item, config, video, finalTask, savedAt);
        const assetInput = {
            coverUrl: "",
            data: {
                bytes: video.bytes,
                height: video.height || 720,
                mimeType: video.mimeType || "video/mp4",
                storageKey: video.storageKey,
                url: video.url,
                width: video.width || 1280,
            },
            kind: "video",
            metadata: {
                aiTask: video.aiTask,
                generation,
                originalWorkflow: {
                    packageId: item.id,
                    source: item.source,
                    sourceEpisode: item.sourceEpisode,
                },
                videoGeneration: {
                    model: config.model,
                    protocol: config.videoProtocol,
                    size: config.size,
                    seconds: config.videoSeconds,
                },
            },
            note: item.prompt,
            source: "original-workflow-video",
            tags: ["视频工作流", "视频生成", item.sourceEpisode || ""].filter(Boolean),
            title: `${item.id} ${item.segment}`.trim(),
        } as const;
        let assetId = existingAsset?.id || "";
        if (existingAsset) {
            updateAsset(
                existingAsset.id,
                buildAssetVersionedUpdatePatch(
                    existingAsset,
                    {
                        ...assetInput,
                        metadata: {
                            ...existingAsset.metadata,
                            ...assetInput.metadata,
                            generations: [...readGenerationList(existingAsset.metadata?.generations), generation],
                            generationVersions: [...readGenerationVersions(existingAsset), video.aiTask].filter(Boolean),
                        },
                    },
                    savedAt,
                    `${item.id} 视频重新生成`,
                ),
            );
        } else {
            assetId = await addAssetOnce(assetInput);
        }
        const nextGeneration: PackageGeneration = {
            aiTaskCredits: video.aiTask?.aiTaskCredits,
            aiTaskId: video.aiTask?.aiTaskId,
            assetId,
            status: "succeeded",
            taskId: finalTask?.id,
            taskStatus: finalTask?.status || "succeeded",
            updatedAt: savedAt,
            video: {
                bytes: video.bytes,
                height: video.height || 720,
                mimeType: video.mimeType || "video/mp4",
                storageKey: video.storageKey,
                url: video.url,
                width: video.width || 1280,
            },
        };
        updatePackage(item, {
            canvasStatus: "已生成",
            generation: nextGeneration,
            generationVersions: [...(item.generationVersions || []), nextGeneration],
            promptStatus: "已确认",
        });
    };
    const generatePackageVideo = async (item: ProductionPackage, options: { skipPreflight?: boolean } = {}) => {
        if (!item.prompt.trim()) {
            message.warning("当前生产包没有视频提示词");
            return;
        }
        const config = buildPackageVideoConfig(effectiveConfig, item);
        const model = resolvePackageVideoModel(config);
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            message.warning("请先完成视频模型配置");
            return;
        }
        if (!requireEnterpriseVideoChannel(config, item.id)) return;
        setGeneratingIds((current) => ({ ...current, [item.id]: true }));
        updatePackage(item, {
            generation: {
                ...item.generation,
                status: "checking",
                taskStatus: "preflight",
                updatedAt: new Date().toISOString(),
            },
            promptStatus: "已确认",
        });
        try {
            const readiness = workflowVideoGenerationReadiness(item, libraryAssets, config.videoProtocol);
            if (readiness.status === "blocked") throw new Error(readiness.message);
            if (readiness.status === "warning") message.warning(readiness.message);
            if (!options.skipPreflight) await preflightVideoGeneration(config);
            updatePackage(item, {
                generation: {
                    ...item.generation,
                    status: "creating",
                    taskStatus: "creating",
                    updatedAt: new Date().toISOString(),
                },
            });
            const referenceImages = resolveWorkflowReferenceImages(item, libraryAssets);
            const reviewBlockingError = config.videoProtocol === "volcengine-ark" ? seedanceMediaReviewBlockingError(referenceImages, []) : "";
            if (reviewBlockingError) throw new Error(reviewBlockingError);
            const prompt = config.videoProtocol === "volcengine-ark" ? alignWorkflowPromptReferencesForSeedance(item.prompt, referenceImages) : item.prompt;
            const { completedTask, video } = await runCanvasVideoGeneration(config, prompt, referenceImages, (task) => {
                updatePackage(item, { generation: generationFromTask(task) });
            });
            await savePackageVideoResult(item, config, video, completedTask as NormalizedVideoTask | null);
            message.success(`${item.id} 视频已生成，并写入我的素材`);
        } catch (error) {
            const referenceImages = resolveWorkflowReferenceImages(item, libraryAssets);
            const errorMessage = appendSeedanceMediaReviewDiagnostic(formatVideoGenerationError(error), referenceImages, []);
            if (error instanceof RecoverableVideoTaskError) {
                updatePackage(item, {
                    generation: {
                        ...generationFromTask(error.task),
                        errorMessage,
                        status: error.task.status === "succeeded" ? "running" : error.task.status,
                        taskStatus: error.task.rawStatus || error.task.status,
                    },
                });
                message.warning("视频任务已创建，已保留任务 ID，可稍后同步任务结果");
                return;
            }
            updatePackage(item, {
                generation: {
                    ...item.generation,
                    errorMessage,
                    status: "failed",
                    updatedAt: new Date().toISOString(),
                },
            });
            message.error(errorMessage);
        } finally {
            setGeneratingIds((current) => ({ ...current, [item.id]: false }));
        }
    };
    const syncPackageVideo = async (item: ProductionPackage) => {
        const taskId = item.generation?.taskId;
        if (!taskId) {
            message.warning("当前生产包没有可同步的视频任务 ID");
            return;
        }
        const config = buildPackageVideoConfig(effectiveConfig, item);
        if (!requireEnterpriseVideoChannel(config, item.id)) return;
        setGeneratingIds((current) => ({ ...current, [item.id]: true }));
        updatePackage(item, {
            generation: {
                ...item.generation,
                status: "running",
                taskStatus: "syncing",
                updatedAt: new Date().toISOString(),
            },
        });
        try {
            const latestTask = await refreshVideoTask(config, taskId);
            updatePackage(item, { generation: generationFromTask(latestTask) });
            if (latestTask.status !== "succeeded") {
                message.info(`${item.id} 当前任务状态：${generationStatusLabel(latestTask.status as PackageGenerationStatus)}`);
                return;
            }
            const blob = await fetchVideoTaskContent(config, latestTask);
            const video = await uploadMediaFile(blob, "video");
            await savePackageVideoResult(item, config, { ...video, aiTask: aiTaskLedgerFromVideoTask(latestTask) }, latestTask);
            message.success(`${item.id} 视频已同步，并写入我的素材`);
        } catch (error) {
            const errorMessage = formatVideoGenerationError(error);
            updatePackage(item, {
                generation: {
                    ...item.generation,
                    errorMessage,
                    status: "failed",
                    updatedAt: new Date().toISOString(),
                },
            });
            message.error(errorMessage);
        } finally {
            setGeneratingIds((current) => ({ ...current, [item.id]: false }));
        }
    };
    const generateConfirmedPackages = async () => {
        const readyItems = packages.filter((item) => item.promptStatus === "已确认" && item.generation?.status !== "succeeded" && item.prompt.trim());
        if (!readyItems.length) {
            message.info("暂无需要生成的已确认生产包");
            return;
        }
        const batchConfig = buildPackageVideoConfig(effectiveConfig, readyItems[0]);
        const model = resolvePackageVideoModel(batchConfig);
        if (!isAiConfigReady(batchConfig, model)) {
            openConfigDialog(true);
            message.warning("请先完成视频模型配置");
            return;
        }
        if (!requireEnterpriseVideoChannel(batchConfig, readyItems[0].id)) return;
        const checkingAt = new Date().toISOString();
        readyItems.forEach((item) =>
            updatePackage(item, {
                generation: {
                    ...item.generation,
                    status: "checking",
                    taskStatus: "preflight",
                    updatedAt: checkingAt,
                },
            }),
        );
        try {
            await preflightVideoGeneration(batchConfig);
        } catch (error) {
            const errorMessage = formatVideoGenerationError(error);
            const failedAt = new Date().toISOString();
            readyItems.forEach((item) =>
                updatePackage(item, {
                    generation: {
                        ...item.generation,
                        errorMessage,
                        status: "failed",
                        taskStatus: "preflight_failed",
                        updatedAt: failedAt,
                    },
                }),
            );
            message.error(errorMessage);
            return;
        }
        for (const item of readyItems) {
            await generatePackageVideo(item, { skipPreflight: true });
        }
    };
    const confirmClearImportedPackages = () => {
        modal.confirm({
            title: "清空导入的视频生产包？",
            content: "这只会移除当前本地导入的视频生产包列表，不会删除已归档素材、画布节点、生成任务或扣费记录。",
            okText: "清空导入",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: clearImportedPackages,
        });
    };

    return (
        <main className="studio-workspace studio-shell h-full overflow-hidden text-[var(--studio-text-primary)]">
            <div className="mx-auto flex h-full w-full max-w-[1540px] flex-col gap-4 px-5 py-4 xl:px-8">
                <section className="studio-page-header shrink-0 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--studio-text-muted)]">
                                <span className="font-medium text-[var(--studio-accent)]">AI · 画布</span>
                                <ChevronRight className="size-3.5" />
                                <span>{sourceLabel}</span>
                            </div>
                            <h1 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)] sm:text-3xl">视频节点生产台</h1>
                            <p className="mt-3 text-sm leading-6 text-[var(--studio-text-secondary)]">按集推进：先补资产，再逐条检查提示词并生成。</p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                            <Button icon={<Workflow className="size-4" />} href={workflowControlHref}>
                                视频工作流控制台
                            </Button>
                            <Button type="primary" icon={<Video className="size-4" />} onClick={generateConfirmedPackages}>
                                生成已确认项
                            </Button>
                            {hasImportedPackages ? (
                                <Button danger icon={<Trash2 className="size-4" />} onClick={confirmClearImportedPackages}>
                                    清空导入
                                </Button>
                            ) : null}
                        </div>
                    </div>
                    <ToolMetricGrid
                        cardClassName="px-3 py-2"
                        className="mt-4 sm:grid-cols-2 xl:grid-cols-4"
                        items={[
                            { label: "已确认", value: confirmedCount },
                            { label: "已生成", value: generatedCount },
                            { label: "缺参考", value: missingCount },
                            { label: "待审核", value: reviewCount },
                        ]}
                    />
                </section>

                <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                    <div className="studio-toolbar flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                            {videoFilters.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={cn(
                                        "h-8 rounded-md border px-3 text-sm transition",
                                        filter === item.key
                                            ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] text-[var(--studio-text-primary)] shadow-[inset_0_-2px_0_var(--studio-accent)]"
                                            : "border-transparent text-[var(--studio-text-secondary)] hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]",
                                    )}
                                    onClick={() => setFilter(item.key)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <div className="text-sm text-[var(--studio-text-muted)]">{visiblePackages.length} 条视频节点</div>
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="grid gap-3 pb-8">
                            {visiblePackages.map((item) => (
                                <VideoPromptNodeCard
                                    key={item.id}
                                    assets={libraryAssets}
                                    config={effectiveConfig}
                                    item={item}
                                    loading={Boolean(generatingIds[item.id])}
                                    preflight={preflightState?.targetId === item.id ? preflightState : null}
                                    selected={selectedId === item.id}
                                    videoProtocol={effectiveConfig.videoProtocol}
                                    onConfigChange={(patch) => updatePackageConfig(item, patch)}
                                    onConfirm={() => confirmPackage(item)}
                                    onGenerate={() => void generatePackageVideo(item)}
                                    onImportCanvas={() => importPackage(item)}
                                    onOpenDetail={() => setDetailPackageId(item.id)}
                                    onOpenConfig={() => openConfigDialog(true)}
                                    onPreflight={() => void checkVideoChannel(item)}
                                    onPromptChange={(prompt) => updatePackage(item, { prompt })}
                                    onRefreshReview={refreshImageReview}
                                    onSelect={() => setSelectedId(item.id)}
                                    onSubmitReview={submitImageReview}
                                    onUploadReferenceImage={uploadReferenceImage}
                                    onSync={() => void syncPackageVideo(item)}
                                    preflightLoading={isPreflightChecking || isPublicSettingsPending}
                                    refreshingReviewId={refreshingReviewId}
                                    submittingReviewId={submittingReviewId}
                                    uploadingReferenceKey={uploadingReferenceKey}
                                />
                            ))}
                            {!visiblePackages.length ? <div className="rounded-lg border border-dashed border-[var(--studio-border-subtle)] px-4 py-16 text-center text-sm text-[var(--studio-text-muted)]">没有匹配的生产包</div> : null}
                        </div>
                    </div>
                </section>
                <VideoNodeDetailDrawer
                    assets={libraryAssets}
                    config={effectiveConfig}
                    item={detailPackage}
                    loading={Boolean(detailPackage && generatingIds[detailPackage.id])}
                    open={Boolean(detailPackage)}
                    preflight={detailPackage && preflightState?.targetId === detailPackage.id ? preflightState : null}
                    preflightLoading={isPreflightChecking || isPublicSettingsPending}
                    refreshingReviewId={refreshingReviewId}
                    submittingReviewId={submittingReviewId}
                    videoProtocol={effectiveConfig.videoProtocol}
                    onClose={() => setDetailPackageId("")}
                    onGenerate={(item) => void generatePackageVideo(item)}
                    onOpenConfig={() => openConfigDialog(true)}
                    onPreflight={(item) => void checkVideoChannel(item)}
                    onRefreshReview={refreshImageReview}
                    onSubmitReview={submitImageReview}
                    onSync={(item) => void syncPackageVideo(item)}
                />
            </div>
        </main>
    );
}
