"use client";

import { Check, ChevronRight, Download, Eye, Link2, LoaderCircle, Play, RefreshCw, RotateCcw, SendToBack, Settings2, ShieldCheck, Trash2, TriangleAlert, Upload, Video, Workflow } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { App, Button, Collapse, Drawer, Input, Tag } from "antd";
import { useSearchParams } from "next/navigation";

import { ModelPicker } from "@/components/model-picker";
import { videoRatioLabel, videoResolutionLabel, videoSecondsLabel } from "@/components/video-settings-panel";
import { runCanvasVideoGeneration } from "@/app/(user)/canvas/utils/canvas-generation-runner";
import { appendSeedanceMediaReviewDiagnostic, seedanceMediaReviewBlockingError } from "@/app/(user)/canvas/utils/canvas-volcengine-review-diagnostics";
import { buildCanvasVideoConfig } from "@/app/(user)/canvas/utils/canvas-video-config";
import { cn } from "@/lib/utils";
import type { AiTaskLedger } from "@/services/api/ai-task-trace";
import { fetchVideoTaskContent, preflightVideoGeneration, RecoverableVideoTaskError, refreshVideoTask, type NormalizedVideoTask } from "@/services/api/video";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { canSubmitVolcengineReview } from "@/services/volcengine-asset-metadata";
import { useAssetStore, type Asset, type AssetWriteInput } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useVolcengineAssetReview } from "../assets/use-volcengine-asset-review";
import { buildAssetVersionedUpdatePatch } from "../assets/asset-version-history";
import { buildWorkflowUploadedImagePatch } from "../assets/workflow-asset-image";
import { NODE_DEFAULT_SIZE } from "../canvas/constants";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../canvas/types";
import { CanvasVideoSettingsPopover } from "../canvas/components/canvas-video-settings-popover";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { formatVideoGenerationError, isVideoChannelAuthError, isVideoChannelUpstreamError, normalizeVideoGenerationErrorMessage, sanitizeVideoGenerationErrorMessage } from "./video-generation-errors";
import {
    alignWorkflowPromptReferencesForSeedance,
    enterpriseVideoChannelReadiness,
    isWorkflowReferenceAssetBound,
    resolveWorkflowReferenceAssetForName,
    resolveWorkflowReferenceAssets,
    resolveWorkflowReferenceImages,
    workflowReferenceBindingSummary,
    workflowVideoGenerationReadiness,
} from "./video-package-builders";
import { useVideoPackageStore, type AssetStatus, type CanvasStatus, type PackageGeneration, type PackageGenerationStatus, type ProductionPackage, type ProductionPackageConfig, type PromptStatus, type WorkflowVideoReference } from "./use-video-package-store";

type FilterKey = "all" | "review" | "missing" | "ready" | "imported" | "generated";
type PackageUploadedVideo = UploadedFile & { aiTask?: AiTaskLedger };
type VideoPreflightState = { checkedAt: string; message: string; status: "failed" | "passed"; targetId: string };
type PackageConfigPatch = Partial<ProductionPackageConfig>;
type PackageAssetSlot = ProductionPackage["assets"][number];

