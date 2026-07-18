import { buildCanvasVideoConfig } from "@/app/(user)/canvas/utils/canvas-video-config";
import { NODE_DEFAULT_SIZE } from "@/app/(user)/canvas/constants";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/app/(user)/canvas/types";
import type { AiTaskLedger } from "@/services/api/ai-task-trace";
import type { NormalizedVideoTask } from "@/services/api/video";
import type { UploadedImage } from "@/services/image-storage";
import type { Asset, AssetWriteInput } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import { normalizeVideoGenerationErrorMessage } from "./video-generation-errors";
import { isWorkflowReferenceAssetBound } from "./video-package-builders";
import type { AssetStatus, PackageGenerationStatus, ProductionPackage, WorkflowVideoReference } from "./use-video-package-store";
import type { FilterKey, PackageAssetSlot, PackageUploadedVideo } from "./video-page-types";

export function videoWorkflowCanvasKey(packages: ProductionPackage[], targetEpisode: string) {
    return `video-workflow:${videoWorkflowEpisodeLabel(packages, targetEpisode)}`;
}

export function videoWorkflowEpisodeLabel(packages: ProductionPackage[], targetEpisode: string) {
    return targetEpisode || packages.find((item) => item.sourceEpisode)?.sourceEpisode || "demo";
}

export function canvasHref(canvasId: string, focusNodeId?: string) {
    if (!canvasId) return "/canvas";
    return `/canvas/${canvasId}${focusNodeId ? `?focusNodeId=${encodeURIComponent(focusNodeId)}` : ""}`;
}

export function mergeVideoPackagesIntoCanvasNodes(existingNodes: CanvasNodeData[], packages: ProductionPackage[], config: AiConfig) {
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
            provider: videoConfig.videoProtocol,
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

export function matchFilter(item: ProductionPackage, filter: FilterKey) {
    if (filter === "review") return item.promptStatus === "待审核";
    if (filter === "missing") return item.assetStatus !== "完整";
    if (filter === "ready") return item.promptStatus === "已确认" && item.canvasStatus === "未导入";
    if (filter === "imported") return item.canvasStatus === "已导入";
    if (filter === "generated") return item.canvasStatus === "已生成";
    return true;
}

export function referenceSlotUploadKey(packageId: string, slotName: string) {
    return `${packageId}:${slotName}`;
}

export function buildReferenceUploadPackagePatch(item: ProductionPackage, uploadedSlot: PackageAssetSlot, assets: Asset[]): Partial<ProductionPackage> {
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

export function buildWorkflowReferenceImageAssetInput(input: {
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

export function uniqueAssets(assets: Asset[]) {
    const seen = new Set<string>();
    return assets.filter((asset) => {
        if (seen.has(asset.id)) return false;
        seen.add(asset.id);
        return true;
    });
}

export function readWorkflowPackageId(asset: Asset) {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    return readString(workflow?.packageId);
}

export function readWorkflowSourceEpisode(asset: Asset) {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    return readString(workflow?.sourceEpisode);
}

export function readGenerationVersions(asset: Asset) {
    const values = asset.metadata?.generationVersions;
    return Array.isArray(values) ? values : [];
}

export function generationFromTask(task: NormalizedVideoTask) {
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

export function aiTaskLedgerFromVideoTask(task: NormalizedVideoTask): AiTaskLedger {
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

export function buildPackageAssetGeneration(item: ProductionPackage, config: AiConfig, video: PackageUploadedVideo, finalTask: NormalizedVideoTask | null, createdAt: string) {
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

export function resolvePackageVideoModel(config: AiConfig) {
    return (config.videoProtocol === "volcengine-ark" ? config.seedanceEndpointId || config.seedanceModel || config.videoModel || config.model : config.videoModel || config.model).trim();
}

export function buildPackageVideoConfig(baseConfig: AiConfig, item: ProductionPackage): AiConfig {
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

export function originalWorkflowHref(episode: string, options: { projectSlug?: string; sourceEpisodeId?: string; sourceProjectId?: string } = {}) {
    const params = new URLSearchParams({ episode });
    if (options.projectSlug) params.set("projectSlug", options.projectSlug);
    if (options.sourceProjectId) params.set("sourceProjectId", options.sourceProjectId);
    if (options.sourceEpisodeId) params.set("sourceEpisodeId", options.sourceEpisodeId);
    return `/original-workflow?${params.toString()}`;
}

export function generationStatusLabel(status?: PackageGenerationStatus) {
    if (status === "checking") return "预检中";
    if (status === "creating") return "创建中";
    if (status === "queued") return "排队中";
    if (status === "running") return "生成中";
    if (status === "succeeded") return "已生成";
    if (status === "failed") return "失败";
    if (status === "cancelled") return "已取消";
    return "待生成";
}

export function formatBytes(bytes: number) {
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

export function readGenerationList(value: unknown) {
    if (Array.isArray(value)) return value.flatMap((item) => (readRecord(item) ? [item as Record<string, unknown>] : []));
    const record = readRecord(value);
    return record ? [record] : [];
}
