"use client";

import { BookOpen, CheckSquare, ClipboardPaste, Download, FolderPlus, History, ImagePlus, LoaderCircle, MoreHorizontal, PenLine, Plus, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Checkbox, Drawer, Dropdown, Empty, Image, Input, Modal, Tag, Typography } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { saveAs } from "file-saver";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { createUserScopedLocalForage } from "@/lib/user-scoped-localforage";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { archiveLocalMediaToProjectCache } from "@/services/project-cache-archive";
import { projectCacheContextFromGeneration } from "@/services/project-cache-context";
import { deleteStoredImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useLocalAiTaskLogStore } from "@/stores/use-local-ai-task-log-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import { buildAssetVersionReference } from "../assets/asset-version-references";
import { buildWorkflowGeneratedImagePatch, workflowAssetInfo } from "../assets/workflow-asset-image";
import { useImageBriefStore } from "../canvas/stores/use-image-brief-store";
import { useProductionBibleStore } from "../canvas/stores/use-production-bible-store";
import type { ArtifactEnvelope } from "@/services/api/invocations";
import type { CapabilityConsumeTrace } from "@/components/capability-runtime/use-capability-run";
import { buildImageCapabilityTrace, imagePromptFromArtifacts, imageRenditionsFromArtifacts, type ImageCapabilityTrace } from "./image-capability-context";
import { StoryboardImageWorkbench } from "./storyboard-image-workbench";
import { isAssetImageWorkbenchContext } from "./storyboard-workbench";

const CapabilityRunDrawer = dynamic(() => import("@/components/capability-runtime/capability-run-drawer").then((module) => module.CapabilityRunDrawer), { ssr: false });

type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
    capabilityTrace?: ImageCapabilityTrace;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "成功" | "失败";
    images: GeneratedImage[];
    thumbnails: string[];
    capabilityTrace?: ImageCapabilityTrace;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
type ImageWorkbenchSourceContext = {
    assetId: string;
    briefId: string;
    episodeId: string;
    episodeTitle: string;
    libraryAssetId: string;
    projectId: string;
    projectTitle: string;
    prompt: string;
    source: string;
    title: string;
};
type ImageCapabilityState = { prompt: string; trace: ImageCapabilityTrace; updatedAt: string };

const logStore = createUserScopedLocalForage("image_generation_logs");
const capabilityStateStore = createUserScopedLocalForage("image_capability_state");
const emptyImageWorkbenchSourceContext: ImageWorkbenchSourceContext = {
    assetId: "",
    briefId: "",
    episodeId: "",
    episodeTitle: "",
    libraryAssetId: "",
    projectId: "",
    projectTitle: "",
    prompt: "",
    source: "",
    title: "",
};

function referenceToken(index: number) {
    return `@参考图${index + 1}`;
}

function insertPromptText(current: string, text: string, textarea?: HTMLTextAreaElement | null) {
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const prefix = current.slice(0, start);
    const suffix = current.slice(end);
    const leadingSpace = prefix && !/\s$/.test(prefix) ? " " : "";
    const trailingSpace = suffix && !/^\s/.test(suffix) ? " " : "";
    const nextText = `${prefix}${leadingSpace}${text}${trailingSpace}${suffix}`;
    return { text: nextText, caret: prefix.length + leadingSpace.length + text.length };
}

function hasReferenceToken(prompt: string, token: string) {
    return new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(prompt);
}

function buildReferencePrompt(prompt: string, references: ReferenceImage[]) {
    const lines = references
        .map((item, index) => ({ item, index, token: referenceToken(index) }))
        .filter(({ token }) => hasReferenceToken(prompt, token))
        .map(({ item, index, token }) => `${token} 对应随请求附带的第 ${index + 1} 张参考图${item.name ? `（${item.name.replace(/\s+/g, " ").trim().slice(0, 40)}）` : ""}。`);
    return lines.length ? `${prompt}\n\n参考图引用：\n${lines.join("\n")}` : prompt;
}

export default function ImagePage() {
    const searchParams = useSearchParams();
    return isAssetImageWorkbenchContext(searchParams) ? <AssetImageWorkbench /> : <StoryboardImageWorkbench />;
}

