"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, AudioLines, FilePlus2, FileText, Home, ImageIcon, Link2, List, Menu, MessageSquare, Plus, Redo2, Save, Settings2, Trash2, Undo2, Upload, Video } from "lucide-react";

import { recordAiTaskFrontendArtifact } from "@/services/api/ai-task-trace";
import { fetchVideoTaskContent, refreshVideoTask } from "@/services/api/video";
import { defaultConfig, type AiConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import { resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { useAssetStore } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences, updateAssetReferenceToLatest } from "../../assets/asset-version-references";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { applyAssistantCanvasActions, type AssistantCanvasAction } from "../utils/canvas-assistant-actions";
import { removeVariantVideoConnections } from "../utils/canvas-connection-cleanup";
import { buildGenerationConfig } from "../utils/canvas-generation-config";
import { buildCanvasVideoDefaultsPatch } from "../utils/canvas-video-config";
import { videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { buildGeneratedVideoAsset } from "../utils/canvas-generated-asset";
import { canvasNodeToAsset } from "../utils/canvas-assets";
import { canvasAssetReferenceMetadata } from "../utils/canvas-asset-reference";
import { canvasEpisodeContextFromCanvas, canvasEpisodeLabel } from "../utils/canvas-episode-context";
import { buildImageBriefImageConfigNode, buildImageBriefResultPatch, buildProductionBibleBriefAssetRefs, type ImageBrief } from "../utils/image-brief";
import { buildReferenceMentionOptions } from "../utils/canvas-reference-mentions";
import { buildInsertedMediaAssetNode } from "../utils/canvas-inserted-media-node";
import { resetInterruptedGeneration } from "../utils/canvas-video-task-recovery";
import { placeCanvasNodeAwayFromNodes } from "../utils/canvas-node-placement";
import { aiTaskIdFromGeneration, buildFrontendArtifactTrace } from "../utils/canvas-ai-task-trace";
import { isHiddenBatchChild, isHiddenBatchConnectionEndpoint, setBatchPrimaryInNodes, toggleBatchExpandedInNodes } from "../utils/canvas-batch-nodes";
import { applyCanvasProjectPresetToConfig } from "../utils/canvas-project-preset";
import { getNodeProductionPackageId, getNodeProductionPackageRole, productionPackageRoleLabel, type CanvasProductionPackageSummary } from "../utils/canvas-production-packages";
import type { PromptReviewResult } from "../utils/canvas-prompt-review";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { useCanvasConnections } from "../hooks/use-canvas-connections";
import { useCanvasClipboardActions } from "../hooks/use-canvas-clipboard-actions";
import { useCanvasFileNodeActions } from "../hooks/use-canvas-file-node-actions";
import { useCanvasHistory } from "../hooks/use-canvas-history";
import { useCanvasKeyboardShortcuts } from "../hooks/use-canvas-keyboard-shortcuts";
import { useCanvasMediaCache } from "../hooks/use-canvas-media-cache";
import { useCanvasGenerationFlowActions } from "../hooks/use-canvas-generation-flow-actions";
import { useCanvasGenerationQueueRunner } from "../hooks/use-canvas-generation-queue-runner";
import { useCanvasGenerationRetryActions } from "../hooks/use-canvas-generation-retry-actions";
import { useCanvasNodeCrudActions } from "../hooks/use-canvas-node-crud-actions";
import { useCanvasNodeDrag } from "../hooks/use-canvas-node-drag";
import { useCanvasProductionPackageActions } from "../hooks/use-canvas-production-package-actions";
import { useCanvasProductionWorkbenchState } from "../hooks/use-canvas-production-workbench-state";
import { useCanvasSelectionBox } from "../hooks/use-canvas-selection-box";
import { useCanvasStoryboardCanvasActions } from "../hooks/use-canvas-storyboard-canvas-actions";
import { useCanvasImageGenerationActions } from "../hooks/use-canvas-image-generation-actions";
import { useCanvasNodeDerivativeActions } from "../hooks/use-canvas-node-derivative-actions";
import { useCanvasNodeReviewActions } from "../hooks/use-canvas-node-review-actions";
import { useCanvasNodeToolbarState } from "../hooks/use-canvas-node-toolbar-state";
import { useCanvasTextGenerationActions } from "../hooks/use-canvas-text-generation-actions";
import { useCanvasToolbarActions } from "../hooks/use-canvas-toolbar-actions";
import { useCanvasVideoGenerationActions } from "../hooks/use-canvas-video-generation-actions";
import { useCanvasVideoTaskRecovery } from "../hooks/use-canvas-video-task-recovery";
import { App, Button, Dropdown, Modal } from "antd";
import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH, getNodeSpec } from "../constants";
import { ActiveConnectionPath, ConnectionPath } from "../components/canvas-connections";
import { CanvasConfigNodePanel } from "../components/canvas-config-node-panel";
import { CanvasAssistantPanel } from "../components/canvas-assistant-panel";
import { CanvasContextInspector, type CanvasInspectorView } from "../components/canvas-context-inspector";
import { CanvasNodeContextMenu } from "../components/canvas-context-menu";
import { CanvasNodeAngleDialog } from "../components/canvas-node-angle-dialog";
import { CanvasNodeCropDialog } from "../components/canvas-node-crop-dialog";
import { buildNodeGenerationInputs, type NodeGenerationInput } from "../components/canvas-node-generation";
import { CanvasNodeHoverToolbar, type CanvasNodeHoverToolbarActions } from "../components/canvas-node-hover-toolbar";
import { CanvasNodeInfoModal } from "../components/canvas-node-info-modal";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { Minimap } from "../components/canvas-mini-map";
import { CanvasNode } from "../components/canvas-node";
import { CanvasNodePromptPanel } from "../components/canvas-node-prompt-panel";
import { CanvasToolbar } from "../components/canvas-toolbar";
import { CanvasStoryboardTimeline } from "../components/canvas-storyboard-timeline";
import { AssetPickerModal, type AssetPickerTab } from "../components/asset-picker-modal";
import { ImageBriefWorkbenchDrawer } from "../components/image-brief-workbench-drawer";
import { ScriptManagerDrawer } from "../components/script-manager-drawer";
import { StoryboardManagerDrawer } from "../components/storyboard-manager-drawer";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import type { InsertAssetPayload } from "../utils/asset-insert-payload";
import { useCanvasStore } from "../stores/use-canvas-store";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";

type AppModal = ReturnType<typeof App.useApp>["modal"];
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { useGenerationQueueStore } from "../stores/use-generation-queue-store";
import { useCreativeProjectStore } from "../../projects/use-creative-project-store";
import { CanvasNodeType, type CanvasAssistantImage, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ContextMenuState, type Position, type ViewportTransform } from "../types";

const NODE_STATUS_SUCCESS = "success" as const;

function createCanvasNode(type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
        },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage />;
}

function CanvasRefreshShell() {
    return (
        <main className="relative h-full min-h-0 overflow-hidden bg-background text-foreground">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />

            <div className="absolute bottom-5 left-1/2 z-50 flex h-14 -translate-x-1/2 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="size-8 rounded-md bg-current opacity-10" />
                ))}
            </div>

            <div className="absolute bottom-24 left-6 z-50 h-40 w-[240px] rounded-lg border shadow-2xl backdrop-blur-sm" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="absolute left-7 top-7 h-5 w-12 rounded-sm bg-current opacity-10" />
                <div className="absolute left-28 top-16 h-6 w-16 rounded-sm bg-current opacity-10" />
                <div className="absolute bottom-7 left-16 h-8 w-20 rounded-sm bg-current opacity-10" />
                <div className="absolute inset-5 rounded border border-current opacity-15" />
            </div>

            <div className="absolute bottom-5 left-5 z-50 flex h-14 w-[260px] items-center gap-2 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="h-1 flex-1 rounded-full bg-current opacity-10" />
                <div className="h-4 w-10 rounded bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
            </div>
        </main>
    );
}

function ConnectionCreateMenu({
    position,
    title = "引用该节点生成",
    onCreate,
    onClose,
}: {
    position: Position;
    title?: string;
    onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: position.x, top: position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {title}
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭">
                    ×
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<AudioLines className="size-5" />} title="音频参考" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-5" />} title="配置节点" description="模型、尺寸、数量和输入顺序" onClick={() => onCreate(CanvasNodeType.Config)} />
            </div>
        </div>
    );
}