const initialPackages: ProductionPackage[] = [
    {
        id: "P01",
        segment: "雨夜天桥，女主发现遗落的加密芯片",
        duration: "8s",
        promptStatus: "已确认",
        assetStatus: "完整",
        canvasStatus: "已导入",
        prompt: "雨夜霓虹天桥，女主低头捡起一枚微弱发光的加密芯片，镜头从湿漉漉的地面低角度推近到她警觉的侧脸，远处警灯反射在玻璃幕墙上，节奏克制、悬疑。",
        tags: { 运镜: "低角度推近，结尾轻微上摇", 主体动作: "拾起芯片后迅速环顾四周", 环境: "雨夜天桥、霓虹反射、远处警灯", 光影: "青蓝主光，红色警灯扫过", 节奏: "前慢后紧，8 秒内完成发现动作" },
        assets: [
            { kind: "角色图", name: "林夏·雨衣造型", status: "已绑定" },
            { kind: "场景图", name: "天桥夜景", status: "已绑定" },
            { kind: "道具图", name: "加密芯片", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P00 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "8s", resolution: "1080p", motion: "中", frames: "使用首尾帧" },
        risks: [{ level: "提示", text: "镜头动作清晰，可直接进入画布生成节点。" }],
    },
    {
        id: "P02",
        segment: "地下停车场，追踪者从柱后现身",
        duration: "12s",
        promptStatus: "待审核",
        assetStatus: "缺角色图",
        canvasStatus: "未导入",
        prompt: "地下停车场冷白灯闪烁，追踪者从水泥柱后缓慢现身，主角背对镜头察觉异常后停步，镜头横移穿过车辆缝隙，制造被窥视感，最后定格在追踪者手中的旧式通讯器。",
        tags: { 运镜: "横移穿车缝，末尾定格", 主体动作: "追踪者现身，主角停步回头", 环境: "地下停车场、车辆阴影、水泥柱", 光影: "冷白灯闪烁，局部暗区", 节奏: "中速推进，末尾悬停" },
        assets: [
            { kind: "角色图", name: "追踪者制服设定", status: "缺失" },
            { kind: "场景图", name: "地下停车场", status: "已绑定" },
            { kind: "道具图", name: "旧式通讯器", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P01 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "12s", resolution: "1080p", motion: "中高", frames: "使用首尾帧" },
        risks: [
            { level: "注意", text: "缺少追踪者角色图，导入画布前建议绑定角色参考。" },
            { level: "提示", text: "12 秒内动作数量可控，但末尾定格需避免与下一包衔接断裂。" },
        ],
    },
    {
        id: "P03",
        segment: "监控室，屏幕显示关键证据被远程删除",
        duration: "15s",
        promptStatus: "需修改",
        assetStatus: "缺场景图",
        canvasStatus: "未导入",
        prompt: "监控室内多块屏幕同时闪烁，技术员快速切换窗口试图恢复证据，主角冲进画面质问，屏幕上的文件夹逐个变红并消失，镜头环绕两人和屏幕形成紧张压迫。",
        tags: { 运镜: "半环绕加快速切屏", 主体动作: "技术员操作、主角冲入、文件消失", 环境: "监控室、多屏幕、数据面板", 光影: "屏幕蓝绿光为主，红色警示闪烁", 节奏: "信息量偏高，需压缩动作" },
        assets: [
            { kind: "角色图", name: "技术员", status: "已绑定" },
            { kind: "场景图", name: "监控室", status: "缺失" },
            { kind: "道具图", name: "证据文件 UI", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P02 尾帧", status: "缺失" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "15s", resolution: "1080p", motion: "高", frames: "仅首帧" },
        risks: [
            { level: "阻断", text: "动作过多且 15 秒达到上限，建议拆成技术员恢复证据和主角冲入两个生产包。" },
            { level: "注意", text: "缺少监控室场景图和上一镜尾帧，镜头衔接不明确。" },
        ],
    },
    {
        id: "P04",
        segment: "街边便利店外，线人交出备份密钥",
        duration: "8s",
        promptStatus: "待审核",
        assetStatus: "完整",
        canvasStatus: "未导入",
        prompt: "便利店招牌的红绿灯光照在雨棚下，线人把备份密钥塞进主角掌心后迅速离开，镜头跟随手部特写再切到主角抬眼，背景车流形成拖影。",
        tags: { 运镜: "手部特写跟随，轻切抬眼", 主体动作: "线人交付密钥后离开", 环境: "便利店雨棚、街边车流", 光影: "红绿招牌光与湿地反射", 节奏: "短促直接，留出情绪停顿" },
        assets: [
            { kind: "角色图", name: "线人", status: "已绑定" },
            { kind: "场景图", name: "便利店街边", status: "已绑定" },
            { kind: "道具图", name: "备份密钥", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P03 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Lite", ratio: "16:9", duration: "8s", resolution: "720p", motion: "中", frames: "使用首尾帧" },
        risks: [{ level: "提示", text: "提示词聚焦单一动作，适合确认后导入画布。" }],
    },
    {
        id: "P05",
        segment: "楼顶对峙，反派说出真相",
        duration: "12s",
        promptStatus: "已确认",
        assetStatus: "完整",
        canvasStatus: "已生成",
        prompt: "城市楼顶强风中，反派站在霓虹广告牌下说出真相，主角向前一步停住，镜头从两人之间的空隙缓慢推进，远处城市灯海压低，情绪冷峻。",
        tags: { 运镜: "双人间隙慢推", 主体动作: "反派陈述，主角克制逼近", 环境: "城市楼顶、霓虹广告牌", 光影: "背光轮廓，冷色城市灯海", 节奏: "慢速压迫，适合台词段" },
        assets: [
            { kind: "角色图", name: "反派楼顶造型", status: "已绑定" },
            { kind: "场景图", name: "城市楼顶", status: "已绑定" },
            { kind: "道具图", name: "广告牌", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P04 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "12s", resolution: "1080p", motion: "低", frames: "使用首尾帧" },
        risks: [{ level: "提示", text: "已在画布生成视频版本，后续版本选择请到画布完成。" }],
    },
];

const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "review", label: "待审核" },
    { key: "missing", label: "缺参考" },
    { key: "ready", label: "已确认" },
    { key: "imported", label: "已导入画布" },
    { key: "generated", label: "已生成" },
];

export default function VideoPage() {
    const { message, modal } = App.useApp();
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
    const scopedImportedPackages = useMemo(() => (targetEpisode ? importedPackages.filter((item) => item.sourceEpisode === targetEpisode) : importedPackages), [importedPackages, targetEpisode]);
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

    const updatePackage = (id: string, patch: Partial<ProductionPackage>) => {
        if (hasImportedPackages) updateImportedPackage(id, patch);
        else setDemoPackages((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };
    const updatePackageConfig = (item: ProductionPackage, patch: PackageConfigPatch) => {
        updatePackage(item.id, { config: { ...item.config, ...patch } });
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
            updatePackage(item.id, buildReferenceUploadPackagePatch(item, slot, libraryAssets));
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
        updatePackage(item.id, { promptStatus: "已确认" });
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
        updatePackage(item.id, { canvasStatus: "已导入" });
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
                            ...(existingAsset.metadata || {}),
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
        updatePackage(item.id, {
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
        updatePackage(item.id, {
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
            updatePackage(item.id, {
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
                updatePackage(item.id, { generation: generationFromTask(task) });
            });
            await savePackageVideoResult(item, config, video, completedTask as NormalizedVideoTask | null);
            message.success(`${item.id} 视频已生成，并写入我的素材`);
        } catch (error) {
            const referenceImages = resolveWorkflowReferenceImages(item, libraryAssets);
            const errorMessage = appendSeedanceMediaReviewDiagnostic(formatVideoGenerationError(error), referenceImages, []);
            if (error instanceof RecoverableVideoTaskError) {
                updatePackage(item.id, {
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
            updatePackage(item.id, {
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
        updatePackage(item.id, {
            generation: {
                ...item.generation,
                status: "running",
                taskStatus: "syncing",
                updatedAt: new Date().toISOString(),
            },
        });
        try {
            const latestTask = await refreshVideoTask(config, taskId);
            updatePackage(item.id, { generation: generationFromTask(latestTask) });
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
            updatePackage(item.id, {
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
            updatePackage(item.id, {
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
                updatePackage(item.id, {
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
                <section className="shrink-0 border-b border-[var(--studio-border-subtle)] pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--studio-text-muted)]">
                                <span className="font-medium text-[var(--studio-accent)]">AI · 画布</span>
                                <ChevronRight className="size-3.5" />
                                <span>{sourceLabel}</span>
                            </div>
                            <h1 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)] sm:text-3xl">视频节点生产台</h1>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--studio-text-secondary)]">
                                <span>按集推进：先补资产，再逐条检查提示词并生成</span>
                                <span className="text-[var(--studio-text-muted)]">|</span>
                                <span>
                                    已确认 {confirmedCount} 个，已生成 {generatedCount} 个，缺参考 {missingCount} 个，待审核 {reviewCount} 个
                                </span>
                            </div>
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
                </section>

                <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                            {filters.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={cn("h-8 rounded-md border px-3 text-sm transition", filter === item.key ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] text-[var(--studio-text-primary)] shadow-[inset_0_-2px_0_var(--studio-accent)]" : "border-transparent text-[var(--studio-text-secondary)] hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]")}
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
                                    onPromptChange={(prompt) => updatePackage(item.id, { prompt })}
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
                    preflightLoading={isEnterpriseBusy(isPreflightChecking, isPublicSettingsPending)}
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

function VideoPromptNodeCard({
    assets,
    config,
    item,
    loading,
    onConfigChange,
    onConfirm,
    onGenerate,
    onImportCanvas,
    onOpenDetail,
    onOpenConfig,
    onPreflight,
    onPromptChange,
    onRefreshReview,
    onSelect,
    onSubmitReview,
    onUploadReferenceImage,
    onSync,
    preflight,
    preflightLoading,
    refreshingReviewId,
    selected,
    submittingReviewId,
    uploadingReferenceKey,
    videoProtocol,
}: {
    assets: Asset[];
    config: AiConfig;
    item: ProductionPackage;
    loading: boolean;
    onConfigChange: (patch: PackageConfigPatch) => void;
    onConfirm: () => void;
    onGenerate: () => void;
    onImportCanvas: () => void;
    onOpenDetail: () => void;
    onOpenConfig: () => void;
    onPreflight: () => void;
    onPromptChange: (prompt: string) => void;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSelect: () => void;
    onSubmitReview: (asset: Asset) => Promise<void>;
    onUploadReferenceImage: (item: ProductionPackage, slot: PackageAssetSlot, file: File) => Promise<void>;
    onSync: () => void;
    preflight: VideoPreflightState | null;
    preflightLoading: boolean;
    refreshingReviewId: string | null;
    selected: boolean;
    submittingReviewId: string | null;
    uploadingReferenceKey: string;
    videoProtocol?: string;
}) {
    const summary = workflowReferenceBindingSummary(item, assets);
    const readiness = workflowVideoGenerationReadiness(item, assets, videoProtocol);
    const showCanvasAction = item.generation?.status === "succeeded" || item.canvasStatus === "已生成";
    return (
        <article className={cn("grid gap-4 rounded-md border bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)] transition hover:border-[var(--studio-border-strong)] xl:grid-cols-[minmax(0,1fr)_260px]", selected ? "border-[var(--studio-accent)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)]")} onClick={onSelect}>
            <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] px-2 py-1 text-sm font-semibold text-[var(--studio-accent)]">{item.id}</span>
                            <span className="text-sm text-[var(--studio-text-muted)]">{item.duration}</span>
                            <StatusTag label={item.promptStatus} />
                            <StatusTag label={item.assetStatus} />
                            <GenerationTag status={item.generation?.status} />
                            {item.generationVersions?.length ? <Tag className="m-0 rounded border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-1.5 py-0 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.generationVersions.length} 版</Tag> : null}
                        </div>
                        <h2 className="mt-2 break-words text-lg font-semibold leading-7 text-[var(--studio-text-primary)]">{item.segment}</h2>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        {item.promptStatus !== "已确认" ? (
                            <Button
                                size="small"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onConfirm();
                                }}
                            >
                                确认
                            </Button>
                        ) : null}
                        <Button
                            size="small"
                            icon={<Eye className="size-3.5" />}
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenDetail();
                            }}
                        >
                            详情
                        </Button>
                    </div>
                </div>

                <InlineAssetSlots
                    assets={assets}
                    item={item}
                    onRefreshReview={onRefreshReview}
                    onSubmitReview={onSubmitReview}
                    onUploadReferenceImage={onUploadReferenceImage}
                    refreshingReviewId={refreshingReviewId}
                    submittingReviewId={submittingReviewId}
                    uploadingReferenceKey={uploadingReferenceKey}
                />

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">提示词</div>
                            <span className="text-xs text-[var(--studio-text-muted)]">提示词和上方资产槽一一对照</span>
                        </div>
                        <PromptTextAreaWithReferencePreview
                            assets={assets}
                            item={item}
                            value={item.prompt}
                            onChange={onPromptChange}
                            onClick={(event) => event.stopPropagation()}
                        />
                    </div>
                    <VideoNodeSettings baseConfig={config} item={item} onChange={onConfigChange} onOpenConfig={onOpenConfig} />
                </div>

                <div
                    className={cn(
                        "rounded-md border px-3 py-2 text-sm leading-6",
                        studioSemanticNoticeClass(readinessStatusTone(readiness.status)),
                    )}
                >
                    参考资产 {summary.bound}/{summary.total || item.assets.length}：{readiness.message}
                </div>
            </div>

            <VideoNodeOutput
                config={config}
                item={item}
                loading={loading}
                onGenerate={onGenerate}
                onImportCanvas={onImportCanvas}
                onOpenConfig={onOpenConfig}
                onOpenDetail={onOpenDetail}
                onPreflight={onPreflight}
                onSync={onSync}
                preflight={preflight}
                preflightLoading={preflightLoading}
                showCanvasAction={showCanvasAction}
            />
        </article>
    );
}

function InlineAssetSlots({
    assets,
    item,
    onRefreshReview,
    onSubmitReview,
    onUploadReferenceImage,
    refreshingReviewId,
    submittingReviewId,
    uploadingReferenceKey,
}: {
    assets: Asset[];
    item: ProductionPackage;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSubmitReview: (asset: Asset) => Promise<void>;
    onUploadReferenceImage: (item: ProductionPackage, slot: PackageAssetSlot, file: File) => Promise<void>;
    refreshingReviewId: string | null;
    submittingReviewId: string | null;
    uploadingReferenceKey: string;
}) {
    const slots = item.assets.length ? item.assets : [{ kind: "场景图" as const, name: "未声明参考资产", status: "缺失" as const }];
    return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {slots.map((slot) => {
                const boundAsset = resolveWorkflowReferenceAssetForName(item, slot.name, assets);
                const bound = boundAsset?.kind === "image";
                const canReview = boundAsset && (boundAsset.kind === "image" || boundAsset.kind === "video" || boundAsset.kind === "audio");
                const shouldSubmitReview = canReview ? canSubmitVolcengineReview(boundAsset.metadata?.volcengineAsset) : false;
                const uploadKey = referenceSlotUploadKey(item.id, slot.name);
                const uploading = uploadingReferenceKey === uploadKey;
                return (
                    <div key={slot.name} className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]">
                        <div className="grid grid-cols-[72px_minmax(0,1fr)]">
                            <div className="aspect-square bg-[var(--studio-control-bg)]">
                                {boundAsset?.kind === "image" ? (
                                    <img alt={boundAsset.title} className="h-full w-full object-cover" src={boundAsset.data.dataUrl} />
                                ) : (
                                    <div className="grid h-full place-items-center text-[var(--studio-text-muted)]">
                                        <Link2 className="size-5" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 p-2">
                                <div className="overflow-hidden text-sm leading-5 font-medium break-words text-[var(--studio-text-primary)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" title={slot.name}>
                                    {slot.name}
                                </div>
                                {boundAsset?.title && boundAsset.title !== slot.name ? <div className="mt-0.5 truncate text-[11px] text-[var(--studio-text-muted)]">已绑定：{boundAsset.title}</div> : null}
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <span className="rounded border border-[var(--studio-border-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--studio-text-secondary)]">{slot.kind}</span>
                                    <StatusTag label={bound ? "完整" : "缺参考"} />
                                </div>
                                {boundAsset?.kind === "image" && boundAsset.metadata?.volcengineAsset?.status ? <div className="mt-1 truncate text-[11px] text-[var(--studio-text-muted)]">加白：{String(boundAsset.metadata.volcengineAsset.status)}</div> : null}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 border-t border-[var(--studio-border-subtle)] px-2 py-1.5">
                            <label className={cn("inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-2 text-xs leading-6 text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]", uploading && "pointer-events-none opacity-60")} onClick={(event) => event.stopPropagation()}>
                                {uploading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                                <span>{uploading ? "上传中" : bound ? "替换" : "上传"}</span>
                                <input
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploading}
                                    type="file"
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => {
                                        const file = event.currentTarget.files?.[0];
                                        event.currentTarget.value = "";
                                        if (file) void onUploadReferenceImage(item, slot, file);
                                    }}
                                />
                            </label>
                            {!bound ? (
                                <Button size="small" href="/assets">
                                    素材库
                                </Button>
                            ) : null}
                            {canReview ? (
                                shouldSubmitReview ? (
                                    <Button size="small" loading={submittingReviewId === boundAsset.id} onClick={() => void onSubmitReview(boundAsset)}>
                                        加白
                                    </Button>
                                ) : (
                                    <Button size="small" loading={refreshingReviewId === boundAsset.id} onClick={() => void onRefreshReview(boundAsset, { showProgress: true })}>
                                        刷新
                                    </Button>
                                )
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function PromptTextAreaWithReferencePreview({
    assets,
    item,
    onChange,
    onClick,
    value,
}: {
    assets: Asset[];
    item: ProductionPackage;
    onChange: (value: string) => void;
    onClick?: (event: MouseEvent<HTMLTextAreaElement>) => void;
    value: string;
}) {
    const [activeRef, setActiveRef] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const updateActiveRef = (textarea: HTMLTextAreaElement) => setActiveRef(promptReferenceAtCursor(textarea.value, textarea.selectionStart || 0));
    return (
        <div className="relative">
            <Input.TextArea
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                    updateActiveRef(event.currentTarget);
                }}
                onClick={(event) => {
                    onClick?.(event);
                    updateActiveRef(event.currentTarget);
                }}
                onFocus={(event) => {
                    setIsFocused(true);
                    updateActiveRef(event.currentTarget);
                }}
                onBlur={() => setIsFocused(false)}
                onKeyUp={(event) => updateActiveRef(event.currentTarget)}
                onSelect={(event) => updateActiveRef(event.currentTarget)}
                autoSize={{ minRows: 7, maxRows: 14 }}
                className="!rounded-md !border-[var(--studio-border-subtle)] !bg-[var(--studio-control-bg)] !text-sm !leading-6 !text-[var(--studio-text-primary)] placeholder:!text-[var(--studio-text-muted)]"
                style={{ paddingBottom: isFocused && item.assets.length ? 74 : undefined }}
            />
            {isFocused && item.assets.length ? (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex gap-1.5 overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-1.5 shadow-[var(--studio-shadow)] backdrop-blur">
                    {item.assets.map((slot) => {
                        const ref = slotReferenceRef(slot.name);
                        const boundAsset = resolveWorkflowReferenceAssetForName(item, slot.name, assets);
                        const previewUrl = assetPreviewUrl(boundAsset);
                        const active = activeRef === ref;
                        return (
                            <div key={slot.name} className={cn("grid w-[118px] shrink-0 grid-cols-[34px_minmax(0,1fr)] gap-1.5 rounded border p-1", active ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]")}>
                                <div className="grid size-[34px] place-items-center overflow-hidden rounded bg-[var(--studio-control-bg)]">
                                    {previewUrl ? <img src={previewUrl} alt={slot.name} className="h-full w-full object-cover" /> : <Link2 className="size-4 text-[var(--studio-warning)]" />}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-[11px] font-semibold text-[var(--studio-text-primary)]" title={slot.name}>
                                        {slot.name}
                                    </div>
                                    <div className={cn("truncate text-[10px]", boundAsset ? "text-[var(--studio-text-muted)]" : "text-[var(--studio-warning)]")} title={boundAsset?.title || "缺参考"}>
                                        {boundAsset?.title || "缺参考"}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function promptReferenceAtCursor(prompt: string, cursor: number) {
    for (const match of prompt.matchAll(/@图\s*(\d+)/g)) {
        const start = match.index || 0;
        const end = promptReferenceMentionEnd(prompt, start + match[0].length);
        if (cursor >= start && cursor <= end) return `@图${Number(match[1])}`;
    }
    return "";
}

function slotReferenceRef(slotName: string) {
    const match = slotName.match(/@图\s*(\d+)/);
    return match ? `@图${Number(match[1])}` : "";
}

function promptReferenceMentionEnd(prompt: string, start: number) {
    const next = prompt.slice(start).search(/[、，。；;\n]/);
    return next < 0 ? Math.min(prompt.length, start + 24) : start + next;
}

function assetPreviewUrl(asset?: Asset | null) {
    if (!asset) return "";
    if (asset.kind === "image") return asset.coverUrl || asset.data.dataUrl;
    if (asset.kind === "video" || asset.kind === "audio") return asset.coverUrl || asset.data.url;
    return "";
}

function VideoNodeSettings({ baseConfig, item, onChange, onOpenConfig }: { baseConfig: AiConfig; item: ProductionPackage; onChange: (patch: PackageConfigPatch) => void; onOpenConfig: () => void }) {
    const config = buildPackageVideoConfig(baseConfig, item);
    const visibleModel = item.config.model || config.seedanceModel || config.videoModel || config.model;
    return (
        <div className="space-y-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3" onClick={(event) => event.stopPropagation()}>
            <div>
                <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">视频节点设置</div>
                <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">与画布视频配置节点使用同一套参数。</div>
            </div>
            <ModelPicker
                className="canvas-compact-control !h-8 !w-full !justify-start !rounded-md !border-[var(--studio-border-subtle)] !bg-[var(--studio-control-bg)] !px-2 !text-xs !text-[var(--studio-text-primary)]"
                config={config}
                fullWidth
                modelType="video"
                value={visibleModel}
                onChange={(model) => onChange({ model })}
                onMissingConfig={onOpenConfig}
            />
            <CanvasVideoSettingsPopover
                buttonClassName="canvas-compact-control !h-8 !w-full !justify-start !rounded-md !border-[var(--studio-border-subtle)] !bg-[var(--studio-control-bg)] !px-2 !text-xs !text-[var(--studio-text-primary)]"
                config={config}
                hasSourceVideo={false}
                placement="bottomRight"
                showTaskMode
                onConfigChange={(key, value) => onChange(packageConfigPatchFromVideoSetting(key, value))}
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
                <SettingSummaryChip label="生成方式" value={videoTaskModeLabel(config.videoTaskMode)} />
                <SettingSummaryChip label="图片控制" value={videoReferenceImageModeLabel(config.videoReferenceImageMode)} />
                <SettingSummaryChip label="生成音频" value={config.videoGenerateAudio === "true" ? "开" : "关"} />
                <SettingSummaryChip label="水印" value={config.videoWatermark === "true" ? "开" : "关"} />
            </div>
        </div>
    );
}

function SettingSummaryChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-2 py-1.5">
            <div className="truncate text-[11px] text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-0.5 truncate text-[var(--studio-text-primary)]">{value}</div>
        </div>
    );
}

function packageConfigPatchFromVideoSetting(key: string, value: string): PackageConfigPatch {
    if (key === "size") return { ratio: value, size: value };
    if (key === "videoSeconds") return { duration: `${value}秒`, videoSeconds: value };
    if (key === "vquality") return { resolution: `${value.replace(/p$/i, "")}p`, vquality: value };
    if (key === "videoTaskMode") return { videoTaskMode: value as ProductionPackageConfig["videoTaskMode"] };
    if (key === "videoEditType") return { videoEditType: value as ProductionPackageConfig["videoEditType"] };
    if (key === "videoExtendDirection") return { videoExtendDirection: value as ProductionPackageConfig["videoExtendDirection"] };
    if (key === "videoReferenceImageMode") return { frames: videoReferenceImageModeLabel(value), videoReferenceImageMode: value as ProductionPackageConfig["videoReferenceImageMode"] };
    return { [key]: value } as PackageConfigPatch;
}

function videoReferenceImageModeLabel(value: string) {
    if (value === "first_last_frame") return "首尾帧";
    if (value === "first_frame") return "首帧";
    return "普通参考";
}

function videoTaskModeLabel(value: string) {
    if (value === "edit") return "编辑视频";
    if (value === "extend") return "延长视频";
    return "生成新视频";
}

function VideoNodeOutput({
    config,
    item,
    loading,
    onGenerate,
    onImportCanvas,
    onOpenConfig,
    onOpenDetail,
    onPreflight,
    onSync,
    preflight,
    preflightLoading,
    showCanvasAction,
}: {
    config: AiConfig;
    item: ProductionPackage;
    loading: boolean;
    onGenerate: () => void;
    onImportCanvas: () => void;
    onOpenConfig: () => void;
    onOpenDetail: () => void;
    onPreflight: () => void;
    onSync: () => void;
    preflight: VideoPreflightState | null;
    preflightLoading: boolean;
    showCanvasAction: boolean;
}) {
    const video = item.generation?.video;
    const nodeConfig = buildPackageVideoConfig(config, item);
    const generationError = item.generation?.status === "failed" ? normalizeVideoGenerationErrorMessage(item.generation.errorMessage || "视频生成失败，请打开详情查看原因。") : "";
    return (
        <aside className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">生成结果</div>
                    <div className="mt-1 text-sm text-[var(--studio-text-secondary)]">{generationStatusLabel(item.generation?.status)}</div>
                </div>
                <GenerationTag status={item.generation?.status} />
            </div>
            {video?.url ? (
                <button type="button" className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-left transition hover:border-[var(--studio-border-strong)]" onClick={onOpenDetail}>
                    <video className="aspect-video w-full bg-black object-contain" src={video.url} />
                    <div className="px-3 py-2 text-xs text-[var(--studio-text-secondary)]">点击查看详情 · {formatBytes(video.bytes)}</div>
                </button>
            ) : (
                <div className="grid aspect-video place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-center text-sm text-[var(--studio-text-muted)]">
                    {loading ? <LoaderCircle className="size-6 animate-spin text-[var(--studio-accent)]" /> : <Video className="size-6" />}
                </div>
            )}
            <div className="grid gap-2">
                <Button type="primary" icon={<Play className="size-4" />} loading={loading} onClick={onGenerate}>
                    {item.generation?.status === "succeeded" ? "生成新版本" : "生成视频"}
                </Button>
                {item.generation?.taskId && item.generation.status !== "succeeded" ? (
                    <Button icon={<RotateCcw className="size-4" />} loading={loading} onClick={onSync}>
                        同步任务结果
                    </Button>
                ) : null}
                <Button icon={<ShieldCheck className="size-4" />} loading={preflightLoading} onClick={onPreflight}>
                    预检企业 API
                </Button>
                {showCanvasAction ? (
                    <Button icon={<SendToBack className="size-4" />} onClick={onImportCanvas}>
                        承接到画布
                    </Button>
                ) : null}
                <Button icon={<Settings2 className="size-4" />} onClick={onOpenConfig}>
                    视频通道配置
                </Button>
            </div>
            <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-3 py-2 text-xs leading-5 text-[var(--studio-text-secondary)]">
                {nodeConfig.videoProtocol === "volcengine-ark" ? "企业 Ark / Seedance" : "未切到企业 Ark"} · {videoRatioLabel(nodeConfig.size)} · {videoSecondsLabel(nodeConfig.videoSeconds, nodeConfig)} · {videoResolutionLabel(nodeConfig.vquality)}
            </div>
            {preflight ? (
                <div className={cn("rounded-md border px-3 py-2 text-xs leading-5", studioSemanticNoticeClass(preflight.status === "passed" ? "success" : "warning"))}>
                    {preflight.message}
                </div>
            ) : null}
            {generationError ? (
                <div className={cn("rounded-md border px-3 py-2 text-xs leading-5", studioSemanticNoticeClass("danger"))}>
                    <div className="mb-1 flex items-center gap-1.5 font-medium">
                        <TriangleAlert className="size-3.5" />
                        生成失败
                    </div>
                    <div>{generationError}</div>
                    <button type="button" className="mt-2 text-[var(--studio-accent)] transition hover:text-[var(--studio-text-primary)]" onClick={onOpenDetail}>
                        查看详情
                    </button>
                </div>
            ) : null}
        </aside>
    );
}

function VideoNodeDetailDrawer({
    assets,
    config,
    item,
    loading,
    onClose,
    onGenerate,
    onOpenConfig,
    onPreflight,
    onRefreshReview,
    onSubmitReview,
    onSync,
    open,
    preflight,
    preflightLoading,
    refreshingReviewId,
    submittingReviewId,
    videoProtocol,
}: {
    assets: Asset[];
    config: AiConfig;
    item: ProductionPackage | null;
    loading: boolean;
    onClose: () => void;
    onGenerate: (item: ProductionPackage) => void;
    onOpenConfig: () => void;
    onPreflight: (item: ProductionPackage) => void;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSubmitReview: (asset: Asset) => Promise<void>;
    onSync: (item: ProductionPackage) => void;
    open: boolean;
    preflight: VideoPreflightState | null;
    preflightLoading: boolean;
    refreshingReviewId: string | null;
    submittingReviewId: string | null;
    videoProtocol?: string;
}) {
    if (!item) return null;
    return (
        <Drawer rootClassName="studio-modal" size={620} title={`${item.id} · 视频节点详情`} open={open} onClose={onClose}>
            <div className="space-y-4 text-[var(--studio-text-primary)]">
                <GenerationDetail item={item} loading={loading} onGenerate={() => onGenerate(item)} onOpenConfig={onOpenConfig} onSync={() => onSync(item)} />
                <Collapse
                    className="video-detail-collapse"
                    ghost
                    items={[
                        {
                            key: "prompt",
                            label: <span className="text-sm font-medium text-[var(--studio-text-primary)]">生成使用的提示词</span>,
                            children: <PromptDetailText prompt={item.prompt} />,
                        },
                        {
                            key: "assets",
                            label: <span className="text-sm font-medium text-[var(--studio-text-primary)]">参考图与加白状态</span>,
                            children: <AssetDetail assets={assets} item={item} onRefreshReview={onRefreshReview} onSubmitReview={onSubmitReview} refreshingReviewId={refreshingReviewId} submittingReviewId={submittingReviewId} videoProtocol={videoProtocol} />,
                        },
                        {
                            key: "config",
                            label: <span className="text-sm font-medium text-[var(--studio-text-primary)]">视频通道与参数</span>,
                            children: <ConfigDetail config={config} item={item} loading={preflightLoading} preflight={preflight} onPreflight={() => onPreflight(item)} />,
                        },
                    ]}
                />
            </div>
        </Drawer>
    );
}

function PromptDetailText({ prompt }: { prompt: string }) {
    return <div className="thin-scrollbar max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-3 py-2 text-sm leading-6 text-[var(--studio-text-primary)]">{prompt}</div>;
}

function isEnterpriseBusy(checking: boolean, loading: boolean) {
    return checking || loading;
}

function AssetDetail({
    assets,
    item,
    videoProtocol,
    onRefreshReview,
    onSubmitReview,
    refreshingReviewId,
    submittingReviewId,
}: {
    assets: Asset[];
    item: ProductionPackage;
    videoProtocol?: string;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSubmitReview: (asset: Asset) => Promise<void>;
    refreshingReviewId: string | null;
    submittingReviewId: string | null;
}) {
    const summary = workflowReferenceBindingSummary(item, assets);
    const referenceImages = resolveWorkflowReferenceImages(item, assets);
    const reviewNotice = seedanceMediaReviewBlockingError(referenceImages, []);
    const readiness = workflowVideoGenerationReadiness(item, assets, videoProtocol);
    return (
        <div className="space-y-3 pb-4">
            {item.workflowReferences?.length ? (
                <div className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] px-3 py-2 text-sm text-[var(--studio-text-primary)]">
                    已匹配参考图 {summary.bound}/{summary.total}。已生图的视频工作流素材会随视频请求一起提交；缺失项仍按提示词文字生成。
                </div>
            ) : null}
            <div
                className={cn(
                    "rounded-md border px-3 py-2 text-sm leading-6",
                    studioSemanticNoticeClass(readinessStatusTone(readiness.status)),
                )}
            >
                {readiness.message}
            </div>
            {reviewNotice ? <div className={cn("rounded-md border px-3 py-2 text-sm leading-6", studioSemanticNoticeClass("warning"))}>{reviewNotice}</div> : null}
            {item.assets.map((asset) => {
                const bound = isWorkflowReferenceAssetBound(item, asset.name, assets);
                const boundAsset = resolveWorkflowReferenceAssetForName(item, asset.name, assets);
                const status = bound ? "已绑定" : asset.status;
                const image = resolveWorkflowReferenceImages({ ...item, prompt: asset.name, workflowReferences: item.workflowReferences }, assets)[0];
                const canReview = boundAsset && (boundAsset.kind === "image" || boundAsset.kind === "video" || boundAsset.kind === "audio");
                const shouldSubmitReview = canReview ? canSubmitVolcengineReview(boundAsset.metadata?.volcengineAsset) : false;
                return (
                    <div key={asset.name} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2.5 text-sm transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]">
                        <span className="text-[var(--studio-text-muted)]">{asset.kind}</span>
                        <div className="min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className={cn("truncate", status === "缺失" ? "text-[var(--studio-warning)]" : "text-[var(--studio-text-primary)]")}>{asset.name}</span>
                                <StatusTag label={status === "缺失" ? "缺参考" : "完整"} />
                            </div>
                            {status === "缺失" ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button size="small" icon={<Link2 className="size-3.5" />}>
                                        去资产库绑定
                                    </Button>
                                    <Button size="small" icon={<Play className="size-3.5" />}>
                                        生成参考图
                                    </Button>
                                </div>
                            ) : null}
                            {image?.volcengineAssetStatus ? (
                                <div className={cn("mt-2 text-xs", image.assetUri ? "text-[var(--studio-success)]" : "text-[var(--studio-warning)]")}>
                                    火山加白：{image.volcengineAssetStatus}
                                    {image.assetUri ? "，生成时将使用 asset:// 参考图" : "，需刷新到 Active 后再生成"}
                                </div>
                            ) : null}
                            {canReview ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {shouldSubmitReview ? (
                                        <Button size="small" icon={<ShieldCheck className="size-3.5" />} loading={submittingReviewId === boundAsset.id} onClick={() => void onSubmitReview(boundAsset)}>
                                            提交加白
                                        </Button>
                                    ) : (
                                        <Button
                                            size="small"
                                            icon={<RefreshCw className={cn("size-3.5", refreshingReviewId === boundAsset.id && "animate-spin")} />}
                                            loading={refreshingReviewId === boundAsset.id}
                                            onClick={() => void onRefreshReview(boundAsset, { showProgress: true })}
                                        >
                                            刷新加白
                                        </Button>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                );
            })}
            {!item.assets.length ? <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-6 text-center text-sm text-[var(--studio-text-muted)]">当前生产包未声明参考资产。</div> : null}
        </div>
    );
}

function ConfigDetail({ config, item, loading, onPreflight, preflight }: { config: AiConfig; item: ProductionPackage; loading: boolean; onPreflight: () => void; preflight: VideoPreflightState | null }) {
    const nodeConfig = buildPackageVideoConfig(config, item);
    const channelLabel = nodeConfig.videoProtocol === "volcengine-ark" ? "企业 Ark / Seedance" : "未切到企业 Ark";
    const actualModel = resolvePackageVideoModel(nodeConfig);
    const entries = [
        ["实际通道", channelLabel],
        ["实际模型", actualModel || "未配置"],
        ["生成方式", videoTaskModeLabel(nodeConfig.videoTaskMode)],
        ["比例", videoRatioLabel(nodeConfig.size)],
        ["时长", videoSecondsLabel(nodeConfig.videoSeconds, nodeConfig)],
        ["清晰度", videoResolutionLabel(nodeConfig.vquality)],
        ["图片控制", videoReferenceImageModeLabel(nodeConfig.videoReferenceImageMode)],
        ["生成音频", nodeConfig.videoGenerateAudio === "true" ? "开启" : "关闭"],
        ["水印", nodeConfig.videoWatermark === "true" ? "开启" : "关闭"],
        ["seed", nodeConfig.videoSeed || "随机"],
    ];

    return (
        <div className="space-y-3 pb-4">
            <div className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] px-3 py-2 text-sm text-[var(--studio-text-primary)]">生成会调用当前全局 AI 设置里的真实视频通道；企业 Ark 模型和 EP 绑定在后台系统设置维护。</div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                <div>
                    <div className="text-sm font-medium text-[var(--studio-text-primary)]">企业视频通道预检</div>
                    <div className="mt-1 text-xs text-[var(--studio-text-muted)]">只验证企业 API Key、模型和 EP 绑定，不创建视频任务。</div>
                </div>
                <Button loading={loading} icon={<ShieldCheck className="size-4" />} onClick={onPreflight}>
                    预检企业 API
                </Button>
            </div>
            {preflight ? (
                <div className={cn("rounded-md border px-3 py-2 text-sm", studioSemanticNoticeClass(preflight.status === "passed" ? "success" : "warning"))}>
                    <div className="flex items-center gap-2 font-medium">
                        {preflight.status === "passed" ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
                        {preflight.status === "passed" ? "预检通过" : "预检失败"}
                    </div>
                    <div className="mt-1 leading-6 opacity-85">{preflight.message}</div>
                    {preflight.status === "failed" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="small" icon={<Settings2 className="size-3.5" />} href="/admin/settings?focus=enterprise-video">
                                后台系统设置
                            </Button>
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={onPreflight}>
                                重新预检
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
                {entries.map(([label, value]) => (
                    <div key={label} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                        <div className="text-xs text-[var(--studio-text-muted)]">{label}</div>
                        <div className="mt-1 text-sm text-[var(--studio-text-primary)]">{value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GenerationDetail({ item, loading, onGenerate, onOpenConfig, onSync }: { item: ProductionPackage; loading: boolean; onGenerate: () => void; onOpenConfig: () => void; onSync: () => void }) {
    const generation = item.generation;
    const video = generation?.video;
    const rawError = generation?.errorMessage || "";
    const cleanError = sanitizeVideoGenerationErrorMessage(rawError);
    const displayError = rawError ? normalizeVideoGenerationErrorMessage(rawError) : "";
    const authError = isVideoChannelAuthError(cleanError);
    const upstreamError = !authError && isVideoChannelUpstreamError(cleanError);
    return (
        <div className="thin-scrollbar max-h-[calc(100vh-250px)] space-y-4 overflow-y-auto pb-4">
            {video?.url ? (
                <div className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)]">
                    <video className="aspect-video w-full bg-black object-contain" src={video.url} controls />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--studio-border-subtle)] px-3 py-2 text-xs text-[var(--studio-text-secondary)]">
                        <span>
                            {video.width}x{video.height} · {formatBytes(video.bytes)}
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className="inline-flex items-center gap-1 text-[var(--studio-accent)] transition hover:text-[var(--studio-text-primary)]" onClick={onGenerate}>
                                <Play className="size-3.5" />
                                生成新版本
                            </button>
                            <a className="inline-flex items-center gap-1 text-[var(--studio-accent)] transition hover:text-[var(--studio-text-primary)]" href={video.url} download={`${item.id}.mp4`}>
                                <Download className="size-3.5" />
                                下载视频
                            </a>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-4 py-12 text-center">
                    {loading ? <LoaderCircle className="mb-3 size-7 animate-spin text-[var(--studio-accent)]" /> : <Video className="mb-3 size-7 text-[var(--studio-text-muted)]" />}
                    <div className="text-sm font-medium text-[var(--studio-text-primary)]">{loading ? "正在生成视频" : "还没有生成视频"}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">会调用真实视频接口，任务完成后自动保存到我的素材。</div>
                    <Button className="mt-4" type="primary" loading={loading} icon={<Play className="size-4" />} onClick={onGenerate}>
                        生成视频
                    </Button>
                    {generation?.taskId ? (
                        <Button className="mt-2" loading={loading} icon={<RotateCcw className="size-4" />} onClick={onSync}>
                            同步任务结果
                        </Button>
                    ) : null}
                </div>
            )}
            <div className="grid gap-2 text-sm">
                <InfoRow label="任务状态" value={generationStatusLabel(generation?.status)} />
                <InfoRow label="任务 ID" value={generation?.taskId || "-"} />
                <InfoRow label="上游状态" value={generation?.taskStatus || "-"} />
                <InfoRow label="素材 ID" value={generation?.assetId || "-"} />
                <InfoRow label="消耗额度" value={generation?.aiTaskCredits === undefined ? "-" : String(generation.aiTaskCredits)} />
                {displayError ? <InfoRow danger label="错误" value={displayError} /> : null}
            </div>
            {authError ? (
                <div className={cn("rounded-lg border p-3 text-sm", studioSemanticNoticeClass("warning"))}>
                    <div className="font-medium">视频通道认证失败</div>
                    <div className="mt-1 leading-6 opacity-80">当前生产包已经正确进入真实视频接口，但企业 Ark API Key 不存在、已失效，或 EP 绑定不可用。请到后台系统设置更新企业视频通道密钥后重试。</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="small" icon={<Settings2 className="size-3.5" />} onClick={onOpenConfig}>
                            打开配置
                        </Button>
                        <Button size="small" href="/admin/settings">
                            后台系统设置
                        </Button>
                    </div>
                </div>
            ) : null}
            {upstreamError ? (
                <div className={cn("rounded-lg border p-3 text-sm", studioSemanticNoticeClass("warning"))}>
                    <div className="font-medium">视频上游提交失败</div>
                    <div className="mt-1 leading-6 opacity-80">请求已进入真实视频通道，但供应商上游拒绝创建任务。通常是企业 API Key / EP 绑定不可用、账号未开通视频模型，或模型路由不可用；请在后台系统设置更新已确认可用的视频通道后重试。</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="small" icon={<Settings2 className="size-3.5" />} onClick={onOpenConfig}>
                            打开配置
                        </Button>
                        <Button size="small" href="/admin/settings">
                            后台系统设置
                        </Button>
                    </div>
                </div>
            ) : null}
            {generation?.assetId ? (
                <div className={cn("rounded-lg border p-3 text-sm", studioSemanticNoticeClass("success"))}>
                    <div className="font-medium">素材已归档</div>
                    <div className="mt-1 leading-6 opacity-80">本次视频已写入“我的素材”，同编号再次生成会保留旧视频版本。</div>
                    <Button className="mt-3" size="small" href={`/assets?kind=video&assetId=${encodeURIComponent(generation.assetId)}`}>
                        打开素材
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function InfoRow({ danger, label, value }: { danger?: boolean; label: string; value: string }) {
    return (
        <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
            <span className="text-[var(--studio-text-muted)]">{label}</span>
            <span className={cn("break-all", danger ? "text-[var(--studio-danger)]" : "text-[var(--studio-text-primary)]")}>{value}</span>
        </div>
    );
}

function StatusTag({ label }: { label: PromptStatus | AssetStatus | CanvasStatus | "缺参考" | "完整" }) {
    const colorClass =
        label === "已确认" || label === "完整" || label === "已生成"
            ? studioSemanticTagClass("success")
            : label === "待审核" || label === "已导入"
              ? studioSemanticTagClass("info")
              : label === "未导入"
                ? studioSemanticTagClass("neutral")
                : studioSemanticTagClass("warning");

    return <Tag className={cn("m-0 rounded px-1.5 py-0 text-xs leading-5", colorClass)}>{label}</Tag>;
}

function GenerationTag({ status }: { status?: PackageGenerationStatus }) {
    const label = generationStatusLabel(status);
    const colorClass =
        status === "succeeded"
            ? studioSemanticTagClass("success")
            : status === "running" || status === "queued" || status === "creating" || status === "checking"
              ? studioSemanticTagClass("info")
              : status === "failed" || status === "cancelled"
                ? studioSemanticTagClass("danger")
                : studioSemanticTagClass("neutral");
    return <Tag className={cn("m-0 rounded px-1.5 py-0 text-xs leading-5", colorClass)}>{label}</Tag>;
}

type StudioSemanticTone = "danger" | "info" | "neutral" | "success" | "warning";

function studioSemanticNoticeClass(tone: StudioSemanticTone) {
    return `studio-semantic-notice studio-semantic-${tone}`;
}

function studioSemanticTagClass(tone: StudioSemanticTone) {
    return `studio-semantic-tag studio-semantic-${tone}`;
}

function readinessStatusTone(status: ReturnType<typeof workflowVideoGenerationReadiness>["status"]): StudioSemanticTone {
    if (status === "blocked") return "warning";
    if (status === "warning") return "info";
    return "success";
}

function videoWorkflowCanvasKey(packages: ProductionPackage[], targetEpisode: string) {
    return `video-workflow:${videoWorkflowEpisodeLabel(packages, targetEpisode)}`;
}

function videoWorkflowEpisodeLabel(packages: ProductionPackage[], targetEpisode: string) {
    return targetEpisode || packages.find((item) => item.sourceEpisode)?.sourceEpisode || "demo";
}

function canvasHref(canvasId: string, focusNodeId?: string) {
    if (!canvasId) return "/canvas";
    return `/canvas/${canvasId}${focusNodeId ? `?focusNodeId=${encodeURIComponent(focusNodeId)}` : ""}`;
}

function mergeVideoPackagesIntoCanvasNodes(existingNodes: CanvasNodeData[], packages: ProductionPackage[], config: AiConfig) {
    const nodes = [...existingNodes];
    const focusNodeId = packages[0] ? videoPackageCanvasNodeId(packages[0]) : undefined;
    packages.forEach((item, index) => {
        const nodeId = videoPackageCanvasNodeId(item);
        const existingIndex = nodes.findIndex((node) => node.id === nodeId || node.metadata?.productionPackageId === videoPackageCanvasPackageId(item));
        const node = buildVideoPackageConfigNode(item, config, existingIndex >= 0 ? nodes[existingIndex].position : videoPackageNodePosition(existingNodes.length + index));
        if (existingIndex >= 0) nodes[existingIndex] = { ...nodes[existingIndex], ...node, id: nodes[existingIndex].id, position: nodes[existingIndex].position };
        else nodes.push(node);
    });
    return { focusNodeId, nodes };
}

function buildVideoPackageConfigNode(item: ProductionPackage, baseConfig: AiConfig, position: CanvasNodeData["position"]): CanvasNodeData {
    const videoConfig = buildPackageVideoConfig(baseConfig, item);
    const packageDuration = videoConfig.videoSeconds;
    return {
        height: NODE_DEFAULT_SIZE[CanvasNodeType.Config].height,
        id: videoPackageCanvasNodeId(item),
        metadata: {
            content: "",
            duration: packageDuration,
            finalPrompt: item.prompt,
            generateAudio: videoConfig.videoGenerateAudio,
            generationMode: "video",
            model: resolvePackageVideoModel(videoConfig),
            productionPackageId: videoPackageCanvasPackageId(item),
            productionPackageLabel: item.id,
            productionPackageRole: "video_config",
            productionPackageTitle: item.segment,
            prompt: item.prompt,
            provider: videoConfig.videoProtocol === "volcengine-ark" ? "volcengine-ark" : "openai",
            referenceAssets: item.assets.map((asset) => ({ kind: asset.kind, name: asset.name, status: asset.status })),
            returnLastFrame: videoConfig.returnLastFrame,
            seconds: packageDuration,
            seed: videoConfig.videoSeed,
            size: videoConfig.size,
            sourceId: item.id,
            sourceType: "manual",
            status: "idle",
            videoEditType: videoConfig.videoEditType,
            videoExtendDirection: videoConfig.videoExtendDirection,
            videoPromptReviewEnabled: videoConfig.videoPromptReviewEnabled,
            videoReferenceImageMode: videoConfig.videoReferenceImageMode,
            videoTaskMode: videoConfig.videoTaskMode,
            vquality: videoConfig.vquality,
            watermark: videoConfig.videoWatermark,
        },
        position,
        title: `${item.id} · 视频配置`,
        type: CanvasNodeType.Config,
        width: NODE_DEFAULT_SIZE[CanvasNodeType.Config].width,
    };
}

function videoPackageCanvasPackageId(item: ProductionPackage) {
    return `video-workflow:${item.sourceEpisode || "demo"}:${item.id}`;
}

function videoPackageCanvasNodeId(item: ProductionPackage) {
    return `video-workflow-config-${sanitizeCanvasIdPart(item.sourceEpisode || "demo")}-${sanitizeCanvasIdPart(item.id)}`;
}

function sanitizeCanvasIdPart(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "item";
}

function videoPackageNodePosition(index: number) {
    const column = index % 3;
    const row = Math.floor(index / 3);
    return { x: 120 + column * 390, y: 120 + row * 300 };
}

function matchFilter(item: ProductionPackage, filter: FilterKey) {
    if (filter === "review") return item.promptStatus === "待审核";
    if (filter === "missing") return item.assetStatus !== "完整";
    if (filter === "ready") return item.promptStatus === "已确认" && item.canvasStatus === "未导入";
    if (filter === "imported") return item.canvasStatus === "已导入";
    if (filter === "generated") return item.canvasStatus === "已生成";
    return true;
}

function referenceSlotUploadKey(packageId: string, slotName: string) {
    return `${packageId}:${slotName}`;
}

function buildReferenceUploadPackagePatch(item: ProductionPackage, uploadedSlot: PackageAssetSlot, assets: Asset[]): Partial<ProductionPackage> {
    const slots = item.assets.length ? item.assets : [uploadedSlot];
    const nextAssets = slots.map((slot) => ({
        ...slot,
        status: slot.name === uploadedSlot.name || isWorkflowReferenceAssetBound(item, slot.name, assets) ? ("已绑定" as const) : slot.status,
    }));
    return {
        assetStatus: packageAssetStatusFromSlots(nextAssets),
        assets: nextAssets,
    };
}

function packageAssetStatusFromSlots(slots: PackageAssetSlot[]): AssetStatus {
    const missing = slots.find((slot) => slot.status !== "已绑定");
    if (!missing) return "完整";
    return missing.kind === "场景图" ? "缺场景图" : "缺角色图";
}

function buildWorkflowReferenceImageAssetInput(input: {
    episode: string;
    fileName: string;
    image: UploadedImage;
    item: ProductionPackage;
    projectSlug: string;
    slot: PackageAssetSlot;
    sourceEpisodeId: string;
    sourceProjectId: string;
}): AssetWriteInput {
    const now = new Date().toISOString();
    const reference = slotWorkflowReference(input.item, input.slot.name);
    const refName = reference?.name || referenceNameFromSlot(input.slot.name);
    const refLabel = [reference?.ref, refName].filter(Boolean).join(" ") || input.slot.name;
    const typeLabel = reference?.type || input.slot.kind.replace(/图$/, "");
    const originalWorkflow = {
        assetId: refName || input.slot.name,
        episode: input.item.sourceEpisode || input.episode,
        generatedAt: now,
        importKey: `${input.item.id}:${reference?.ref || input.slot.name}`,
        prompt: input.item.prompt,
        projectSlug: input.item.sourceProjectSlug || input.projectSlug,
        sourceEpisodeId: input.sourceEpisodeId,
        sourcePath: input.item.source || "",
        sourceProjectId: input.item.sourceProjectId || input.sourceProjectId,
        status: "image_generated",
        type: typeLabel,
    };
    const generation = {
        actionType: "upload-reference",
        createdAt: now,
        fileName: input.fileName,
        originalWorkflow,
        productionPackageId: input.item.id,
        prompt: input.item.prompt,
        source: "video-page",
    };
    return {
        coverUrl: input.image.url,
        data: {
            bytes: input.image.bytes,
            dataUrl: input.image.url,
            height: input.image.height,
            mimeType: input.image.mimeType,
            storageKey: input.image.storageKey,
            width: input.image.width,
        },
        kind: "image",
        metadata: {
            generation,
            generations: [generation],
            originalWorkflow,
            prompt: input.item.prompt,
            source: "original-workflow",
        },
        note: [`来源生产包：${input.item.id}`, `参考资产：${refLabel}`, `文件：${input.fileName}`].filter(Boolean).join("\n"),
        source: "视频生产台上传",
        tags: ["视频工作流", "视频生产台", "参考图", "已生图", input.item.sourceEpisode || input.episode, typeLabel].filter(Boolean),
        title: `${refLabel} · ${typeLabel}`,
    } satisfies AssetWriteInput;
}

function slotWorkflowReference(item: ProductionPackage, slotName: string): WorkflowVideoReference | undefined {
    const ref = slotName.match(/@图\s*(\d+)/)?.[1];
    if (!ref) return undefined;
    return item.workflowReferences?.find((entry) => entry.ref === `@图${Number(ref)}`);
}

function referenceNameFromSlot(slotName: string) {
    return slotName.replace(/@图\s*\d+/, "").trim() || slotName;
}

function uniqueAssets(assets: Asset[]) {
    const seen = new Set<string>();
    return assets.filter((asset) => {
        if (seen.has(asset.id)) return false;
        seen.add(asset.id);
        return true;
    });
}

function readWorkflowPackageId(asset: Asset) {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    return readString(workflow?.packageId);
}

function readWorkflowSourceEpisode(asset: Asset) {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    return readString(workflow?.sourceEpisode);
}

function readGenerationVersions(asset: Asset) {
    const values = asset.metadata?.generationVersions;
    return Array.isArray(values) ? values : [];
}

function generationFromTask(task: NormalizedVideoTask) {
    return {
        aiTaskCredits: task.aiTaskCredits,
        aiTaskId: task.aiTaskId,
        errorMessage: task.errorMessage ? normalizeVideoGenerationErrorMessage(task.errorMessage) : undefined,
        status: task.status as PackageGenerationStatus,
        taskId: task.id,
        taskStatus: task.rawStatus || task.status,
        updatedAt: new Date().toISOString(),
    };
}

function aiTaskLedgerFromVideoTask(task: NormalizedVideoTask): AiTaskLedger {
    return {
        aiTaskCredits: task.aiTaskCredits,
        aiTaskId: task.aiTaskId,
        aiTaskStatus: task.aiTaskStatus || task.status,
        creditLogId: task.creditLogId,
        creditsRefunded: task.creditsRefunded,
        errorMessage: task.errorMessage,
        finishedAt: task.finishedAt,
        refundedAt: task.refundedAt,
        upstreamTaskId: task.upstreamTaskId || task.id,
    };
}

function buildPackageAssetGeneration(item: ProductionPackage, config: AiConfig, video: PackageUploadedVideo, finalTask: NormalizedVideoTask | null, createdAt: string) {
    const aiTask = video.aiTask;
    return {
        actionType: "generate",
        aiTaskCredits: aiTask?.aiTaskCredits,
        aiTaskId: aiTask?.aiTaskId,
        aiTaskStatus: aiTask?.aiTaskStatus || finalTask?.status,
        config: {
            duration: config.videoSeconds,
            generateAudio: config.videoGenerateAudio,
            model: config.model,
            provider: config.videoProtocol,
            ratio: config.size,
            resolution: config.vquality,
            seconds: config.videoSeconds,
            size: config.size,
            videoTaskMode: config.videoTaskMode,
            watermark: config.videoWatermark,
        },
        createdAt,
        creditLogId: aiTask?.creditLogId,
        creditsRefunded: aiTask?.creditsRefunded,
        effectivePrompt: item.prompt,
        finishedAt: aiTask?.finishedAt,
        model: config.model,
        productionPackageId: item.id,
        productionPackageTitle: item.segment,
        prompt: item.prompt,
        provider: config.videoProtocol,
        refundedAt: aiTask?.refundedAt,
        source: "video-page",
        sourceEpisode: item.sourceEpisode,
        sourceProjectId: item.sourceProjectId,
        sourceProjectSlug: item.sourceProjectSlug,
        taskId: finalTask?.id || aiTask?.upstreamTaskId,
        taskStatus: finalTask?.status || aiTask?.aiTaskStatus,
        upstreamTaskId: finalTask?.upstreamTaskId || finalTask?.id || aiTask?.upstreamTaskId,
    };
}

function resolvePackageVideoModel(config: AiConfig) {
    return (config.videoProtocol === "volcengine-ark" ? config.seedanceEndpointId || config.seedanceModel || config.videoModel || config.model : config.videoModel || config.model).trim();
}

function buildPackageVideoConfig(baseConfig: AiConfig, item: ProductionPackage): AiConfig {
    const provider = baseConfig.videoProtocol || "openai";
    const packageDuration = item.config.videoSeconds || item.config.duration || item.duration || baseConfig.videoSeconds;
    const packageModel = resolvePackageConfigModel(baseConfig, item, provider);
    const metadata: Partial<CanvasNodeMetadata> = {
        duration: packageSeconds(packageDuration),
        generateAudio: item.config.videoGenerateAudio || baseConfig.videoGenerateAudio || "true",
        generationMode: "video",
        model: packageModel,
        provider,
        returnLastFrame: item.config.returnLastFrame || baseConfig.returnLastFrame,
        seed: item.config.videoSeed || baseConfig.videoSeed,
        seconds: packageSeconds(packageDuration),
        size: packageRatio(item.config.size || item.config.ratio || baseConfig.size),
        videoEditType: item.config.videoEditType || baseConfig.videoEditType,
        videoExtendDirection: item.config.videoExtendDirection || baseConfig.videoExtendDirection,
        videoPromptReviewEnabled: item.config.videoPromptReviewEnabled || baseConfig.videoPromptReviewEnabled || "true",
        videoReferenceImageMode: item.config.videoReferenceImageMode || baseConfig.videoReferenceImageMode,
        videoTaskMode: item.config.videoTaskMode || "generate",
        vquality: packageResolution(item.config.vquality || item.config.resolution || baseConfig.vquality),
        watermark: item.config.videoWatermark || baseConfig.videoWatermark,
    };
    const config = buildCanvasVideoConfig(baseConfig, metadata as CanvasNodeMetadata);
    return {
        ...config,
        model: provider === "volcengine-ark" ? config.seedanceEndpointId || config.seedanceModel || config.model : config.videoModel || config.model,
    };
}

function resolvePackageConfigModel(baseConfig: AiConfig, item: ProductionPackage, provider: string) {
    const fallback = provider === "volcengine-ark" ? baseConfig.seedanceEndpointId || baseConfig.seedanceModel || baseConfig.videoModel : baseConfig.videoModel || baseConfig.model;
    const model = item.config.model?.trim() || "";
    if (provider !== "volcengine-ark") return model || fallback;
    const allowedModels = new Set([baseConfig.videoModel, baseConfig.seedanceModel, ...baseConfig.videoModels].filter(Boolean));
    return model && allowedModels.has(model) ? model : fallback;
}

function packageSeconds(value: string) {
    return value.match(/\d+/)?.[0] || "6";
}

function packageRatio(value: string) {
    if (value === "adaptive" || value === "auto") return "adaptive";
    const ratio = value.match(/\d+\s*:\s*\d+/)?.[0]?.replace(/\s+/g, "");
    return ratio || "9:16";
}

function packageResolution(value: string) {
    return value.match(/1080/) ? "1080" : "720";
}

function originalWorkflowHref(episode: string, options: { projectSlug?: string; sourceEpisodeId?: string; sourceProjectId?: string } = {}) {
    const params = new URLSearchParams({ episode });
    if (options.projectSlug) params.set("projectSlug", options.projectSlug);
    if (options.sourceProjectId) params.set("sourceProjectId", options.sourceProjectId);
    if (options.sourceEpisodeId) params.set("sourceEpisodeId", options.sourceEpisodeId);
    return `/original-workflow?${params.toString()}`;
}

function generationStatusLabel(status?: PackageGenerationStatus) {
    if (status === "checking") return "预检中";
    if (status === "creating") return "创建中";
    if (status === "queued") return "排队中";
    if (status === "running") return "生成中";
    if (status === "succeeded") return "已生成";
    if (status === "failed") return "失败";
    if (status === "cancelled") return "已取消";
    return "待生成";
}

function formatBytes(bytes: number) {
    if (!bytes) return "0 B";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function readGenerationList(value: unknown) {
    if (Array.isArray(value)) return value.flatMap((item) => (readRecord(item) ? [item as Record<string, unknown>] : []));
    const record = readRecord(value);
    return record ? [record] : [];
}