export function AssetImageWorkbench() {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptInputRef = useRef<TextAreaRef>(null);
    const importedContextRef = useRef("");
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const allowCustomModel = useConfigStore((state) => state.publicSettings?.modelChannel.allowCustomChannel !== false);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const token = useUserStore((state) => state.token);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const addBriefResultAsset = useImageBriefStore((state) => state.addResultAsset);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const updateProductionBibleItem = useProductionBibleStore((state) => state.updateItem);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [sourceContext, setSourceContext] = useState<ImageWorkbenchSourceContext>(emptyImageWorkbenchSourceContext);
    const [capabilityOpen, setCapabilityOpen] = useState(false);
    const [capabilityTrace, setCapabilityTrace] = useState<ImageCapabilityTrace>();

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));
    const sourceContextLabel = sourceContext.projectId ? [sourceContext.projectTitle || "项目", sourceContext.episodeTitle, sourceContext.title || sourceContext.briefId || sourceContext.assetId].filter(Boolean).join(" / ") : "";

    const insertReferenceToken = (index: number) => {
        const token = referenceToken(index);
        const textarea = promptInputRef.current?.resizableTextArea?.textArea;
        setPrompt((current) => {
            const next = insertPromptText(current, token, textarea);
            requestAnimationFrame(() => {
                promptInputRef.current?.focus();
                textarea?.setSelectionRange(next.caret, next.caret);
            });
            return next.text;
        });
    };

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    useEffect(() => {
        const nextContext = parseImageWorkbenchSourceContext();
        const nextKey = [nextContext.projectId, nextContext.episodeId, nextContext.assetId, nextContext.briefId, nextContext.prompt].join("|");
        setSourceContext(nextContext);
        let active = true;
        void capabilityStateStore.getItem<ImageCapabilityState>(imageCapabilityStorageKey(nextContext)).then((stored) => {
            if (!active) return;
            if (stored?.prompt.trim() && stored.trace?.invocationId) {
                importedContextRef.current = nextKey;
                setPrompt(stored.prompt);
                setCapabilityTrace(stored.trace);
                setPreviewLog(null);
                setResults([]);
                return;
            }
            setCapabilityTrace(undefined);
            if (!nextContext.prompt || importedContextRef.current === nextKey) return;
            importedContextRef.current = nextKey;
            setPrompt(nextContext.prompt);
            setPreviewLog(null);
            setResults([]);
            message.success("已带入单集生图需求提示词");
        }).catch(() => undefined);
        return () => { active = false; };
    }, [message]);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences]);
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            const nextReferences = await Promise.all(
                blobs.map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences]);
            message.success(`已读取 ${nextReferences.length} 张参考图`);
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    const consumeCapabilityArtifacts = async (artifacts: ArtifactEnvelope[], trace: CapabilityConsumeTrace) => {
        const runtimeRenditions = imageRenditionsFromArtifacts(artifacts, trace);
        if (runtimeRenditions.length) {
            const images = await Promise.all(runtimeRenditions.map(async (rendition) => {
                const stored = await uploadImage(rendition.mediaRef);
                return {
                    id: rendition.renditionId,
                    dataUrl: stored.url,
                    storageKey: stored.storageKey,
                    durationMs: 0,
                    width: stored.width,
                    height: stored.height,
                    bytes: stored.bytes,
                    mimeType: stored.mimeType,
                    capabilityTrace: rendition.trace,
                } satisfies GeneratedImage;
            }));
            const nextTrace = buildImageCapabilityTrace(trace);
            const logPrompt = prompt.trim() || `${runtimeRenditions[0].assetId} · Skill 资产成图`;
            const runtimeModel = runtimeRenditions.find((item) => item.model)?.model || "Invocation Runtime";
            setCapabilityTrace(nextTrace);
            setPreviewLog(null);
            setResults(images.map((image) => ({ id: image.id, status: "success", image })));
            saveLog(buildLog({
                prompt: logPrompt,
                model: runtimeModel,
                config: { model: runtimeModel, imageModel: runtimeModel, quality: "", size: `${images[0].width}x${images[0].height}`, count: String(images.length) },
                references: [],
                durationMs: 0,
                successCount: images.length,
                failCount: 0,
                status: "成功",
                images,
                capabilityTrace: nextTrace,
            }));
            await capabilityStateStore.setItem<ImageCapabilityState>(imageCapabilityStorageKey(sourceContext), { prompt: logPrompt, trace: nextTrace, updatedAt: nextTrace.appliedAt });
            return;
        }
        const nextPrompt = imagePromptFromArtifacts(artifacts, { approved: true, assetId: sourceContext.assetId });
        if (!nextPrompt) throw new Error("已批准 Artifact-set 中没有可用的图片提示词");
        const nextTrace = buildImageCapabilityTrace(trace);
        setPrompt(nextPrompt);
        setCapabilityTrace(nextTrace);
        setPreviewLog(null);
        setResults([]);
        await capabilityStateStore.setItem<ImageCapabilityState>(imageCapabilityStorageKey(sourceContext), { prompt: nextPrompt, trace: nextTrace, updatedAt: nextTrace.appliedAt });
    };

    const generate = async () => {
        const text = prompt.trim();
        if (!text) {
            message.error("请输入生图提示词");
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning("请先完成配置");
            openConfigDialog(true);
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;

        setElapsedMs(0);
        setRunning(true);
        setPreviewLog(null);
        setResults(Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        const tasks = Array.from({ length: generationCount }, (_, index) => runGenerationSlot(index, snapshot));

        const result = await Promise.allSettled(tasks);
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");

        try {
            const logImages = await Promise.all(
                successImages.map(async (image) => {
                    const stored = await uploadImage(image.dataUrl);
                    return { ...image, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
                }),
            );
            if (token) {
                logImages.forEach((image, index) => {
                    if (!image.storageKey) return;
                    const context = projectCacheContextFromGeneration({
                        assetId: sourceContext.assetId,
                        episodeId: sourceContext.episodeId,
                        episodeName: sourceContext.episodeTitle,
                        kind: "image",
                        projectId: sourceContext.projectId,
                        projectName: sourceContext.projectTitle,
                        prompt: text,
                        source: "image-page",
                        metadata: {},
                    });
                    void archiveLocalMediaToProjectCache({ id: `image-page:${image.id}`, storageKey: image.storageKey, kind: "image", filename: `image-${index + 1}.png`, context, token }).catch(() => undefined);
                });
            }
            saveLog(
                buildLog({
                    prompt: text,
                    model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    status: successCount ? "成功" : "失败",
                    images: logImages,
                    capabilityTrace,
                }),
            );
            if (successCount) message.success("图片已生成");
            else message.error(failed?.reason instanceof Error ? failed.reason.message : "生成失败");
        } finally {
            setRunning(false);
        }
    };

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `image-${index + 1}.png`);
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success("已加入参考图");
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        const resultTrace = image.capabilityTrace || capabilityTrace;
        const sourceAsset = sourceContext.libraryAssetId ? useAssetStore.getState().assets.find((asset) => asset.id === sourceContext.libraryAssetId) : undefined;
        let assetId = "";
        let savedAsset: Pick<Asset, "id" | "metadata" | "updatedAt"> | undefined;
        if (sourceAsset && workflowAssetInfo(sourceAsset)) {
            const now = new Date().toISOString();
            const patch = buildWorkflowGeneratedImagePatch(sourceAsset, stored, { config: { ...effectiveConfig, model, count: "1" }, model });
            const tracedPatch = resultTrace ? { ...patch, metadata: { ...patch.metadata, capabilityTrace: resultTrace } } : patch;
            updateAsset(sourceAsset.id, tracedPatch);
            assetId = sourceAsset.id;
            savedAsset = { id: sourceAsset.id, metadata: { ...sourceAsset.metadata, ...tracedPatch.metadata }, updatedAt: now };
        } else {
            assetId = await addAssetOnce({
                kind: "image",
                title: `生成结果 ${index + 1}`,
                coverUrl: stored.url,
                tags: [],
                source: "生图工作台",
                data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
                metadata: {
                    source: "image-page",
                    generation: { prompt, index: index + 1 },
                    projectId: sourceContext.projectId,
                    episodeId: sourceContext.episodeId,
                    imageBriefId: sourceContext.briefId,
                    assetBreakdownItemId: sourceContext.assetId,
                    productionBibleItemId: sourceContext.assetId,
                    ...(resultTrace ? { capabilityTrace: resultTrace } : {}),
                },
            });
            savedAsset = useAssetStore.getState().assets.find((asset) => asset.id === assetId);
        }
        const linkedBibleItem = productionBibleItems.find((item) => item.id === sourceContext.assetId && (!sourceContext.projectId || item.projectId === sourceContext.projectId));
        if (linkedBibleItem) {
            const nextRefs = linkedBibleItem.assetRefs.some((ref) => ref.assetId === assetId)
                ? linkedBibleItem.assetRefs
                : [...linkedBibleItem.assetRefs, savedAsset ? { assetId, assetVersion: buildAssetVersionReference(savedAsset), role: "generated_reference" } : { assetId, role: "generated_reference" }];
            updateProductionBibleItem(linkedBibleItem.id, { assetRefs: nextRefs });
        }
        if (sourceAsset && workflowAssetInfo(sourceAsset)) {
            message.success(linkedBibleItem ? "已回写到视频工作流素材卡，并绑定到设定库" : "已回写到视频工作流素材卡");
            return;
        }
        if (sourceContext.briefId) {
            addBriefResultAsset(sourceContext.briefId, assetId);
            message.success(linkedBibleItem ? "已加入我的素材，并回写到当前 Brief 和设定库" : "已加入我的素材，并回写到当前 Brief");
            return;
        }
        message.success(linkedBibleItem ? "已加入我的素材，并绑定到当前设定库资产" : "已加入我的素材");
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        void capabilityStateStore.removeItem(imageCapabilityStorageKey(sourceContext));
        setPrompt("");
        setCapabilityTrace(undefined);
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(refreshLogs);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = (log: GenerationLog) => {
        void logStore.setItem(log.id, serializeLog(log)).then(refreshLogs);
    };

    const refreshLogs = async () => setLogs(await readStoredLogs());

    const previewGenerationLog = async (log: GenerationLog) => {
        const hydratedLog = await normalizeLog(log, true);
        setPreviewLog(hydratedLog);
        setLogsOpen(false);
        setPrompt(hydratedLog.prompt);
        setCapabilityTrace(hydratedLog.capabilityTrace);
        setReferences(hydratedLog.references || []);
        if (hydratedLog.config.imageModel || hydratedLog.model) updateConfig("imageModel", hydratedLog.config.imageModel || hydratedLog.model);
        if (hydratedLog.config.quality) updateConfig("quality", hydratedLog.config.quality);
        if (hydratedLog.config.size) updateConfig("size", hydratedLog.config.size);
        if (hydratedLog.config.count) updateConfig("count", hydratedLog.config.count);
        setResults(hydratedLog.images.map((image) => ({ id: image.id, status: "success", image })));
    };

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error("请输入生图提示词");
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning("请先完成配置");
            openConfigDialog(true);
            return null;
        }
        return { text, requestText: buildReferencePrompt(text, references), config: { ...effectiveConfig, model, count: "1" }, references: [...references] };
    };

    const runGenerationSlot = async (index: number, snapshot: { text: string; requestText: string; config: AiConfig; references: ReferenceImage[] }) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length
                ? await requestEdit(snapshot.config, snapshot.requestText, snapshot.references, undefined, {
                      projectId: sourceContext.projectId || "local-image-workbench",
                      sourceType: "image_generation",
                      sourceId: sourceContext.briefId || sourceContext.assetId || "image-page",
                      inputSummary: summarizeLocalImageInput(snapshot.text, snapshot.references.length),
                  })
                : await requestGeneration(snapshot.config, snapshot.requestText, undefined, {
                      projectId: sourceContext.projectId || "local-image-workbench",
                      sourceType: "image_generation",
                      sourceId: sourceContext.briefId || sourceContext.assetId || "image-page",
                      inputSummary: summarizeLocalImageInput(snapshot.text, 0),
                  });
            const image = result[0];
            if (!image) throw new Error("接口没有返回图片");
            const meta = await readImageMeta(image.dataUrl);
            const nextImage = { id: image.id, dataUrl: image.dataUrl, durationMs: performance.now() - itemStartedAt, width: meta.width, height: meta.height, bytes: getDataUrlByteSize(image.dataUrl) };
            if (image.localAiTaskId) updateLocalImageResultSize(image.localAiTaskId, meta.width, meta.height);
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : "生成失败" }));
            throw error;
        }
    };

    const retryResult = (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        void runGenerationSlot(index, snapshot).catch(() => {});
    };

    return (
        <div className="studio-workspace flex h-full flex-col overflow-hidden bg-[var(--studio-shell-bg)] text-[var(--studio-text-primary)]">
            <main className="studio-shell grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden 2xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="studio-rail thin-scrollbar hidden min-h-0 overflow-y-auto p-3 lg:block">
                    <LogPanel
                        logs={logs}
                        selectedLogIds={selectedLogIds}
                        activeLogId={previewLog?.id}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={() => setDeleteConfirmOpen(true)}
                        onPreviewLog={(log) => void previewGenerationLog(log)}
                    />
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:grid-cols-[minmax(420px,1fr)_minmax(420px,480px)] lg:overflow-hidden 2xl:grid-cols-[minmax(520px,1fr)_minmax(460px,520px)]">
                    <div className="studio-panel thin-scrollbar flex flex-col p-4 lg:order-2 lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-5 flex items-start justify-between gap-3 border-b border-[var(--studio-border-subtle)] pb-4">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">图片生成</div>
                                <h1 className="mt-2 text-2xl font-semibold leading-tight text-[var(--studio-text-primary)]">生图工作台</h1>
                                {sourceContextLabel ? <p className="mt-2 break-words text-sm leading-5 text-[var(--studio-text-secondary)]">来自：{sourceContextLabel}</p> : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                <div className="flex gap-2 lg:hidden">
                                    <Button icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                        记录
                                    </Button>
                                    <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                        参数
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold text-[var(--studio-text-primary)]">提示词</span>
                                    <div className="flex gap-2">
                                        <Button size="middle" icon={<BookOpen className="size-3.5" />} onClick={() => setPromptDialogOpen(true)}>
                                            提示词库
                                        </Button>
                                        <Button size="middle" icon={<Sparkles className="size-3.5" />} onClick={() => setCapabilityOpen(true)}>
                                            Skill 能力
                                        </Button>
                                    </div>
                                </div>
                                <Input.TextArea
                                    ref={promptInputRef}
                                    className="!rounded-md !border-[var(--studio-border-subtle)] !bg-[var(--studio-control-bg)] !p-4 !text-[15px] !leading-6"
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    rows={6}
                                    placeholder="描述画面主体、风格、构图、光线和用途；可点击参考图上的 @参考图1 插入引用"
                                />
                            </div>

                            <div className="min-w-0">
                                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-base font-semibold text-[var(--studio-text-primary)]">参考图</span>
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="middle" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            素材库
                                        </Button>
                                        <Button size="middle" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addReferencesFromClipboard()}>
                                            剪切板
                                        </Button>
                                        <Button size="middle" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                            上传
                                        </Button>
                                    </div>
                                </div>
                                <div
                                    className="hover-scrollbar hover-scrollbar-hint flex min-h-28 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-md border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] p-2 pb-3 overscroll-x-contain"
                                    onWheel={(event) => {
                                        if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                        event.preventDefault();
                                        event.currentTarget.scrollLeft += event.deltaY;
                                    }}
                                >
                                    {references.map((item, index) => (
                                        <div key={item.id} className="group relative size-24 shrink-0 overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)]">
                                            <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                                            <button
                                                type="button"
                                                className="absolute left-1 top-1 rounded bg-[color-mix(in_srgb,var(--studio-panel-bg)_86%,transparent)] px-1.5 py-0.5 text-xs font-medium text-[var(--studio-text-primary)] shadow-sm backdrop-blur transition hover:bg-[var(--studio-accent)] hover:text-white"
                                                onClick={() => insertReferenceToken(index)}
                                                title={`插入 ${referenceToken(index)} 到提示词`}
                                                aria-label={`插入 ${referenceToken(index)} 到提示词`}
                                            >
                                                {referenceToken(index)}
                                            </button>
                                            <button
                                                type="button"
                                                className="absolute right-1 top-1 hidden size-7 items-center justify-center rounded bg-[color-mix(in_srgb,var(--studio-panel-bg)_86%,transparent)] text-[var(--studio-text-primary)] backdrop-blur transition hover:bg-[var(--studio-hover-bg)] group-hover:flex"
                                                onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                aria-label="移除参考图"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {!references.length ? <div className="flex min-w-full items-center justify-center text-sm text-[var(--studio-text-muted)]">暂无参考图</div> : null}
                                </div>
                            </div>

                            <div className="studio-toolbar flex items-center justify-between px-3 py-2 text-sm sm:hidden">
                                <span className="truncate text-[var(--studio-text-secondary)]">
                                    {model} · {effectiveConfig.size} · {effectiveConfig.quality}
                                </span>
                                <Button size="middle" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    调整
                                </Button>
                            </div>

                            <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-1">
                                <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} allowCustomModel={allowCustomModel} compact />
                            </div>
                        </div>

                        <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-4 pb-1 pt-5 lg:-mx-5 lg:px-5">
                            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--studio-text-muted)]">
                                <span className="truncate">{prompt.trim() ? `将生成 ${generationCount} 张图片` : "先写一句画面描述，再开始生成"}</span>
                                <span className="shrink-0">{running ? `已等待 ${formatDuration(elapsedMs)}` : effectiveConfig.size}</span>
                            </div>
                            <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()}>
                                开始生成
                            </Button>
                        </div>
                    </div>

                    <div className="studio-panel thin-scrollbar flex min-h-[420px] flex-col p-4 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--studio-border-subtle)] pb-4">
                            <div>
                                <h2 className="text-2xl font-semibold text-[var(--studio-text-primary)]">生成结果</h2>
                                <p className="mt-1 text-sm text-[var(--studio-text-muted)]">{results.length ? `${results.length} 个生成槽位` : "生成后的图片会显示在这里"}</p>
                            </div>
                            {running ? <Tag className="studio-tag px-2 py-1">等待 {formatDuration(elapsedMs)}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                                {results.map((result, index) =>
                                    result.status === "success" && result.image ? (
                                        <ResultImageCard key={result.id} image={result.image} index={index} onEdit={addResultToReferences} onDownload={downloadImage} onSaveAsset={saveResultToAssets} />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || "生成失败"} onRetry={() => retryResult(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-md border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] text-center lg:min-h-[560px]">
                                <ImagePlus className="mb-4 size-11 text-[var(--studio-text-muted)]" />
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有生成图片" />
                            </div>
                        )}
                    </div>
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer rootClassName="studio-modal" title="生成记录" placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Drawer>
            <Drawer rootClassName="studio-modal" title="参数" placement="bottom" size="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} allowCustomModel={allowCustomModel} />
                </div>
            </Drawer>
            <CapabilityRunDrawer
                open={capabilityOpen}
                onClose={() => setCapabilityOpen(false)}
                source="image"
                projectId={sourceContext.projectId || "local-image-workbench"}
                episodeId={sourceContext.episodeId}
                sourceText={prompt}
                targetKind="prompt"
                targetId={imageCapabilityTargetId(sourceContext)}
                onConsume={consumeCapabilityArtifacts}
            />
            <PromptSelectDialog
                open={promptDialogOpen}
                projectId={sourceContext.projectId || undefined}
                nodeGroup="image"
                onOpenChange={setPromptDialogOpen}
                onSelect={(value) => {
                    setPrompt(value);
                    setCapabilityTrace(undefined);
                    void capabilityStateStore.removeItem(imageCapabilityStorageKey(sourceContext));
                }}
            />
            <AssetPickerModal open={assetPickerOpen} title="选择参考图素材" defaultTab="library" defaultKind="image" allowedKinds={["image"]} onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal rootClassName="studio-modal" title="删除生成记录" open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除选中的 {selectedLogIds.length} 条生成记录吗？
            </Modal>
        </div>
    );
}