function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition"
            style={{ color: theme.node.text }}
            onClick={onClick}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold leading-5">{title}</span>
                {description ? (
                    <span className="mt-1 block truncate text-sm" style={{ color: theme.node.muted }}>
                        {description}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

function InfiniteCanvasPage() {
    const { message, modal } = App.useApp();
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const canvasId = params.id;
    const focusNodeId = searchParams.get("focusNodeId") || "";
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const didInitialCenterRef = useRef(false);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handledFocusNodeIdRef = useRef("");

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
    const workspaceProjectId = currentProject?.projectId || canvasId;
    const workspaceProjectTitle = creativeProject?.title || currentProject?.title || "未命名画布";
    const canvasEpisodeContext = useMemo(() => canvasEpisodeContextFromCanvas(currentProject), [currentProject]);
    const canvasAiConfig = useMemo(() => applyCanvasProjectPresetToConfig(effectiveConfig, currentProject?.preset), [currentProject?.preset, effectiveConfig]);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const { downloadNodeMedia, cacheUploadedCanvasMedia } = useCanvasMediaCache({ token, message, setNodes });
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreateMenuPosition, setNodeCreateMenuPosition] = useState<Position | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTab, setAssetPickerTab] = useState<AssetPickerTab>("my-assets");
    const [scriptManagerOpen, setScriptManagerOpen] = useState(false);
    const [storyboardManagerOpen, setStoryboardManagerOpen] = useState(false);
    const [imageBriefOpen, setImageBriefOpen] = useState(false);
    const imageBriefInitialId = "";
    const imageBriefOpenRequestId = 0;
    const [storyboardInitialGroupId, setStoryboardInitialGroupId] = useState("");
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editRequestNonce, setEditRequestNonce] = useState(0);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [, setAssistantCollapsed] = useState(true);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [inspectorView, setInspectorView] = useState<CanvasInspectorView>("context");
    const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
    const [activeTimelineShotId, setActiveTimelineShotId] = useState("");
    const [activeProductionPackageId, setActiveProductionPackageId] = useState("");
    const [lastSelectedVideoNodeId, setLastSelectedVideoNodeId] = useState("");
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());

    const nodesRef = useRef(nodes);
    const recoveringVideoTaskIdsRef = useRef<Set<string>>(new Set());
    const processingQueueItemIdsRef = useRef<Set<string>>(new Set());
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const showImageGenerationError = useCallback((text: string) => message.error(text), [message]);
    const showVideoGenerationWarning = useCallback((text: string) => message.warning(text), [message]);
    const showCanvasSuccess = useCallback((text: string) => message.success(text), [message]);
    const archiveGeneratedAsset = useCallback(
        async (asset: Parameters<typeof addAssetOnce>[0]) => {
            const archivedAsset = asset.kind === "video" ? { ...asset, folderId: asset.folderId || ensureProjectFolder(workspaceProjectId, workspaceProjectTitle) } : asset;
            const assetId = await addAssetOnce(archivedAsset);
            const generation = asset.metadata?.generation as Record<string, unknown> | undefined;
            const aiTaskId = aiTaskIdFromGeneration(generation);
            if (aiTaskId) {
                const artifact = buildFrontendArtifactTrace({
                    assetId,
                    kind: asset.kind,
                    createdAt: new Date().toISOString(),
                    generation,
                    canvasId,
                    fallbackProjectId: workspaceProjectId,
                });
                if (artifact) void recordAiTaskFrontendArtifact(aiTaskId, artifact).catch(() => undefined);
            }
            const briefId = typeof generation?.briefId === "string" ? generation.briefId : "";
            if (briefId) {
                useImageBriefStore.getState().addResultAsset(briefId, assetId, "generated");
                const assetBreakdownItemId = typeof generation?.assetBreakdownItemId === "string" ? generation.assetBreakdownItemId : "";
                const productionBibleItemId = typeof generation?.productionBibleItemId === "string" ? generation.productionBibleItemId : "";
                if (assetBreakdownItemId) {
                    const item = useAssetBreakdownStore.getState().items.find((entry) => entry.id === assetBreakdownItemId);
                    if (item) useAssetBreakdownStore.getState().updateItem(item.id, buildImageBriefResultPatch(item, assetId));
                }
                if (productionBibleItemId) {
                    const item = useProductionBibleStore.getState().items.find((entry) => entry.id === productionBibleItemId);
                    if (item) {
                        const refs = buildProductionBibleBriefAssetRefs(item, assetId).assetRefs;
                        useProductionBibleStore.getState().updateItem(item.id, { assetRefs: preserveOrCreateAssetVersionReferences(refs, useAssetStore.getState().assets, item.assetRefs) });
                    }
                }
            }
            return assetId;
        },
        [addAssetOnce, canvasId, ensureProjectFolder, workspaceProjectId, workspaceProjectTitle],
    );
    const archiveGeneratedVideoNode = useCallback(
        async (node: CanvasNodeData, generationConfig: AiConfig, prompt = node.metadata?.prompt || "") => {
            const effectivePrompt = node.metadata?.finalPrompt || prompt;
            const asset = buildGeneratedVideoAsset(node, {
                projectId: workspaceProjectId,
                projectTitle: workspaceProjectTitle,
                projectPreset: currentProject?.preset,
                episodeContext: canvasEpisodeContext,
                prompt,
                effectivePrompt,
                config: generationConfig,
                createdAt: node.metadata?.finishedAt || node.metadata?.localStoredAt || new Date().toISOString(),
            });
            const assetId = asset ? await archiveGeneratedAsset(asset).catch(() => undefined) : undefined;
            if (typeof assetId === "string") setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, sourceAssetId: assetId } } : item)));
            return assetId;
        },
        [archiveGeneratedAsset, canvasEpisodeContext, currentProject?.preset, workspaceProjectId, workspaceProjectTitle],
    );
    const { generateImageNode } = useCanvasImageGenerationActions({
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        showError: showImageGenerationError,
        toImageMetadata: imageMetadata,
        projectId: workspaceProjectId,
        canvasId,
        projectTitle: workspaceProjectTitle,
        projectPreset: currentProject?.preset,
        episodeContext: canvasEpisodeContext,
        archiveGeneratedAsset,
    });
    const { generateTextNode, retryTextNode } = useCanvasTextGenerationActions({
        setNodes,
        setConnections,
    });
    const { generateVideoNode } = useCanvasVideoGenerationActions({
        setNodes,
        setConnections,
        getNodes: () => nodesRef.current,
        cacheUploadedCanvasMedia,
        showWarning: showVideoGenerationWarning,
        toVideoMetadata: videoMetadata,
        projectId: workspaceProjectId,
        canvasId,
        projectTitle: workspaceProjectTitle,
        projectPreset: currentProject?.preset,
        episodeContext: canvasEpisodeContext,
        archiveGeneratedAsset,
    });
    const { historyState, resetHistory, undoCanvas, redoCanvas, pauseHistory, resumeHistory, skipNextHistoryCommit, getCleanupHistory } = useCanvasHistory({
        projectId: canvasId,
        projectLoaded,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
        viewport,
        updateProject,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
        setBackgroundMode,
        setShowImageInfo,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
    });
    const { isNodeDragging, nodeDraggingRef, handleNodeMouseDown, finishNodeDrag, moveNodeDrag } = useCanvasNodeDrag({
        nodesRef,
        selectedNodeIdsRef,
        viewportRef,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setHoveredNodeId,
        setToolbarNodeId,
        setDialogNodeId,
        pauseHistory,
        resumeHistory,
    });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, ...getCleanupHistory() });
        },
        [cleanupAssetImages, getCleanupHistory],
    );

    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);
        const project = openProject(canvasId);
        if (!project) {
            router.replace("/projects");
            return;
        }

        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            const restoredConnections = removeVariantVideoConnections(restoredNodes, project.connections);
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            setNodes(restoredNodes);
            setConnections(restoredConnections);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            resetHistory({
                nodes: restoredNodes,
                connections: restoredConnections,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
            });
            setProjectLoaded(true);
        };
        void restore();
    }, [canvasId, hydrated, openProject, resetHistory, router]);

    useCanvasVideoTaskRecovery({
        projectLoaded,
        nodesRef,
        recoveringVideoTaskIdsRef,
        canvasAiConfig,
        cacheUploadedCanvasMedia,
        setNodes,
        toVideoMetadata: videoMetadata,
        archiveRecoveredVideoNode: archiveGeneratedVideoNode,
    });

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded || !focusNodeId || handledFocusNodeIdRef.current === focusNodeId) return;
        const node = nodes.find((item) => item.id === focusNodeId);
        if (!node || !size.width || !size.height) return;
        handledFocusNodeIdRef.current = focusNodeId;
        const k = viewportRef.current.k || 1;
        const centerX = node.position.x + node.width / 2;
        const centerY = node.position.y + node.height / 2;
        setSelectedNodeIds(new Set([focusNodeId]));
        setSelectedConnectionId(null);
        setDialogNodeId(focusNodeId);
        setViewport({
            x: size.width / 2 - centerX * k,
            y: size.height / 2 - centerY * k,
            k,
        });
        router.replace(`/canvas/${canvasId}`, { scroll: false });
    }, [canvasId, focusNodeId, nodes, projectLoaded, router, size.height, size.width]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
    }, [nodes, connections, selectedNodeIds, viewport]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const getAppendNodeCenter = useCallback(
        (type: CanvasNodeType) => {
            const anchor = selectedNodeIds.size === 1 ? nodesRef.current.find((node) => selectedNodeIds.has(node.id)) : nodesRef.current.at(-1);
            if (!anchor) return getCanvasCenter();
            const spec = getNodeSpec(type);
            return {
                x: anchor.position.x + anchor.width + 72 + spec.width / 2,
                y: anchor.position.y + anchor.height / 2,
            };
        },
        [getCanvasCenter, selectedNodeIds],
    );

    const { connectingParams, connectionTargetNodeId, pendingConnectionCreate, pendingConnectionCreateRef, mouseWorld, cancelPendingConnectionCreate, createConnectedNode, finishConnection, handleConnectStart, moveConnectionTarget } = useCanvasConnections(
        {
            nodesRef,
            connectionsRef,
            screenToCanvas,
            normalizeConnection,
            isNodeHidden: isHiddenBatchChild,
            createNode: createCanvasNode,
            configNodeMetadata: { model: canvasAiConfig.imageModel || canvasAiConfig.model, size: canvasAiConfig.size, count: 3 },
            showWarning: (text) => message.warning(text),
            setNodes,
            setConnections,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setContextMenu,
            setDialogNodeId,
        },
    );

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
            if (toolbarHideTimerRef.current) {
                clearTimeout(toolbarHideTimerRef.current);
                toolbarHideTimerRef.current = null;
            }
            setToolbarNodeId(nodeId);
        },
        [nodeDraggingRef, nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = setTimeout(() => {
            setToolbarNodeId(null);
            toolbarHideTimerRef.current = null;
        }, 120);
    }, []);

    const { selectionBox, handleCanvasMouseDown, moveSelectionBox, clearSelectionBox } = useCanvasSelectionBox({
        nodesRef,
        selectedNodeIdsRef,
        pendingConnectionCreateRef,
        screenToCanvas,
        isNodeHidden: isHiddenBatchChild,
        cancelPendingConnectionCreate,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
    });

    const visibleNodes = useMemo(() => {
        const padding = 280;
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + width / viewport.k + padding * 2;
        const viewBottom = viewTop + height / viewport.k + padding * 2;

        return nodes.filter((node) => !isHiddenBatchChild(node, nodes, collapsingBatchIds) && node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
    }, [collapsingBatchIds, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const assetTitleById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset.title])), [assets]);
    const { toolbarNode, infoNode, cropNode, angleNode, previewNode, hasNewAssetVersion } = useCanvasNodeToolbarState({
        nodeById,
        assetById,
        toolbarNodeId,
        infoNodeId,
        cropNodeId,
        angleNodeId,
        previewNodeId,
    });
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedInspectorNode = selectedNodeIds.size === 1 ? nodeById.get(Array.from(selectedNodeIds)[0]) || null : null;
    const selectedVideoNode = selectedInspectorNode?.type === CanvasNodeType.Video && selectedInspectorNode.metadata?.content ? selectedInspectorNode : null;
    const packageSlotVideoNode = selectedVideoNode || (lastSelectedVideoNodeId ? nodeById.get(lastSelectedVideoNodeId) || null : null);
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const batchChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (node.metadata?.isBatchRoot) map.set(node.id, node.metadata.batchChildIds?.length || 0);
        });
        return map;
    }, [nodes]);
    const batchMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const rootId = node.metadata?.batchRootId;
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);
    const {
        episodeWorkbenchStats,
        episodeProductionLabel,
        timelineShots,
        timelineShotGroups,
        activeTimelineShot,
        activeTimelineShotGroups,
        activeTimelineNodeIds,
        activeTimelineNodes,
        productionPackages,
        productionPackageLabelMap,
        inspectorProductionPackage,
        relatedHighlight,
    } = useCanvasProductionWorkbenchState({
        canvasId,
        currentProject,
        creativeProject,
        storyboardTableShots,
        storyboardShotGroups,
        assetBreakdownItems,
        nodes,
        connections,
        selectedInspectorNode,
        activeNodeId,
        activeTimelineShotId,
        activeProductionPackageId,
        setActiveProductionPackageId,
    });

    useEffect(() => {
        if (selectedVideoNode) setLastSelectedVideoNodeId(selectedVideoNode.id);
    }, [selectedVideoNode]);

    const { handleTimelineShotSelect, addStoryboardGroupToCanvas, addShotGroupToCanvas } = useCanvasStoryboardCanvasActions({
        assets,
        canvasAiConfig,
        currentProject,
        nodesRef,
        connectionsRef,
        size,
        viewportRef,
        message,
        getCanvasCenter,
        attachStoryboardShotCanvasNodes,
        attachShotGroupCanvasNodes,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setActiveTimelineShotId,
        setActiveProductionPackageId,
        setInspectorView,
        setViewport,
    });
    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);

    const { createNode, openNodeCreateMenuAtCanvasPoint, deleteNodes, deselectCanvas, clearCanvas, duplicateNode, handleNodeResize, toggleNodeFreeResize, handleNodeContentChange, handleNodePromptChange, openTextEditor } = useCanvasNodeCrudActions({
        canvasAiConfig,
        canvasId,
        chatSessions,
        nodesRef,
        screenToCanvas,
        getAppendNodeCenter,
        createCanvasNode,
        cleanupCanvasFiles,
        clearSelectionBox,
        cancelPendingConnectionCreate,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setNodeCreateMenuPosition,
        setHoveredNodeId,
        setToolbarNodeId,
        setDialogNodeId,
        setEditingNodeId,
        setInfoNodeId,
        setCropNodeId,
        setAngleNodeId,
        setPreviewNodeId,
        setRunningNodeId,
        setClearConfirmOpen,
        setEditRequestNonce,
    });

    const resetViewport = useCallback(() => {
        setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
        setContextMenu(null);
    }, [size.height, size.width]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [size.height, size.width],
    );

    const createAndOpenProject = useCallback(() => {
        const targetProjectId = currentProject?.projectId || ensureUnfiledProject(currentProject?.preset);
        const id = createProject(`眨眼之间 ${useCanvasStore.getState().projects.length + 1}`, currentProject?.preset, { projectId: targetProjectId });
        attachCanvasToCreativeProject(targetProjectId, id);
        router.push(`/canvas/${id}`);
    }, [attachCanvasToCreativeProject, createProject, currentProject?.preset, currentProject?.projectId, ensureUnfiledProject, router]);

    const deleteCurrentProject = useCallback(() => {
        deleteProjects([canvasId]);
        cleanupAssetImages();
        router.push("/projects");
    }, [canvasId, cleanupAssetImages, deleteProjects, router]);

    const saveCurrentProject = useCallback(async () => {
        if (!currentProject) return;
        updateProject(canvasId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo, viewport });
        await flushProjects();
        message.success("画布已保存");
    }, [activeChatId, backgroundMode, canvasId, chatSessions, connections, currentProject, flushProjects, message, nodes, showImageInfo, updateProject, viewport]);

    const openEpisodeWorkbench = useCallback(() => {
        if (currentProject?.projectId && currentProject.episodeId) {
            router.push(`/projects/${currentProject.projectId}/episodes/${currentProject.episodeId}/workbench`);
            return;
        }
        if (currentProject?.projectId) {
            router.push(`/projects/${currentProject.projectId}`);
            return;
        }
        router.push("/projects");
    }, [currentProject, router]);
    const returnTarget = useMemo(() => {
        if (currentProject?.projectId && currentProject.episodeId) {
            return { href: `/projects/${currentProject.projectId}/episodes/${currentProject.episodeId}/workbench`, label: "返回本集生产流程" };
        }
        if (currentProject?.projectId) return { href: `/projects/${currentProject.projectId}`, label: "返回项目详情" };
        return { href: "/projects", label: "项目工作台" };
    }, [currentProject?.episodeId, currentProject?.projectId]);
    const returnToParent = useCallback(() => router.push(returnTarget.href), [returnTarget.href, router]);

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            if (moveNodeDrag(event)) return;
            moveConnectionTarget(event.clientX, event.clientY);
        },
        [moveConnectionTarget, moveNodeDrag],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            clearSelectionBox();
            finishConnection(event.clientX, event.clientY);
        },
        [clearSelectionBox, finishConnection, finishNodeDrag],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", moveSelectionBox);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", moveSelectionBox);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, moveSelectionBox]);

    const addCanvasNodeToAssets = useCallback(
        async (node: CanvasNodeData) => {
            const asset = canvasNodeToAsset(node);
            if (!asset) return false;
            await addAssetOnce(asset);
            return true;
        },
        [addAssetOnce],
    );

    const { createImageFileNode, handleUploadRequest, handleImageInputChange, handleDrop, pasteAssistantImage } = useCanvasFileNodeActions({
        containerRef,
        imageInputRef,
        uploadTargetRef,
        nodesRef,
        size,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        showSuccess: showCanvasSuccess,
        addCanvasNodeToAssets,
        toImageMetadata: imageMetadata,
        toVideoMetadata: videoMetadata,
        toAudioMetadata: audioMetadata,
    });

    const toolbarActions = useCanvasToolbarActions({
        createNode,
        handleUploadRequest,
        deleteNodes,
        deselectCanvas,
        openEpisodeWorkbench,
        selectedNodeIds,
        setClearConfirmOpen,
        setAssetPickerTab,
        setAssetPickerOpen,
    });

    const { copySelectedNodes, pasteCopiedNodes, pasteSystemClipboard } = useCanvasClipboardActions({
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        createImageFileNode,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        showSuccess: showCanvasSuccess,
    });

    const closeCanvasOverlays = useCallback(() => {
        cancelPendingConnectionCreate();
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
        setInfoNodeId(null);
        setCropNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
    }, [cancelPendingConnectionCreate]);

    useCanvasKeyboardShortcuts({
        nodesRef,
        selectedNodeIdsRef,
        selectedConnectionId,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        clearSelectionBox,
        closeCanvasOverlays,
        undoCanvas,
        redoCanvas,
        copySelectedNodes,
        pasteCopiedNodes,
        pasteSystemClipboard,
        deleteNodes,
    });

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) => toggleBatchExpandedInNodes(prev, nodeId));
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        setNodes((prev) => setBatchPrimaryInNodes(prev, child));
    }, []);

    const handleConfigNodeChange = useCallback(
        (nodeId: string, patch: Partial<CanvasNodeMetadata>) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (shouldRememberVideoDefaults(node, patch)) {
                const defaults = buildCanvasVideoDefaultsPatch(canvasAiConfig, patch);
                Object.entries(defaults).forEach(([key, value]) => updateConfig(key as keyof AiConfig, value as AiConfig[keyof AiConfig]));
            }
            setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
        },
        [canvasAiConfig, updateConfig],
    );

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (!(await addCanvasNodeToAssets(node))) return message.error(`没有可保存的${canvasAssetTypeLabel(node.type)}`);
            message.success("已加入我的素材");
        },
        [addCanvasNodeToAssets, message],
    );

    const { submittingReviewNodeId, refreshingReviewNodeId, submitNodeVolcengineReview, refreshNodeVolcengineReview } = useCanvasNodeReviewActions({
        token,
        message,
        nodes,
        nodesRef,
        setNodes,
        assets,
        addAssetOnce,
        updateAsset,
        volcengineAssetEnabled,
    });

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleAssistantSessionsChange = useCallback(
        (sessions: CanvasAssistantSession[], activeId: string | null, options?: { skipCanvasHistory?: boolean }) => {
            if (options?.skipCanvasHistory) skipNextHistoryCommit();
            setChatSessions(sessions);
            setActiveChatId(activeId);
        },
        [skipNextHistoryCommit],
    );

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(canvasId, nextTitle);
        setTitleEditing(false);
    }, [canvasId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu(null);
    }, []);
    const confirmVideoPromptReviewWithTheme = useCallback((review: PromptReviewResult) => confirmVideoPromptReview(review, modal), [modal]);

    const { handleGenerateNode } = useCanvasGenerationFlowActions({
        assets,
        canvasAiConfig,
        nodesRef,
        connectionsRef,
        setNodes,
        setRunningNodeId,
        isAiConfigReady,
        openConfigDialog,
        message,
        generateImageNode,
        generateVideoNode,
        generateTextNode,
        confirmVideoPromptReview: confirmVideoPromptReviewWithTheme,
    });

    useCanvasGenerationQueueRunner({
        projectLoaded,
        queuePaused,
        queueItems,
        queueConcurrency,
        workspaceProjectId,
        nodesRef,
        processingQueueItemIdsRef,
        handleGenerateNode,
        markQueueItemRunning,
        markQueueItemSucceeded,
        markQueueItemFailed,
    });

    const handleRefreshVideoTask = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Video || !node.metadata?.taskId) {
                message.warning("没有可刷新的视频任务");
                return;
            }
            try {
                const generationConfig = buildGenerationConfig(canvasAiConfig, node, "video", defaultConfig);
                const task = await refreshVideoTask(generationConfig, node.metadata.taskId);
                if (task.status === "succeeded") {
                    const video = await uploadMediaFile(await fetchVideoTaskContent(generationConfig, task), "video");
                    const cachedVideo = await cacheUploadedCanvasMedia(video, `${node.id}.mp4`);
                    const videoSize = fitNodeSize(video.width || node.width || NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, video.height || node.height || NODE_DEFAULT_SIZE[CanvasNodeType.Video].height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    const completedVideoNode: CanvasNodeData = {
                        ...node,
                        width: videoSize.width,
                        height: videoSize.height,
                        position: { x: node.position.x + node.width / 2 - videoSize.width / 2, y: node.position.y + node.height / 2 - videoSize.height / 2 },
                        metadata: {
                            ...node.metadata,
                            ...videoMetadata(video),
                            ...cachedVideo,
                            ...videoTaskMetadata(task),
                            status: "success",
                            taskStatus: "succeeded",
                            errorDetails: undefined,
                        },
                    };
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id
                                ? {
                                      ...completedVideoNode,
                                      position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
                                      metadata: { ...item.metadata, ...completedVideoNode.metadata },
                                  }
                                : item,
                        ),
                    );
                    await archiveGeneratedVideoNode(completedVideoNode, generationConfig, completedVideoNode.metadata?.prompt || "");
                    message.success("视频已回填");
                    return;
                }
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } } : item)));
                message.success(`任务状态：${task.status}`);
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "刷新任务失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, errorDetails } } : item)));
            }
        },
        [archiveGeneratedVideoNode, cacheUploadedCanvasMedia, canvasAiConfig, message],
    );

    const { handleRetryNode } = useCanvasGenerationRetryActions({
        canvasAiConfig,
        nodesRef,
        connectionsRef,
        setNodes,
        setRunningNodeId,
        isAiConfigReady,
        openConfigDialog,
        message,
        retryTextNode,
        cacheUploadedCanvasMedia,
        videoMetadata,
        imageMetadata,
        workspaceProjectId,
        workspaceProjectTitle,
        projectPreset: currentProject?.preset,
        canvasEpisodeContext,
        canvasId,
        archiveGeneratedAsset,
    });

    const { cropImageNode, generateAngleNode, handleContinueVideoNode, captureVideoCurrentFrame, generateImageFromTextNode } = useCanvasNodeDerivativeActions({
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setCropNodeId,
        setAngleNodeId,
        setRunningNodeId,
        canvasAiConfig,
        defaultConfig,
        openConfigDialog,
        isAiConfigReady,
        canvasId,
        workspaceProjectId,
        canvasEpisodeContext,
        message,
        createNode: createCanvasNode,
        imageMetadata,
    });

    const createBriefImageConfigNode = useCallback(
        (brief: ImageBrief) => {
            const center = getCanvasCenter();
            const node = placeCanvasNodeAwayFromNodes(
                buildImageBriefImageConfigNode({
                    brief,
                    config: canvasAiConfig,
                    position: { x: center.x - NODE_DEFAULT_SIZE.config.width / 2, y: center.y - NODE_DEFAULT_SIZE.config.height / 2 },
                }),
                nodesRef.current,
            );
            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
        },
        [canvasAiConfig, getCanvasCenter],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = placeCanvasNodeAwayFromNodes(
                {
                    id,
                    type: CanvasNodeType.Image,
                    title: image.prompt.slice(0, 32) || "Generated Image",
                    position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                    width: config.width,
                    height: config.height,
                    metadata: {
                        ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }),
                        prompt: image.prompt,
                        ...canvasAssetReferenceMetadata(image),
                        volcengineAsset: image.volcengineAsset,
                    },
                },
                nodesRef.current,
            );

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string, metadata: Partial<CanvasNodeMetadata> = {}) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = placeCanvasNodeAwayFromNodes(
                {
                    ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS, ...metadata }),
                    title: text.slice(0, 32) || "Assistant Text",
                },
                nodesRef.current,
            );

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const applyAssistantActions = useCallback(
        (actions: AssistantCanvasAction[]) => {
            const result = applyAssistantCanvasActions({ nodes: nodesRef.current, connections: connectionsRef.current, actions });
            const changed = result.nodes.length !== nodesRef.current.length || result.connections.length !== connectionsRef.current.length;
            if (!changed) {
                message.warning("动作预览未通过或没有可应用内容");
                return false;
            }
            nodesRef.current = result.nodes;
            connectionsRef.current = result.connections;
            setNodes(result.nodes);
            setConnections(result.connections);
            const createdNodeIds = actions.flatMap((action) => (action.kind === "write" ? action.preview?.createdNodes?.map((node) => node.id) || [] : [])).filter((id) => result.nodes.some((node) => node.id === id));
            if (createdNodeIds.length) setSelectedNodeIds(new Set(createdNodeIds));
            setSelectedConnectionId(null);
            message.success("已应用助手动作");
            return true;
        },
        [message],
    );

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content, canvasAssetReferenceMetadata(payload));
            } else if (payload.kind === "video" || payload.kind === "audio") {
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `${payload.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                setNodes((prev) => [...prev, placeCanvasNodeAwayFromNodes(buildInsertedMediaAssetNode(payload, id, center), prev)]);
                setSelectedNodeIds(new Set([id]));
            } else {
                insertAssistantImage({
                    id: `asset-${Date.now()}`,
                    prompt: payload.title,
                    dataUrl: payload.dataUrl,
                    storageKey: payload.storageKey,
                    sourceAssetId: payload.sourceAssetId,
                    assetVersion: payload.assetVersion,
                    volcengineAsset: payload.volcengineAsset,
                });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    const updateCanvasNodeAssetReference = useCallback(
        (node: CanvasNodeData) => {
            const assetId = node.metadata?.sourceAssetId;
            const asset = assetId ? assetById.get(assetId) : undefined;
            if (!asset || !node.metadata?.assetVersion) return message.warning("没有可更新的素材引用");
            const nextVersion = updateAssetReferenceToLatest(node.metadata.assetVersion, asset);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...canvasAssetReferenceMetadata({ sourceAssetId: assetId, assetVersion: nextVersion }) } } : item)));
            message.success("已更新当前节点的素材引用版本");
        },
        [assetById, message],
    );

    const nodeToolActions = useMemo<CanvasNodeHoverToolbarActions>(
        () => ({
            onInfo: (node) => setInfoNodeId(node.id),
            onEditText: openTextEditor,
            onDecreaseFont: (node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2)),
            onIncreaseFont: (node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2)),
            onToggleDialog: (node) => setDialogNodeId((current) => (current === node.id ? null : node.id)),
            onGenerateImage: generateImageFromTextNode,
            onUpload: (node) => handleUploadRequest(node.id),
            onDownload: downloadNodeMedia,
            onSaveAsset: (node) => void saveNodeAsset(node),
            onUpdateAssetReference: updateCanvasNodeAssetReference,
            onContinueVideo: (node) => void handleContinueVideoNode(node),
            onCaptureVideoFrame: (node) => void captureVideoCurrentFrame(node),
            onReviewAsset: (node) => void submitNodeVolcengineReview(node),
            onRefreshReview: (node) => void refreshNodeVolcengineReview(node),
            onCrop: (node) => setCropNodeId(node.id),
            onAngle: (node) => setAngleNodeId(node.id),
            onViewImage: (node) => setPreviewNodeId(node.id),
            onRetry: (node) => void handleRetryNode(node),
            onToggleFreeResize: (node) => toggleNodeFreeResize(node.id),
            onDelete: (node) => deleteNodes(new Set([node.id])),
        }),
        [
            captureVideoCurrentFrame,
            deleteNodes,
            downloadNodeMedia,
            generateImageFromTextNode,
            handleContinueVideoNode,
            handleFontSizeChange,
            handleRetryNode,
            handleUploadRequest,
            openTextEditor,
            refreshNodeVolcengineReview,
            saveNodeAsset,
            setAngleNodeId,
            setCropNodeId,
            setDialogNodeId,
            setInfoNodeId,
            setPreviewNodeId,
            submitNodeVolcengineReview,
            toggleNodeFreeResize,
            updateCanvasNodeAssetReference,
        ],
    );

    const {
        focusProductionPackage,
        handlePreviewProductionVideoVersion,
        handleDownloadProductionVideoVersion,
        handleSetCurrentProductionVideoVersion,
        handleHideProductionVideoVersion,
        handleInsertProductionPackageConfigNode,
        handleEditProductionPackagePrompt,
        handleBindSelectedVideoToProductionPackage,
    } = useCanvasProductionPackageActions({
        canvasAiConfig,
        productionPackages,
        nodesRef,
        size,
        viewportRef,
        message,
        downloadNodeMedia,
        getAppendNodeCenter,
        createCanvasNode,
        setNodes,
        setActiveTimelineShotId,
        setActiveProductionPackageId,
        setInspectorView,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setViewport,
    });

    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    episodeLabel={canvasEpisodeLabel(currentProject)}
                    episodeProductionLabel={episodeProductionLabel}
                    hasEpisode={Boolean(currentProject?.episodeId)}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    returnLabel={returnTarget.label}
                    onReturnParent={returnToParent}
                    onHome={() => router.push("/projects")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onSaveProject={saveCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onOpenEpisodeScript={openEpisodeWorkbench}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    assistantActive={assistantMounted && inspectorView === "assistant" && !isInspectorCollapsed}
                    onExpandAssistant={() => {
                        setAssistantMounted(true);
                        setAssistantCollapsed(false);
                        setIsInspectorCollapsed(false);
                        setInspectorView("assistant");
                    }}
                />

                <CanvasProductionPackageBar
                    packages={productionPackages}
                    activePackageId={activeProductionPackageId}
                    inspectorCollapsed={isInspectorCollapsed}
                    selectedVideoNodeId={packageSlotVideoNode?.type === CanvasNodeType.Video && packageSlotVideoNode.metadata?.content ? packageSlotVideoNode.id : ""}
                    onSelect={(productionPackage) => {
                        focusProductionPackage(productionPackage);
                        setAssistantMounted(true);
                        setAssistantCollapsed(false);
                        setIsInspectorCollapsed(false);
                        setInspectorView("context");
                    }}
                    onInsertConfig={handleInsertProductionPackageConfigNode}
                    onEditPrompt={handleEditProductionPackagePrompt}
                    onBindVideo={handleBindSelectedVideoToProductionPackage}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    backgroundMode={backgroundMode}
                    onViewportChange={(next) => {
                        setViewport(next);
                        setContextMenu(null);
                        setNodeCreateMenuPosition(null);
                    }}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasDoubleClick={openNodeCreateMenuAtCanvasPoint}
                    onCanvasDeselect={deselectCanvas}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {connections
                            .filter((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                return Boolean(from && to && !isHiddenBatchConnectionEndpoint(from, nodes) && !isHiddenBatchConnectionEndpoint(to, nodes));
                            })
                            .map((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                if (!from || !to) return null;

                                return (
                                    <ConnectionPath
                                        key={connection.id}
                                        connection={connection}
                                        from={from}
                                        to={to}
                                        active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                                        onSelect={() => {
                                            setSelectedConnectionId(connection.id);
                                            setSelectedNodeIds(new Set());
                                            setContextMenu(null);
                                        }}
                                    />
                                );
                            })}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} /> : null}
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id || activeTimelineNodeIds.has(node.id)}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            editRequestNonce={editingNodeId === node.id ? editRequestNonce : 0}
                            showPanel={dialogNodeId === node.id && !selectionBox}
                            batchCount={batchChildCountById.get(node.id) || 0}
                            batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
                            batchClosing={Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId))}
                            batchOpening={openingBatchIds.has(node.id)}
                            batchRecovering={collapsingBatchIds.has(node.id)}
                            batchMotion={batchMotionById.get(node.id)}
                            showImageInfo={showImageInfo}
                            productionPackageBadge={productionNodeBadge(node, productionPackages, productionPackageLabelMap)}
                            isProductionPackageActive={Boolean(getNodeProductionPackageId(node) && getNodeProductionPackageId(node) === activeProductionPackageId)}
                            renderPanel={(panelNode) => (
                                <CanvasNodePromptPanel
                                    node={panelNode}
                                    isRunning={runningNodeId === panelNode.id}
                                    projectId={workspaceProjectId}
                                    onPromptChange={handleNodePromptChange}
                                    onConfigChange={handleConfigNodeChange}
                                    onGenerate={handleGenerateNode}
                                    onImageSettingsOpenChange={(open) => {
                                        setNodeImageSettingsOpen(open);
                                        if (open) setToolbarNodeId(null);
                                    }}
                                    referenceMentionOptions={panelNode.type === CanvasNodeType.Video ? buildReferenceMentionOptions(buildNodeGenerationInputs(panelNode.id, nodes, connections)) : []}
                                />
                            )}
                            renderNodeContent={(contentNode) => (
                                <CanvasConfigNodePanel
                                    node={contentNode}
                                    isRunning={runningNodeId === contentNode.id}
                                    inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                                    inputs={configInputsById.get(contentNode.id) || []}
                                    onConfigChange={handleConfigNodeChange}
                                    onTextInputChange={handleNodeContentChange}
                                    onGenerate={(nodeId) => {
                                        const target = nodesRef.current.find((item) => item.id === nodeId);
                                        void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.prompt || "");
                                    }}
                                />
                            )}
                            onMouseDown={handleNodeMouseDown}
                            onHoverStart={(nodeId) => {
                                if (nodeDraggingRef.current) return;
                                setHoveredNodeId(nodeId);
                                keepNodeToolbar(nodeId);
                            }}
                            onHoverEnd={(nodeId) => {
                                setHoveredNodeId((current) => (current === nodeId ? null : current));
                                hideNodeToolbar();
                            }}
                            onConnectStart={handleConnectStart}
                            onResize={handleNodeResize}
                            onContentChange={handleNodeContentChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onRetry={nodeToolActions.onRetry}
                            onRefreshVideoTask={(node) => void handleRefreshVideoTask(node)}
                            onGenerateImage={nodeToolActions.onGenerateImage}
                            onDownload={nodeToolActions.onDownload}
                            onViewImage={nodeToolActions.onViewImage}
                            onContextMenu={(event, id) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
                            }}
                        />
                    ))}

                    {selectionBox ? (
                        <div
                            className="pointer-events-none absolute z-[100] border"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                                borderColor: theme.canvas.selectionStroke,
                                background: theme.canvas.selectionFill,
                            }}
                        />
                    ) : null}
                    {nodeCreateMenuPosition ? (
                        <ConnectionCreateMenu
                            position={nodeCreateMenuPosition}
                            title="新建节点"
                            onCreate={(type) => {
                                if (!nodeCreateMenuPosition) return;
                                createNode(type, nodeCreateMenuPosition);
                            }}
                            onClose={() => setNodeCreateMenuPosition(null)}
                        />
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu position={pendingConnectionCreate.position} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                </InfiniteCanvas>

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                    viewport={viewport}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    actions={nodeToolActions}
                    state={{
                        hasNewAssetVersion,
                        submittingReview: toolbarNode ? submittingReviewNodeId === toolbarNode.id : false,
                        refreshingReview: toolbarNode ? refreshingReviewNodeId === toolbarNode.id : false,
                    }}
                />

                <CanvasToolbar
                    actions={{
                        ...toolbarActions,
                        onUndo: undoCanvas,
                        onRedo: redoCanvas,
                        onBackgroundModeChange: setBackgroundMode,
                        onShowImageInfoChange: setShowImageInfo,
                    }}
                    state={{
                        selectedCount: selectedNodeIds.size,
                        canUndo: historyState.canUndo,
                        canRedo: historyState.canRedo,
                        backgroundMode,
                        showImageInfo,
                    }}
                />

                <CanvasStoryboardTimeline shots={timelineShots} shotGroups={timelineShotGroups} nodes={nodes} activeShotId={activeTimelineShotId} onOpenWorkbench={openEpisodeWorkbench} onSelectShot={handleTimelineShotSelect} />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        onDuplicate={() => {
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDelete={() => {
                            deleteNodes(new Set([contextMenu.nodeId]));
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" multiple onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    title="图片详情"
                    open={Boolean(previewNode?.metadata?.content)}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewNode?.metadata?.content ? <img src={previewNode.metadata.content} alt={previewNode.title || "图片"} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /> : null}
                </Modal>

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                <AssetPickerModal open={assetPickerOpen} defaultTab={assetPickerTab} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} />
                <ScriptManagerDrawer
                    open={scriptManagerOpen}
                    projectId={workspaceProjectId}
                    projectTitle={workspaceProjectTitle}
                    initialEpisodeId={currentProject?.episodeId}
                    onClose={() => setScriptManagerOpen(false)}
                    onOpenStoryboardGroup={(groupId) => {
                        setStoryboardInitialGroupId(groupId);
                        setStoryboardManagerOpen(true);
                    }}
                />
                <StoryboardManagerDrawer
                    open={storyboardManagerOpen}
                    projectId={workspaceProjectId}
                    projectTitle={workspaceProjectTitle}
                    initialGroupId={storyboardInitialGroupId}
                    canvases={currentProject ? [currentProject] : []}
                    canvasNodes={nodes}
                    onClose={() => setStoryboardManagerOpen(false)}
                    onAddGroupToCanvas={addStoryboardGroupToCanvas}
                    onAddShotGroupToCanvas={addShotGroupToCanvas}
                />
                <ImageBriefWorkbenchDrawer
                    open={imageBriefOpen}
                    projectId={workspaceProjectId}
                    projectTitle={workspaceProjectTitle}
                    canvases={currentProject ? [currentProject] : []}
                    onCreateImageConfig={createBriefImageConfigNode}
                    initialBriefId={imageBriefInitialId}
                    initialBriefRequestId={imageBriefOpenRequestId}
                    onClose={() => setImageBriefOpen(false)}
                />
            </section>
            <CanvasContextInspector
                view={inspectorView}
                onViewChange={setInspectorView}
                collapsed={isInspectorCollapsed}
                onCollapsedChange={setIsInspectorCollapsed}
                title={currentProject?.title || "未命名画布"}
                episodeLabel={canvasEpisodeLabel(currentProject)}
                productionLabel={episodeProductionLabel}
                hasEpisode={Boolean(currentProject?.episodeId)}
                stats={episodeWorkbenchStats}
                selectedNode={selectedInspectorNode}
                selectedProductionPackage={inspectorProductionPackage}
                selectedVideoNode={packageSlotVideoNode?.type === CanvasNodeType.Video && packageSlotVideoNode.metadata?.content ? packageSlotVideoNode : null}
                selectedShot={activeTimelineShot}
                selectedShotGroups={activeTimelineShotGroups}
                selectedShotNodes={activeTimelineNodes}
                assetTitleById={assetTitleById}
                checklistShots={timelineShots}
                checklistShotGroups={timelineShotGroups}
                checklistNodes={nodes}
                activeShotId={activeTimelineShotId}
                selectedCount={selectedNodeIds.size}
                connections={connections}
                configInputs={selectedInspectorNode?.type === CanvasNodeType.Config ? configInputsById.get(selectedInspectorNode.id) || [] : []}
                assistantSlot={
                    assistantMounted ? (
                        <CanvasAssistantPanel
                            embedded
                            projectId={workspaceProjectId}
                            canvasId={canvasId}
                            episodeId={canvasEpisodeContext?.episodeId}
                            nodes={nodes}
                            connections={connections}
                            selectedNodeIds={selectedNodeIds}
                            sessions={chatSessions}
                            activeSessionId={activeChatId}
                            onSelectNodeIds={setSelectedNodeIds}
                            onSessionsChange={handleAssistantSessionsChange}
                            onInsertImage={insertAssistantImage}
                            onInsertText={insertAssistantText}
                            onPasteImage={pasteAssistantImage}
                            onApplyAssistantActions={applyAssistantActions}
                            onCollapseStart={() => setAssistantCollapsed(true)}
                            onCollapse={() => {
                                setAssistantMounted(false);
                                setInspectorView("context");
                            }}
                        />
                    ) : null
                }
                onOpenEpisodeWorkbench={openEpisodeWorkbench}
                onOpenAssets={() => {
                    setAssetPickerTab("my-assets");
                    setAssetPickerOpen(true);
                }}
                onOpenAssistant={() => {
                    setAssistantMounted(true);
                    setAssistantCollapsed(false);
                }}
                onSelectShot={handleTimelineShotSelect}
                onPreviewProductionVideoVersion={handlePreviewProductionVideoVersion}
                onDownloadProductionVideoVersion={handleDownloadProductionVideoVersion}
                onSetCurrentProductionVideoVersion={handleSetCurrentProductionVideoVersion}
                onHideProductionVideoVersion={handleHideProductionVideoVersion}
                onBindSelectedVideoToProductionPackage={handleBindSelectedVideoToProductionPackage}
                onInsertProductionPackageConfigNode={handleInsertProductionPackageConfigNode}
                onInfo={nodeToolActions.onInfo}
                onEditText={nodeToolActions.onEditText}
                onToggleDialog={nodeToolActions.onToggleDialog}
                onGenerateImage={nodeToolActions.onGenerateImage}
                onUpload={nodeToolActions.onUpload}
                onDownload={nodeToolActions.onDownload}
                onSaveAsset={nodeToolActions.onSaveAsset}
                onRetry={nodeToolActions.onRetry}
                onContinueVideo={nodeToolActions.onContinueVideo}
                onCrop={nodeToolActions.onCrop}
                onAngle={nodeToolActions.onAngle}
                onViewImage={nodeToolActions.onViewImage}
            />
        </main>
    );
}

function CanvasProductionPackageBar({
    packages,
    activePackageId,
    inspectorCollapsed,
    selectedVideoNodeId,
    onSelect,
    onInsertConfig,
    onEditPrompt,
    onBindVideo,
}: {
    packages: CanvasProductionPackageSummary[];
    activePackageId: string;
    inspectorCollapsed: boolean;
    selectedVideoNodeId: string;
    onSelect: (productionPackage: CanvasProductionPackageSummary) => void;
    onInsertConfig: (packageId: string) => void;
    onEditPrompt: (packageId: string) => void;
    onBindVideo: (packageId: string, nodeId: string) => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const activePackageStyle =
        colorTheme === "light"
            ? {
                  background: "rgba(219,234,254,.92)",
                  border: "#2563eb",
                  text: "#1e3a8a",
                  muted: "#2563eb",
                  actionBackground: "rgba(37,99,235,.10)",
              }
            : {
                  background: "rgba(34,211,238,.14)",
                  border: "rgba(34,211,238,.72)",
                  text: "rgb(103,232,249)",
                  muted: "rgb(165,243,252)",
                  actionBackground: "rgba(34,211,238,.18)",
              };
    if (!packages.length) return null;
    return (
        <div className={`pointer-events-none absolute left-4 ${inspectorCollapsed ? "right-14" : "right-[440px]"} top-16 z-40 flex justify-center`}>
            <div className="pointer-events-auto flex max-w-full gap-2 overflow-x-auto rounded-xl border p-1.5 backdrop-blur-md" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} data-canvas-no-zoom>
                {packages.map((item) => {
                    const active = item.id === activePackageId;
                    const visibleVersionCount = item.versions.filter((version) => !version.hidden).length;
                    return (
                        <div
                            key={item.id}
                            className="min-w-[150px] rounded-lg border px-3 py-2 transition hover:opacity-95"
                            style={{ background: active ? activePackageStyle.background : theme.node.fill, borderColor: active ? activePackageStyle.border : theme.node.stroke, color: active ? activePackageStyle.text : theme.node.text }}
                            title={`${item.label} · ${item.title}`}
                        >
                            <button type="button" className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" onClick={() => onSelect(item)}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="truncate text-sm font-semibold">{item.label}</div>
                                    <span
                                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                                        style={{ borderColor: active ? activePackageStyle.border : theme.node.stroke, background: active ? activePackageStyle.border : "transparent" }}
                                        aria-hidden
                                    >
                                        {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                                    </span>
                                </div>
                                <div className="mt-1 truncate text-xs" style={{ color: active ? activePackageStyle.muted : theme.node.muted }}>
                                    {item.statusLabel}
                                </div>
                                <div className="mt-1 truncate text-[11px]" style={{ color: active ? activePackageStyle.muted : theme.node.muted }}>
                                    节点 {item.nodeIds.length} · 版本 {visibleVersionCount}
                                </div>
                            </button>
                            <div className="mt-2 flex items-center gap-1.5">
                                <button
                                    type="button"
                                    className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                                    onClick={() => onInsertConfig(item.id)}
                                    title={item.configNodeId ? "查看生产包配置节点" : "将生产包配置放入画布"}
                                >
                                    <FilePlus2 className="size-3" />
                                    {item.configNodeId ? "配置节点" : "新建配置"}
                                </button>
                                {selectedVideoNodeId ? (
                                    <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                        style={{
                                            background: active ? activePackageStyle.actionBackground : theme.toolbar.panel,
                                            borderColor: active ? activePackageStyle.border : theme.node.stroke,
                                            color: active ? activePackageStyle.text : theme.node.muted,
                                        }}
                                        onClick={() => onBindVideo(item.id, selectedVideoNodeId)}
                                        title={`将选中视频绑定到 ${item.label}`}
                                        aria-label={`将选中视频绑定到 ${item.label}`}
                                    >
                                        <Link2 className="size-3" />
                                    </button>
                                ) : item.configNodeId ? (
                                    <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                        style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.muted }}
                                        onClick={() => onEditPrompt(item.id)}
                                        title="编辑提示词"
                                        aria-label="编辑提示词"
                                    >
                                        <FileText className="size-3" />
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function CanvasTopBar({
    title,
    episodeLabel,
    episodeProductionLabel,
    hasEpisode,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    returnLabel,
    onReturnParent,
    onHome,
    onCreateProject,
    onDeleteProject,
    onSaveProject,
    onImportImage,
    onOpenEpisodeScript,
    onUndo,
    onRedo,
    assistantActive,
    onExpandAssistant,
}: {
    title: string;
    episodeLabel: string;
    episodeProductionLabel: string;
    hasEpisode: boolean;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    returnLabel: string;
    onReturnParent: () => void;
    onHome: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onSaveProject: () => void;
    onImportImage: () => void;
    onOpenEpisodeScript: () => void;
    onUndo: () => void;
    onRedo: () => void;
    assistantActive: boolean;
    onExpandAssistant: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const accountRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    useEffect(() => {
        if (!accountOpen) return;
        const close = (event: PointerEvent) => {
            if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [accountOpen]);

    return (
        <>
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-16 items-center justify-between px-4">
                <div className="pointer-events-auto flex min-w-0 items-center gap-3">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "parent", icon: <ArrowLeft className="size-4" />, label: returnLabel, onClick: onReturnParent },
                                { key: "projects", icon: <Home className="size-4" />, label: "项目工作台", onClick: onHome },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: "新建画布", onClick: onCreateProject },
                                { key: "save", icon: <Save className="size-4" />, label: "保存画布", onClick: onSaveProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除当前画布", onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "import", icon: <Upload className="size-4" />, label: "导入图片", onClick: onImportImage },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text="撤销" shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button
                            type="button"
                            className="grid size-9 place-items-center rounded-full transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 dark:hover:bg-white/10"
                            style={{ color: theme.node.text }}
                            aria-label="打开画布菜单"
                        >
                            <Menu className="size-5" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 dark:hover:bg-white/10"
                            style={{ color: theme.node.muted }}
                            onClick={onReturnParent}
                            title={returnLabel}
                        >
                            <ArrowLeft className="size-3.5" />
                            {returnLabel}
                        </button>
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="max-w-[280px] bg-transparent p-0 text-left text-lg font-semibold tracking-normal outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-[280px] truncate border-b border-dashed border-transparent text-left text-lg font-semibold tracking-normal transition hover:border-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                onDoubleClick={onStartTitleEditing}
                                title="双击修改画布名称"
                            >
                                {title}
                            </button>
                        )}
                        <button
                            type="button"
                            className="max-w-[180px] truncate rounded-full px-2.5 py-1 text-xs transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 dark:hover:bg-white/10"
                            style={{ color: hasEpisode ? theme.node.text : theme.node.muted, background: hasEpisode ? theme.toolbar.panel : "transparent" }}
                            onClick={onOpenEpisodeScript}
                            title={hasEpisode ? "打开本集剧本" : "打开剧本工作台"}
                        >
                            {episodeLabel}
                        </button>
                        <span className="max-w-[140px] truncate rounded-full px-2 py-1 text-xs" style={{ color: theme.node.muted, background: theme.toolbar.panel }}>
                            {episodeProductionLabel}
                        </span>
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-1.5">
                    <UserStatusActions
                        variant="canvas"
                        showConfig={false}
                        accountOpen={accountOpen}
                        onAccountOpenChange={setAccountOpen}
                        accountRef={accountRef}
                        getPopupContainer={(node) => node.parentElement || document.body}
                        onOpenShortcuts={() => {
                            setShortcutsOpen(true);
                            setAccountOpen(false);
                        }}
                    />
                    <span className="h-6 w-px" style={{ background: theme.toolbar.border }} />
                    <Button
                        type="text"
                        className="!h-10 !rounded-xl !px-3 !font-medium"
                        style={{ background: assistantActive ? theme.toolbar.activeBg : theme.toolbar.panel, color: assistantActive ? theme.toolbar.activeText : theme.node.text, boxShadow: "0 10px 30px rgba(28,25,23,.10)" }}
                        icon={<MessageSquare className="size-4" />}
                        onClick={onExpandAssistant}
                    >
                        助手
                    </Button>
                </div>
            </div>
            <Modal title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["拖动画布"]} value="平移视图" />
                    <Shortcut keys={["滚轮"]} value="缩放画布" />
                    <Shortcut keys={["缩放滑杆"]} value="精确调整缩放" />
                    <Shortcut keys={["Ctrl / Cmd", "拖动"]} value="框选多个节点" />
                    <Shortcut keys={["Shift / Ctrl / Cmd", "点击"]} value="追加选择节点" />
                    <Shortcut keys={["Ctrl / Cmd", "A"]} value="全选节点" />
                    <Shortcut keys={["Ctrl / Cmd", "C / V"]} value="复制 / 粘贴节点，或粘贴剪切板文本/图片" />
                    <Shortcut keys={["Ctrl / Cmd", "Z"]} value="撤销" />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value="重做" />
                    <Shortcut keys={["Ctrl / Cmd", "Y"]} value="重做" />
                    <Shortcut keys={["Delete / Backspace"]} value="删除选中" />
                    <Shortcut keys={["Esc"]} value="取消选择并关闭浮层" />
                    <Shortcut keys={["拖入图片"]} value="上传到画布" />
                </div>
            </Modal>
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
                            style={{ borderColor: "rgba(120,113,108,.28)", background: "linear-gradient(#fff, rgba(245,245,244,.92))", color: "rgb(68,64,60)" }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}

function productionNodeBadge(node: CanvasNodeData, packages: CanvasProductionPackageSummary[], labels: Map<string, string>) {
    const packageId = getNodeProductionPackageId(node);
    if (!packageId) return "";
    const packageLabel = labels.get(packageId) || node.metadata?.productionPackageLabel || packageId.slice(0, 4).toUpperCase();
    if (node.type === CanvasNodeType.Video) {
        const versionNumber = node.metadata?.productionVideoVersionNumber;
        const versionLabel = versionNumber ? `v${versionNumber}` : "";
        const productionPackage = packages.find((item) => item.id === packageId);
        const visibleVersions = productionPackage?.versions.filter((version) => !version.hidden) || [];
        const currentLabel = productionPackage?.currentVersion?.label || (node.metadata?.isCurrentProductionVersion ? versionLabel : "");
        if (visibleVersions.length > 1 && currentLabel) return `${visibleVersions.length} 个版本 / 当前 ${currentLabel}`;
        return node.metadata?.isCurrentProductionVersion && versionLabel ? `${packageLabel} · 当前视频版本 ${versionLabel}` : versionLabel ? `${packageLabel} · 视频版本 ${versionLabel}` : `${packageLabel} · 视频结果`;
    }
    return `${packageLabel} · ${productionPackageRoleLabel(getNodeProductionPackageRole(node))}`;
}

function canvasAssetTypeLabel(type: CanvasNodeType) {
    if (type === CanvasNodeType.Text) return "文本";
    if (type === CanvasNodeType.Video) return "视频";
    if (type === CanvasNodeType.Audio) return "音频";
    return "图片";
}

function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: "success", naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
    return { content: video.url, storageKey: video.storageKey, status: "success", naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", localStoredAt: new Date().toISOString() };
}

function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: "success", bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", localStoredAt: new Date().toISOString() };
}

async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveMediaUrl(node.metadata.storageKey, content) } };
            if (node.type !== CanvasNodeType.Image || !content) return node;
            if (node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveImageUrl(node.metadata.storageKey, content) } };
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                    images: await Promise.all((message.images || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeMetadata>) {
    const next = { ...node, metadata: { ...node.metadata, ...(patch || {}) } };
    const spec = node.type === CanvasNodeType.Video ? NODE_DEFAULT_SIZE[CanvasNodeType.Video] : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = typeof patch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(patch.size, spec.width, spec.height) : null;
    return size && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : next;
}

function shouldRememberVideoDefaults(node: CanvasNodeData | undefined, patch: Partial<CanvasNodeMetadata>) {
    if (node?.type !== CanvasNodeType.Config) return false;
    if (patch.generationMode === "video") return true;
    if (node.metadata?.generationMode !== "video") return false;
    return ["channelMode", "provider", "model", "size", "seconds", "duration", "vquality", "generateAudio", "watermark", "seed", "returnLastFrame", "videoReferenceImageMode"].some((key) => key in patch);
}

function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target", firstHandleId?: string) {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    const targetHandle = firstHandleType === "target" ? firstHandleId : undefined;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id, toHandle: targetHandle };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id, toHandle: targetHandle };
    return { fromNodeId: first.id, toNodeId: second.id };
}

function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}

function confirmVideoPromptReview(review: PromptReviewResult, modal: AppModal) {
    return new Promise<boolean>((resolve) => {
        modal.confirm({
            title: review.level === "risk" ? "提示词自审发现高风险" : "提示词自审提醒",
            centered: true,
            okText: "仍然生成",
            cancelText: "返回修改",
            width: 620,
            content: (
                <div className="space-y-3">
                    <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">{review.summary}</p>
                    <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                        {review.issues.map((issue, index) => (
                            <div key={`${issue.type}-${index}`} className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-700">
                                <div className="font-medium">{issue.title}</div>
                                <div className="mt-1 leading-6 text-stone-600 dark:text-stone-300">{issue.description}</div>
                                {issue.suggestion ? <div className="mt-1 leading-6 text-stone-500">建议：{issue.suggestion}</div> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}