function GenerationSettings({
    allowCustomModel,
    config,
    model,
    updateConfig,
    openConfigDialog,
    compact = false,
}: {
    allowCustomModel: boolean;
    config: AiConfig;
    model: string;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    compact?: boolean;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <>
            <label className={compact ? "block min-w-0" : "col-span-2 block min-w-0 sm:col-span-1"}>
                <span className={compact ? "mb-1.5 block text-sm font-semibold text-[var(--studio-text-primary)]" : "mb-1.5 block text-sm font-semibold text-[var(--studio-text-primary)] sm:mb-2 sm:text-base"}>模型</span>
                <ModelPicker config={config} modelType="image" value={model} onChange={(value) => updateConfig("imageModel", value)} fullWidth allowCustomModel={allowCustomModel} onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <div className={compact ? "" : "col-span-2"}>
                <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className={compact ? "space-y-3" : "space-y-4"} maxCount={10} quickCount={compact ? 4 : 10} compact={compact} />
            </div>
        </>
    );
}

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
}) {
    const aspectRatio = resultImageAspectRatio(image);

    return (
        <div className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] transition hover:border-[var(--studio-border-strong)]">
            <div className="overflow-hidden bg-[var(--studio-control-bg)]" style={{ aspectRatio }}>
                <Image
                    src={image.dataUrl}
                    alt={`生成结果 ${index + 1}`}
                    styles={{
                        root: { display: "block", width: "100%", height: "100%" },
                        image: { display: "block", width: "100%", height: "100%", objectFit: "contain" },
                    }}
                />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--studio-border-subtle)] px-3 py-3">
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm text-[var(--studio-text-secondary)]">
                    <span>
                        {image.width}x{image.height}
                    </span>
                    <span>{formatBytes(image.bytes)}</span>
                    <span>{formatDuration(image.durationMs)}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button type="primary" size="middle" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)}>
                        保存
                    </Button>
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "reference", icon: <PenLine className="size-3.5" />, label: "发送到参考图" },
                                { key: "download", icon: <Download className="size-3.5" />, label: "下载" },
                            ],
                            onClick: ({ key }) => {
                                if (key === "reference") void onEdit(image, index);
                                if (key === "download") onDownload(image, index);
                            },
                        }}
                    >
                        <Button size="middle" icon={<MoreHorizontal className="size-3.5" />} aria-label="更多结果动作" />
                    </Dropdown>
                </div>
            </div>
        </div>
    );
}

function resultImageAspectRatio(image: Pick<GeneratedImage, "width" | "height">) {
    const width = image.width > 0 ? image.width : 1;
    const height = image.height > 0 ? image.height : 1;
    return `${width} / ${height}`;
}

function PendingImageCard() {
    return (
        <div className="relative aspect-square overflow-hidden rounded-md border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)]">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "linear-gradient(135deg, var(--studio-accent-soft) 0, transparent 42%), linear-gradient(var(--studio-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--studio-border-subtle) 1px, transparent 1px)",
                    backgroundSize: "100% 100%, 24px 24px, 24px 24px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-[var(--studio-text-secondary)]">
                <LoaderCircle className="size-6 animate-spin text-[var(--studio-accent)]" />
                <span>生成中</span>
            </div>
        </div>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <div className="studio-semantic-danger studio-semantic-notice overflow-hidden rounded-lg border">
            <div className="flex aspect-square flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium">生成失败</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-[var(--studio-danger)]">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-[var(--studio-semantic-border)] p-3">
                <Button size="middle" danger onClick={onRetry}>
                    重试
                </Button>
            </div>
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function updateLocalImageResultSize(localAiTaskId: string, width: number, height: number) {
    const resultImageSize = `${width}x${height}`;
    useLocalAiTaskLogStore.getState().updateTask(localAiTaskId, {
        resultImageSize,
        outputSummary: `图片已生成，返回尺寸 ${resultImageSize}`,
    });
}

function summarizeLocalImageInput(prompt: string, referenceCount: number) {
    const text = prompt.replace(/\s+/g, " ").trim();
    const summary = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    return referenceCount ? `${summary || "生图提示词为空"}；参考图 ${referenceCount} 张` : summary || "生图提示词为空";
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--studio-text-primary)]">生成记录</h2>
                    <p className="mt-1 text-xs text-[var(--studio-text-muted)]">历史任务与结果回看</p>
                </div>
                <Tag className="studio-tag">{logs.length}</Tag>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
                <Button size="middle" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    新建
                </Button>
                <Button size="middle" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? "取消" : "全选"}
                </Button>
                <Button className="col-span-2" size="middle" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    删除
                </Button>
            </div>
            <div className="space-y-2.5">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!logs.length ? (
                    <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] text-center text-sm text-[var(--studio-text-muted)]">暂无生成记录</div>
                ) : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const thumbnails = (log.thumbnails || []).filter((image) => image.trim());
    return (
        <button
            type="button"
            className={`group block w-full rounded-md border p-3 text-left transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]"}`}
            onClick={onClick}
        >
            <div className="grid gap-3">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                    <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5 text-[var(--studio-text-primary)]">{log.title}</div>
                        {thumbnails.length ? (
                            <div className="mt-2 flex gap-1 overflow-hidden">
                                {thumbnails.slice(0, 4).map((image, index) => (
                                    <img key={`${log.id}-${index}`} src={image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="grid gap-2 pl-6">
                    <div className="flex flex-wrap gap-1">
                        <Tag className="studio-tag flex h-6 items-center px-1.5 text-xs leading-none">成功 {log.successCount ?? log.imageCount}</Tag>
                        {log.failCount ? <Tag className="studio-semantic-danger studio-semantic-tag flex h-6 items-center px-1.5 text-xs leading-none">失败 {log.failCount}</Tag> : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <Tag className="studio-tag flex h-6 items-center px-1.5 text-xs leading-none">{log.imageCount} 张</Tag>
                        <Tag className="studio-tag flex h-6 items-center px-1.5 text-xs leading-none">{formatDuration(log.durationMs)}</Tag>
                    </div>
                    <div className="flex">
                        <Tag className="studio-tag flex h-6 items-center px-1.5 text-xs leading-none">{log.time}</Tag>
                    </div>
                </div>
            </div>
        </button>
    );
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const values: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            values.push(value);
        });
        const logs = await Promise.all(values.map((value) => normalizeLog(value, false)));
        return logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>, resolveMedia = true): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: resolveMedia ? await resolveImageUrl(item.storageKey, item.dataUrl) : item.dataUrl,
        })),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => ({
            ...item,
            dataUrl: resolveMedia ? await resolveImageUrl(item.storageKey, item.dataUrl) : item.dataUrl,
        })),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || "未命名",
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString("zh-CN", { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || "成功",
        images,
        thumbnails: images.map((image) => image.dataUrl).filter((image) => image.trim()),
        capabilityTrace: log.capabilityTrace,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
        thumbnails: [],
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
    };
}

function parseImageWorkbenchSourceContext(): ImageWorkbenchSourceContext {
    if (typeof window === "undefined") return emptyImageWorkbenchSourceContext;
    const params = new URLSearchParams(window.location.search);
    return {
        assetId: params.get("assetId") || "",
        briefId: params.get("briefId") || "",
        episodeId: params.get("episodeId") || "",
        episodeTitle: params.get("episodeTitle") || "",
        libraryAssetId: params.get("libraryAssetId") || "",
        projectId: params.get("projectId") || "",
        projectTitle: params.get("projectTitle") || "",
        prompt: params.get("prompt") || "",
        source: params.get("source") || "",
        title: params.get("title") || "",
    };
}

function imageCapabilityTargetId(context: ImageWorkbenchSourceContext) {
    return (context.assetId || context.briefId || context.libraryAssetId || "image-workbench").slice(0, 128);
}

function imageCapabilityStorageKey(context: ImageWorkbenchSourceContext) {
    return [context.projectId || "local-image-workbench", context.episodeId || "project", imageCapabilityTargetId(context)].map(encodeURIComponent).join(":");
}

function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
    capabilityTrace,
}: {
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
    capabilityTrace?: ImageCapabilityTrace;
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        quality: config.quality,
        size: config.size,
        count: config.count,
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || "未命名",
        prompt,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
        thumbnails: images.map((image) => image.dataUrl),
        capabilityTrace,
    };
}
