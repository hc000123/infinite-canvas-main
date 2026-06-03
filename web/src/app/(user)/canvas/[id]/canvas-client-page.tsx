"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { AudioLines, Home, ImageIcon, Images, List, Menu, MessageSquare, Plus, Redo2, Settings2, Trash2, Undo2, Upload, Video } from "lucide-react";

import { requestEdit } from "@/services/api/image";
import { defaultSeedanceImageRole, type SeedanceImageRoleMode } from "@/services/api/video-reference";
import { fetchVolcengineAssetStatus, submitVolcengineImageAsset } from "@/services/api/volcengine-assets";
import { refreshVideoTask, type VideoGenerationReferenceInput } from "@/services/api/video";
import { defaultConfig, type AiConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { getImageBlob, resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import { resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { activeVolcengineAssetURI, buildVolcengineImageFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "@/services/volcengine-asset-metadata";
import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { applyAssistantCanvasActions, type AssistantCanvasAction } from "../utils/canvas-assistant-actions";
import { removeVariantVideoConnections } from "../utils/canvas-connection-cleanup";
import { buildGenerationConfig, buildRetryGenerationConfig } from "../utils/canvas-generation-config";
import { buildImageGenerationMetadata, buildRetryImageGenerationMetadata, buildVideoGenerationMetadata, buildVideoReferenceInput, directVideoReferenceInputs, storedReferenceImageRole, videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { runCanvasImageGeneration, runCanvasVideoGeneration } from "../utils/canvas-generation-runner";
import { buildContinuousVideoChain } from "../utils/canvas-video-chain";
import { buildCapturedVideoFrameNode } from "../utils/canvas-video-frame";
import { buildVideoGenerationPlan, shouldCreateVideoVariant } from "../utils/canvas-video-generation-plan";
import { canvasNodeToAsset } from "../utils/canvas-assets";
import { buildReferenceMentionOptions } from "../utils/canvas-reference-mentions";
import { resetInterruptedGeneration } from "../utils/canvas-video-task-recovery";
import { cropDataUrl } from "../utils/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { useCanvasConnections, type CanvasPendingConnectionCreate } from "../hooks/use-canvas-connections";
import { useCanvasHistory } from "../hooks/use-canvas-history";
import { useCanvasKeyboardShortcuts } from "../hooks/use-canvas-keyboard-shortcuts";
import { useCanvasMediaCache } from "../hooks/use-canvas-media-cache";
import { useCanvasNodeDrag } from "../hooks/use-canvas-node-drag";
import { useCanvasSelectionBox } from "../hooks/use-canvas-selection-box";
import { useCanvasImageGenerationActions } from "../hooks/use-canvas-image-generation-actions";
import { useCanvasTextGenerationActions } from "../hooks/use-canvas-text-generation-actions";
import { useCanvasVideoGenerationActions } from "../hooks/use-canvas-video-generation-actions";
import { useCanvasVideoTaskRecovery } from "../hooks/use-canvas-video-task-recovery";
import { App, Button, Dropdown, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import { ActiveConnectionPath, ConnectionPath } from "../components/canvas-connections";
import { CanvasConfigNodePanel } from "../components/canvas-config-node-panel";
import { CanvasAssistantPanel } from "../components/canvas-assistant-panel";
import { CanvasNodeContextMenu } from "../components/canvas-context-menu";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "../components/canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "../components/canvas-node-crop-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, hydrateNodeGenerationContext, type NodeGenerationInput } from "../components/canvas-node-generation";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "../components/canvas-node-hover-toolbar";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { Minimap } from "../components/canvas-mini-map";
import { CanvasNode } from "../components/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";
import { CanvasToolbar } from "../components/canvas-toolbar";
import { AssetPickerModal, type AssetPickerTab, type InsertAssetPayload } from "../components/asset-picker-modal";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { useCanvasStore } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasAssistantImage, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ConnectionHandle, type ContextMenuState, type Position, type ViewportTransform } from "../types";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/audio";
import type { ReferenceVideo } from "@/types/video";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;

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
    pending,
    onCreate,
    onClose,
}: {
    pending: CanvasPendingConnectionCreate;
    onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: pending.position.x, top: pending.position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    引用该节点生成
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
    const { message } = App.useApp();
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const projectId = params.id;
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const didInitialCenterRef = useRef(false);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const canvasAiConfig = effectiveConfig.channelMode === "local" ? config : effectiveConfig;
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const volcengineAssetEnabled = useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true);
    const token = useUserStore((state) => state.token);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
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
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTab, setAssetPickerTab] = useState<AssetPickerTab>("my-assets");
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
    const [assistantCollapsed, setAssistantCollapsed] = useState(true);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [submittingReviewNodeId, setSubmittingReviewNodeId] = useState<string | null>(null);
    const [refreshingReviewNodeId, setRefreshingReviewNodeId] = useState<string | null>(null);
    const processingReviewNodeIds = useMemo(() => volcengineReviewPollingKey(nodes), [nodes]);

    const nodesRef = useRef(nodes);
    const recoveringVideoTaskIdsRef = useRef<Set<string>>(new Set());
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const showImageGenerationError = useCallback((text: string) => message.error(text), [message]);
    const showVideoGenerationWarning = useCallback((text: string) => message.warning(text), [message]);
    const { generateImageNode } = useCanvasImageGenerationActions({
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        showError: showImageGenerationError,
        toImageMetadata: imageMetadata,
    });
    const { generateTextNode, retryTextNode } = useCanvasTextGenerationActions({
        setNodes,
        setConnections,
    });
    const { generateVideoNode } = useCanvasVideoGenerationActions({
        setNodes,
        setConnections,
        cacheUploadedCanvasMedia,
        showWarning: showVideoGenerationWarning,
        toVideoMetadata: videoMetadata,
    });
    const { historyState, resetHistory, undoCanvas, redoCanvas, pauseHistory, resumeHistory, skipNextHistoryCommit, getCleanupHistory } = useCanvasHistory({
        projectId,
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
        const project = openProject(projectId);
        if (!project) {
            router.replace("/canvas");
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
    }, [hydrated, openProject, projectId, resetHistory, router]);

    useCanvasVideoTaskRecovery({
        projectLoaded,
        nodesRef,
        recoveringVideoTaskIdsRef,
        canvasAiConfig,
        cacheUploadedCanvasMedia,
        setNodes,
        toVideoMetadata: videoMetadata,
    });

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

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

    const { connectingParams, connectionTargetNodeId, pendingConnectionCreate, pendingConnectionCreateRef, mouseWorld, cancelPendingConnectionCreate, createConnectedNode, finishConnection, handleConnectStart, moveConnectionTarget } = useCanvasConnections(
        {
            nodesRef,
            connectionsRef,
            screenToCanvas,
            normalizeConnection,
            isNodeHidden: isHiddenBatchChild,
            createNode: createCanvasNode,
            configNodeMetadata: { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: 3 },
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
        [nodeImageSettingsOpen],
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
    const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
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
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        nodeIds.add(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);

    const createNode = useCallback(
        (type: CanvasNodeType, position?: Position) => {
            const targetPosition = position || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          count: 3,
                      }
                    : undefined;
            const newNode = createCanvasNode(type, targetPosition, configMetadata);

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            nodesRef.current.forEach((node) => {
                if (ids.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
            });
            setNodes((prev) => {
                const next = prev.filter((node) => !allIds.has(node.id));
                return next.map((node) => {
                    const childIds = node.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                    if (!node.metadata?.isBatchRoot || childIds?.length === node.metadata.batchChildIds?.length) return node;
                    const primaryImageId = childIds?.includes(node.metadata.primaryImageId || "") ? node.metadata.primaryImageId : childIds?.[0];
                    const primaryNode = next.find((item) => item.id === primaryImageId);
                    return {
                        ...node,
                        metadata: {
                            ...node.metadata,
                            batchChildIds: childIds,
                            primaryImageId,
                            content: primaryNode?.metadata?.content || node.metadata.content,
                            naturalWidth: primaryNode?.metadata?.naturalWidth || node.metadata.naturalWidth,
                            naturalHeight: primaryNode?.metadata?.naturalHeight || node.metadata.naturalHeight,
                        },
                    };
                });
            });
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setEditingNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, projectId],
    );

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        clearSelectionBox();
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate, clearSelectionBox]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setCropNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next: CanvasNodeData = {
            ...source,
            id,
            title: `${source.title} Copy`,
            position: { x: source.position.x + 36, y: source.position.y + 36 },
        };

        setNodes((prev) => [...prev, next]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, []);

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = center.x - (bounds.left + bounds.right) / 2;
        const dy = center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const fromNodeId = idMap.get(connection.fromNodeId);
            const toNodeId = idMap.get(connection.toNodeId);
            if (!fromNodeId || !toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...nextNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(nextNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter]);

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
        const id = createProject(`无限画布 ${useCanvasStore.getState().projects.length + 1}`);
        router.push(`/canvas/${id}`);
    }, [createProject, router]);

    const deleteCurrentProject = useCallback(() => {
        deleteProjects([projectId]);
        cleanupAssetImages();
        router.push("/canvas");
    }, [cleanupAssetImages, deleteProjects, projectId, router]);

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
        (node: CanvasNodeData) => {
            const asset = canvasNodeToAsset(node);
            if (!asset) return false;
            addAsset(asset);
            return true;
        },
        [addAsset],
    );

    const createImageFileNode = useCallback(
        async (file: File, position: Position) => {
            const image = await uploadImage(file);
            const size = fitNodeSize(image.width, image.height);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: imageMetadata(image),
            };

            setNodes((prev) => [...prev, newNode]);
            addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [addCanvasNodeToAssets],
    );

    const createVideoFileNode = useCallback(
        async (file: File, position: Position) => {
            const video = await uploadMediaFile(file, "video");
            const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
            const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode: CanvasNodeData = {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: videoMetadata(video),
            };
            setNodes((prev) => [...prev, newNode]);
            addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [addCanvasNodeToAssets],
    );

    const createAudioFileNode = useCallback(
        async (file: File, position: Position) => {
            const audio = await uploadMediaFile(file, "audio");
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode: CanvasNodeData = {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            };
            setNodes((prev) => [...prev, newNode]);
            addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
        },
        [addCanvasNodeToAssets],
    );

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            message.success("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) message.success("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message]);

    useCanvasKeyboardShortcuts({
        nodesRef,
        selectedNodeIdsRef,
        selectedConnectionId,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setHoveredNodeId,
        setToolbarNodeId,
        setDialogNodeId,
        setEditingNodeId,
        setInfoNodeId,
        setCropNodeId,
        clearSelectionBox,
        cancelPendingConnectionCreate,
        undoCanvas,
        redoCanvas,
        copySelectedNodes,
        pasteCopiedNodes,
        pasteSystemClipboard,
        deleteNodes,
    });

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)));
    }, []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);

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
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                return { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } };
            }),
        );
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                          ...node,
                          width: child.width,
                          height: child.height,
                          metadata: {
                              ...node.metadata,
                              content: child.metadata?.content,
                              primaryImageId: child.id,
                              naturalWidth: child.metadata?.naturalWidth,
                              naturalHeight: child.metadata?.naturalHeight,
                              freeResize: child.metadata?.freeResize,
                          },
                      }
                    : node,
            ),
        );
    }, []);

    const openTextEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(node.id);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeMetadata>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (!addCanvasNodeToAssets(node)) return message.error(`没有可保存的${canvasAssetTypeLabel(node.type)}`);
            message.success("已加入我的素材");
        },
        [addCanvasNodeToAssets, message],
    );

    const submitNodeVolcengineReview = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return;
            if (!volcengineAssetEnabled) {
                message.warning("请先开启火山人像加白");
                return;
            }
            if (!token) {
                message.error("请先登录");
                return;
            }
            setSubmittingReviewNodeId(node.id);
            try {
                const storedBlob = node.metadata.storageKey ? await getImageBlob(node.metadata.storageKey) : null;
                const blob = storedBlob || (await fetchCanvasImageBlob(node.metadata.content));
                if (!blob) {
                    message.error("没有找到图片文件");
                    return;
                }
                const title = node.metadata.prompt || node.title || "画布图片";
                const result = await submitVolcengineImageAsset(token, {
                    file: blob,
                    filename: buildVolcengineImageFilename(title, node.id, node.metadata.mimeType || blob.type),
                    assetTitle: title,
                    groupId: node.metadata.volcengineAsset?.groupId,
                    groupName: title,
                });
                const volcengineAsset = volcengineReviewMetadataFromSubmission(result);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, volcengineAsset } } : item)));
                message.success("已提交火山加白");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "提交加白失败");
            } finally {
                setSubmittingReviewNodeId(null);
            }
        },
        [message, token, volcengineAssetEnabled],
    );

    const refreshNodeVolcengineReview = useCallback(
        async (node: CanvasNodeData, options: { silent?: boolean; showProgress?: boolean } = {}) => {
            const saved = node.metadata?.volcengineAsset;
            if (node.type !== CanvasNodeType.Image || !saved?.assetId) return;
            if (!token) {
                if (!options.silent) message.error("请先登录");
                return;
            }
            const showProgress = options.showProgress || !options.silent;
            if (showProgress) setRefreshingReviewNodeId(node.id);
            try {
                const status = await fetchVolcengineAssetStatus(token, {
                    assetId: saved.assetId,
                    projectName: saved.projectName,
                });
                const volcengineAsset = mergeVolcengineReviewStatus(saved, status);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, volcengineAsset } } : item)));
                if (!options.silent) {
                    const statusText = `当前状态：${volcengineStatusLabel(volcengineAsset.status)}${volcengineAsset.error ? `：${volcengineAsset.error}` : ""}`;
                    if (volcengineAsset.status === "Failed") message.error(statusText);
                    else message.success(statusText);
                }
            } catch (error) {
                if (!options.silent) message.error(error instanceof Error ? error.message : "刷新加白状态失败");
            } finally {
                if (showProgress) setRefreshingReviewNodeId((current) => (current === node.id ? null : current));
            }
        },
        [message, token],
    );

    useEffect(() => {
        if (!token || !volcengineAssetEnabled || !processingReviewNodeIds) return;
        let cancelled = false;
        let polling = false;
        const pollProcessingReviews = async () => {
            if (polling || cancelled) return;
            polling = true;
            for (const node of nodes) {
                if (cancelled) break;
                if (node.type === CanvasNodeType.Image && isVolcengineReviewProcessing(node.metadata?.volcengineAsset)) {
                    await refreshNodeVolcengineReview(node, { silent: true, showProgress: true });
                }
            }
            polling = false;
        };
        void pollProcessingReviews();
        const timer = window.setInterval(() => void pollProcessingReviews(), 3000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [nodes, processingReviewNodeIds, refreshNodeVolcengineReview, token, volcengineAssetEnabled]);

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        const cropped = await cropDataUrl(node.metadata.content, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Cropped Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
        setCropNodeId(null);
    }, []);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(canvasAiConfig, node, "image", defaultConfig), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }]).then(
                    (items) => items[0],
                );
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                setRunningNodeId(null);
            }
        },
        [canvasAiConfig, openConfigDialog],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !file.type.startsWith("audio/"))) return;

            if (target?.nodeId) {
                const currentNode = nodesRef.current.find((node) => node.id === target.nodeId);
                if (!currentNode) return;
                if (file.type.startsWith("audio/")) {
                    const audio = await uploadMediaFile(file, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const nextNode: CanvasNodeData = {
                        ...currentNode,
                        type: CanvasNodeType.Audio,
                        title: file.name,
                        position: { x: currentNode.position.x + currentNode.width / 2 - spec.width / 2, y: currentNode.position.y + currentNode.height / 2 - spec.height / 2 },
                        width: spec.width,
                        height: spec.height,
                        metadata: { ...currentNode.metadata, ...audioMetadata(audio), errorDetails: undefined },
                    };
                    setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? nextNode : node)));
                    addCanvasNodeToAssets(nextNode);
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(null);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (file.type.startsWith("video/")) {
                    const video = await uploadMediaFile(file, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    const nextNode: CanvasNodeData = {
                        ...currentNode,
                        type: CanvasNodeType.Video,
                        title: file.name,
                        position: { x: currentNode.position.x + currentNode.width / 2 - nextSize.width / 2, y: currentNode.position.y + currentNode.height / 2 - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { ...currentNode.metadata, ...videoMetadata(video), errorDetails: undefined },
                    };
                    setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? nextNode : node)));
                    addCanvasNodeToAssets(nextNode);
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                const image = await uploadImage(file);
                const size = fitNodeSize(image.width, image.height);
                const nextNode: CanvasNodeData = {
                    ...currentNode,
                    type: CanvasNodeType.Image,
                    title: file.name,
                    width: size.width,
                    height: size.height,
                    metadata: {
                        ...currentNode.metadata,
                        ...imageMetadata(image),
                        errorDetails: undefined,
                        freeResize: false,
                        isBatchRoot: undefined,
                        batchRootId: undefined,
                        batchChildIds: undefined,
                        batchUsesReferenceImages: undefined,
                        generationType: undefined,
                        model: undefined,
                        size: undefined,
                        quality: undefined,
                        count: undefined,
                        references: undefined,
                        primaryImageId: undefined,
                        imageBatchExpanded: undefined,
                    },
                };
                setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? nextNode : node)));
                addCanvasNodeToAssets(nextNode);
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                void (file.type.startsWith("audio/") ? createAudioFileNode(file, position) : file.type.startsWith("video/") ? createVideoFileNode(file, position) : createImageFileNode(file, position));
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [addCanvasNodeToAssets, createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || item.type.startsWith("audio/"));
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void (file.type.startsWith("audio/") ? createAudioFileNode(file, pos) : file.type.startsWith("video/") ? createVideoFileNode(file, pos) : createImageFileNode(file, pos));
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
    );

    const pasteAssistantImage = useCallback(
        (file: File) => {
            const position = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            void createImageFileNode(file, position);
            message.success("已从剪切板添加图片");
        },
        [createImageFileNode, message, screenToCanvas, size.height, size.width],
    );

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
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu(null);
    }, []);

    const handleContinueVideoNode = useCallback(
        async (videoNode: CanvasNodeData) => {
            const lastFrameUrl = videoNode.metadata?.lastFrameUrl;
            if (videoNode.type !== CanvasNodeType.Video || !lastFrameUrl) {
                message.warning("没有可续写的尾帧");
                return;
            }
            try {
                const lastFrameBlob = await fetchCanvasImageBlob(lastFrameUrl);
                if (!lastFrameBlob) {
                    message.warning("没有可续写的尾帧");
                    return;
                }
                const generationConfig = buildGenerationConfig(canvasAiConfig, videoNode, "video", defaultConfig);
                const lastFrameImage = await uploadImage(lastFrameBlob);
                const chain = buildContinuousVideoChain({ videoNode, lastFrameImage, lastFrameMetadata: imageMetadata(lastFrameImage), config: generationConfig });
                setNodes((prev) => [...prev.map((node) => (node.id === videoNode.id ? { ...node, metadata: { ...node.metadata, lastFrameStorageKey: lastFrameImage.storageKey } } : node)), chain.lastFrameNode, chain.nextVideoNode]);
                setConnections((prev) => [...prev, ...chain.connections]);
                setSelectedNodeIds(new Set([chain.nextVideoNode.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(chain.nextVideoNode.id);
            } catch (error) {
                message.warning(error instanceof Error ? `连续视频节点创建失败：${error.message}` : "连续视频节点创建失败");
            }
        },
        [canvasAiConfig, message],
    );

    const captureVideoCurrentFrame = useCallback(
        async (videoNode: CanvasNodeData) => {
            if (videoNode.type !== CanvasNodeType.Video || !videoNode.metadata?.content) {
                message.warning("没有可截取的视频");
                return;
            }
            try {
                const video = findVideoElement(videoNode.id);
                if (!video) throw new Error("没有找到视频播放器，请先打开或刷新该视频节点");
                const frame = await captureVideoElementFrame(video);
                const uploaded = await uploadImage(frame.blob);
                const { frameNode, connection } = buildCapturedVideoFrameNode({
                    videoNode,
                    image: uploaded,
                    imageMetadata: imageMetadata(uploaded),
                    capturedTime: frame.currentTime,
                    capturedAt: new Date().toISOString(),
                });
                setNodes((prev) => [...prev, frameNode]);
                setConnections((prev) => [...prev, connection]);
                setSelectedNodeIds(new Set([frameNode.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(frameNode.id);
                message.success(`已截取当前帧：${formatVideoFrameTime(frame.currentTime)}`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "截取当前帧失败");
            }
        },
        [message],
    );

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(canvasAiConfig, sourceNode, mode, defaultConfig);
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            setRunningNodeId(nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationContext = await hydrateNodeGenerationContext(
                buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt),
            );
            const rawEffectivePrompt = generationContext.prompt.trim();
            const effectivePrompt = rawEffectivePrompt;
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            if (!effectivePrompt && mode === "text") {
                setRunningNodeId(null);
                return;
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

            try {
                if (mode === "image") {
                    const imageResult = await generateImageNode({
                        nodeId,
                        sourceNode,
                        prompt,
                        effectivePrompt,
                        generationConfig,
                        contextReferenceImages: generationContext.referenceImages,
                    });
                    pendingChildIds = imageResult.pendingChildIds;
                    return;
                }

                if (mode === "video") {
                    const isVideoVariantGeneration = shouldCreateVideoVariant(generationConfig, sourceNode);
                    const storedVariantImages = isVideoVariantGeneration ? await resolveStoredImageReferences(sourceNode?.metadata || {}) : undefined;
                    const storedVariantVideos = isVideoVariantGeneration ? await resolveStoredVideoReferences(sourceNode?.metadata || {}) : undefined;
                    const storedVariantAudios = isVideoVariantGeneration ? await resolveStoredAudioReferences(sourceNode?.metadata || {}) : undefined;
                    if (storedVariantImages === null) throw new Error("参考图片已丢失，无法继续生成变体");
                    if (storedVariantVideos === null) throw new Error("参考视频已丢失，无法继续生成变体");
                    if (storedVariantAudios === null) throw new Error("参考音频已丢失，无法继续生成变体");
                    const sourceImageReferences = isVideoVariantGeneration ? storedVariantImages || [] : sourceNodeReferenceImages(sourceNode, generationConfig.videoReferenceImageMode);
                    const sourceVideoReferences = isVideoVariantGeneration ? storedVariantVideos || [] : sourceNodeReferenceVideos(sourceNode);
                    const sourceAudioReferences = isVideoVariantGeneration ? storedVariantAudios || [] : sourceNodeReferenceAudios(sourceNode);
                    const sourceReferenceInputs =
                        isVideoVariantGeneration && sourceNode
                            ? storedVideoReferenceInputs(sourceNode.metadata || {}, sourceImageReferences, sourceVideoReferences, sourceAudioReferences) || directVideoReferenceInputs(sourceImageReferences, sourceVideoReferences, sourceAudioReferences)
                            : directVideoReferenceInputs(sourceImageReferences, sourceVideoReferences, sourceAudioReferences);
                    const videoPlan = buildVideoGenerationPlan({
                        config: generationConfig,
                        sourceNode,
                        sourceReferences: { images: sourceImageReferences, videos: sourceVideoReferences, audios: sourceAudioReferences, inputs: sourceReferenceInputs },
                        contextReferences: { images: generationContext.referenceImages, videos: generationContext.referenceVideos, audios: generationContext.referenceAudios, inputs: generationContext.referenceInputs },
                        storedVariantReferences: { images: storedVariantImages || [], videos: storedVariantVideos || [], audios: storedVariantAudios || [], inputs: sourceReferenceInputs },
                    });
                    const videoResult = await generateVideoNode({
                        nodeId,
                        sourceNode,
                        effectivePrompt,
                        generationConfig,
                        videoPlan,
                        setPendingChildIds: (ids) => {
                            pendingChildIds = ids;
                        },
                    });
                    pendingChildIds = videoResult.pendingChildIds;
                    return;
                }

                const textResult = await generateTextNode({
                    nodeId,
                    sourceNode,
                    prompt,
                    effectivePrompt,
                    generationConfig,
                    generationContext,
                    editingTextNode,
                });
                pendingChildIds = textResult.pendingChildIds;
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                if (mode === "video") {
                    const videoRecord = nodesRef.current.find((n) => n.id === nodeId || pendingChildIds.includes(n.id));
                    if (videoRecord?.metadata?.taskStatus === "succeeded" && videoRecord.metadata.videoUrl) {
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === videoRecord.id
                                    ? {
                                          ...node,
                                          width: videoRecord.width,
                                          height: videoRecord.height,
                                          metadata: {
                                              ...node.metadata,
                                              status: NODE_STATUS_SUCCESS,
                                              errorDetails: undefined,
                                              content: videoRecord.metadata?.videoUrl,
                                              mimeType: "video/mp4",
                                          },
                                      }
                                    : node.id === nodeId && markSourceStatus
                                      ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                                      : node,
                            ),
                        );
                        setRunningNodeId(null);
                        return;
                    }
                }
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) => (node.id === nodeId || pendingChildIds.includes(node.id) ? (node.id === nodeId && !markSourceStatus ? node : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } }) : node)),
                );
            } finally {
                setRunningNodeId(null);
            }
        },
        [canvasAiConfig, generateImageNode, generateTextNode, generateVideoNode, isAiConfigReady, message, openConfigDialog],
    );

    const handleRefreshVideoTask = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Video || !node.metadata?.taskId) {
                message.warning("没有可刷新的视频任务");
                return;
            }
            try {
                const generationConfig = buildGenerationConfig(canvasAiConfig, node, "video", defaultConfig);
                const task = await refreshVideoTask(generationConfig, node.metadata.taskId);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } } : item)));
                message.success(`任务状态：${task.status}`);
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "刷新任务失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, errorDetails } } : item)));
            }
        },
        [canvasAiConfig, message],
    );

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig = buildRetryGenerationConfig({ config: canvasAiConfig, sourceNode, targetNode: node, savedImageMetadata, defaults: defaultConfig });
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            const savedVideoImages = node.type === CanvasNodeType.Video ? await resolveStoredImageReferences(node.metadata || {}) : undefined;
            const savedVideoVideos = node.type === CanvasNodeType.Video ? await resolveStoredVideoReferences(node.metadata || {}) : undefined;
            const savedVideoAudios = node.type === CanvasNodeType.Video ? await resolveStoredAudioReferences(node.metadata || {}) : undefined;
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            if (savedVideoImages === null) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            if (savedVideoVideos === null) {
                message.error("参考视频已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考视频已丢失，无法继续重试" } } : item)));
                return;
            }
            if (savedVideoAudios === null) {
                message.error("参考音频已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考音频已丢失，无法继续重试" } } : item)));
                return;
            }

            setRunningNodeId(node.id);
            const generationStartedAt = node.type === CanvasNodeType.Video ? Date.now() : undefined;
            setNodes((prev) =>
                prev.map((item) =>
                    item.id === node.id
                        ? {
                              ...item,
                              metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined, ...(generationStartedAt ? { generationStartedAt, taskStatus: undefined, rawTaskStatus: undefined } : {}) },
                          }
                        : item,
                ),
            );

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    await retryTextNode({ node, prompt, generationConfig, generationContext: context });
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const videoReferences = buildVideoReferenceInput(
                        savedVideoImages ?? context?.referenceImages ?? [],
                        savedVideoVideos ?? context?.referenceVideos ?? [],
                        savedVideoAudios ?? context?.referenceAudios ?? [],
                        storedVideoReferenceInputs(node.metadata || {}, savedVideoImages || [], savedVideoVideos || [], savedVideoAudios || []) || context?.referenceInputs,
                        generationConfig.videoReferenceImageMode,
                    );
                    const { video } = await runCanvasVideoGeneration(generationConfig, prompt, videoReferences, (task) => {
                        setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } } : item)));
                    });
                    const cachedVideo = await cacheUploadedCanvasMedia(video, `${node.id}.mp4`);
                    const videoSize = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id
                                ? {
                                      ...item,
                                      width: videoSize.width,
                                      height: videoSize.height,
                                      position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
                                      metadata: { ...item.metadata, ...videoMetadata(video), ...cachedVideo, prompt, ...buildVideoGenerationMetadata(generationConfig, videoReferences), taskStatus: "succeeded", errorDetails: undefined },
                                  }
                                : item,
                        ),
                    );
                    return;
                }

                const imageReferences = retryReferenceImages || [];
                const uploadedImage = await runCanvasImageGeneration(generationConfig, prompt, imageReferences);
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const imageSize = fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
                const generationMetadata = buildRetryImageGenerationMetadata(savedImageMetadata, generationConfig, useReferenceImages, retryReferenceImages);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  type: CanvasNodeType.Image,
                                  width: imageSize.width,
                                  height: imageSize.height,
                                  metadata: { ...item.metadata, ...imageMetadata(uploadedImage), prompt, ...generationMetadata },
                              }
                            : item,
                    ),
                );
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                setRunningNodeId(null);
            }
        },
        [canvasAiConfig, message, openConfigDialog, retryTextNode, token],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: 3,
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt, volcengineAsset: image.volcengineAsset },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: text.slice(0, 32) || "Assistant Text",
            };

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
                insertAssistantText(payload.content);
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Video,
                        title: payload.title,
                        position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else if (payload.kind === "audio") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Audio,
                        title: payload.title,
                        position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 },
                        width: spec.width,
                        height: spec.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, bytes: payload.bytes, mimeType: payload.mimeType || "audio/mpeg", status: NODE_STATUS_SUCCESS },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else {
                insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey, volcengineAsset: payload.volcengineAsset });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => router.push("/")}
                    onProjects={() => router.push("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    assistantCollapsed={assistantCollapsed}
                    onExpandAssistant={() => {
                        setAssistantMounted(true);
                        setAssistantCollapsed(false);
                    }}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    backgroundMode={backgroundMode}
                    onViewportChange={(next) => {
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onCanvasMouseDown={handleCanvasMouseDown}
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
                            isFocusRelated={activeNodeId === node.id}
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
                            renderPanel={(panelNode) => (
                                <CanvasNodePromptPanel
                                    node={panelNode}
                                    isRunning={runningNodeId === panelNode.id}
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
                            onRetry={(node) => void handleRetryNode(node)}
                            onRefreshVideoTask={(node) => void handleRefreshVideoTask(node)}
                            onGenerateImage={generateImageFromTextNode}
                            onDownload={(node) => void downloadNodeMedia(node)}
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
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                </InfiniteCanvas>

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                    viewport={viewport}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onEditText={openTextEditor}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onDownload={downloadNodeMedia}
                    onSaveAsset={(node) => void saveNodeAsset(node)}
                    onContinueVideo={(node) => void handleContinueVideoNode(node)}
                    onCaptureVideoFrame={(node) => void captureVideoCurrentFrame(node)}
                    onReviewAsset={(node) => void submitNodeVolcengineReview(node)}
                    onRefreshReview={(node) => void refreshNodeVolcengineReview(node)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={(node) => setPreviewNodeId(node.id)}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                    submittingReview={toolbarNode ? submittingReviewNodeId === toolbarNode.id : false}
                    refreshingReview={toolbarNode ? refreshingReviewNodeId === toolbarNode.id : false}
                />

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onDeselect={deselectCanvas}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                    onOpenAssetLibrary={() => {
                        setAssetPickerTab("library");
                        setAssetPickerOpen(true);
                    }}
                    onOpenMyAssets={() => {
                        setAssetPickerTab("my-assets");
                        setAssetPickerOpen(true);
                    }}
                />

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

                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={handleImageInputChange} />

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
            </section>
            {assistantMounted ? (
                <CanvasAssistantPanel
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
                    onCollapse={() => setAssistantMounted(false)}
                />
            ) : null}
        </main>
    );
}

function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onImportImage,
    onUndo,
    onRedo,
    assistantCollapsed,
    onExpandAssistant,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onImportImage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    assistantCollapsed: boolean;
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
                                { key: "home", icon: <Home className="size-4" />, label: "主页", onClick: onHome },
                                { key: "projects", icon: <Images className="size-4" />, label: "我的画布", onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: "新建画布", onClick: onCreateProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除当前画布", onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "import", icon: <Upload className="size-4" />, label: "导入图片", onClick: onImportImage },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text="撤销" shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button type="button" className="grid size-9 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label="打开画布菜单">
                            <Menu className="size-5" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2">
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
                                className="max-w-[280px] bg-transparent p-0 text-left text-lg font-semibold tracking-normal outline-none"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-[280px] truncate border-b border-dashed border-transparent text-left text-lg font-semibold tracking-normal transition hover:border-current"
                                onDoubleClick={onStartTitleEditing}
                                title="双击修改画布名称"
                            >
                                {title}
                            </button>
                        )}
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-1.5">
                    <UserStatusActions
                        variant="canvas"
                        accountOpen={accountOpen}
                        onAccountOpenChange={setAccountOpen}
                        accountRef={accountRef}
                        getPopupContainer={(node) => node.parentElement || document.body}
                        onOpenShortcuts={() => {
                            setShortcutsOpen(true);
                            setAccountOpen(false);
                        }}
                    />
                    {assistantCollapsed ? (
                        <>
                            <span className="h-6 w-px" style={{ background: theme.toolbar.border }} />
                            <Button
                                type="text"
                                className="!h-10 !rounded-xl !px-3 !font-medium"
                                style={{ background: theme.toolbar.panel, color: theme.node.text, boxShadow: "0 10px 30px rgba(28,25,23,.10)" }}
                                icon={<MessageSquare className="size-4" />}
                                onClick={onExpandAssistant}
                            >
                                助手
                            </Button>
                        </>
                    ) : null}
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

async function fetchCanvasImageBlob(url: string) {
    if (!url) return null;
    const response = await fetch(url);
    return response.blob();
}

function findVideoElement(nodeId: string) {
    const selector = `[data-node-id="${cssEscape(nodeId)}"] video`;
    return document.querySelector<HTMLVideoElement>(selector);
}

async function captureVideoElementFrame(video: HTMLVideoElement): Promise<{ blob: Blob; currentTime: number }> {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
        throw new Error("视频尚未加载到可截取画面，请等待画面出现后再试");
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法创建截图画布");
    const currentTime = video.currentTime;
    try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (error) {
        throw new Error(error instanceof DOMException && error.name === "SecurityError" ? "视频来源跨域，当前画布无法截取该帧" : "无法绘制当前视频帧");
    }
    const blob = await canvasToPngBlob(canvas);
    return { blob, currentTime };
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("无法导出当前视频帧，可能是跨域视频污染了画布"));
            }, "image/png");
        } catch (error) {
            reject(error instanceof DOMException && error.name === "SecurityError" ? new Error("视频来源跨域，当前画布无法截取该帧") : error);
        }
    });
}

function cssEscape(value: string) {
    return typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function formatVideoFrameTime(value: number) {
    return `${Math.max(0, Math.round(value * 1000) / 1000)}s`;
}

function volcengineStatusLabel(status: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
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

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    const references = await resolveStoredImageReferences(metadata);
    return references === undefined ? null : references;
}

async function resolveStoredImageReferences(metadata: CanvasNodeMetadata) {
    if (!metadata.references?.length) return undefined;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const seedanceRole = storedReferenceImageRole(metadata, index);
            if (url.startsWith("asset://")) return { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl: url, assetUri: url, seedanceRole };
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined, seedanceRole } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

async function resolveStoredVideoReferences(metadata: CanvasNodeMetadata) {
    if (!metadata.videoReferences?.length) return undefined;
    const references = await Promise.all(
        metadata.videoReferences.map(async (url, index) => {
            const mediaUrl = url.startsWith("video:") ? await resolveMediaUrl(url, "") : url;
            return mediaUrl ? { id: `${index}`, name: `reference-${index}.mp4`, type: "video/mp4", url: mediaUrl, storageKey: url.startsWith("video:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceVideo[]) : null;
}

async function resolveStoredAudioReferences(metadata: CanvasNodeMetadata) {
    if (!metadata.audioReferences?.length) return undefined;
    const references = await Promise.all(
        metadata.audioReferences.map(async (url, index) => {
            const mediaUrl = url.startsWith("audio:") ? await resolveMediaUrl(url, "") : url;
            return mediaUrl ? { id: `${index}`, name: `reference-${index}.${audioExtension()}`, type: "audio/mpeg", url: mediaUrl, storageKey: url.startsWith("audio:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceAudio[]) : null;
}

function storedVideoReferenceInputs(metadata: CanvasNodeMetadata, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    if (!metadata.referenceOrder?.length) return undefined;
    const inputs = metadata.referenceOrder.flatMap((item): VideoGenerationReferenceInput[] => {
        const index = Math.max(0, item.index - 1);
        if (item.kind === "image" && images[index]) return [{ type: "image", nodeId: item.nodeId, image: images[index] }];
        if (item.kind === "video" && videos[index]) return [{ type: "video", nodeId: item.nodeId, video: videos[index] }];
        if (item.kind === "audio" && audios[index]) return [{ type: "audio", nodeId: item.nodeId, audio: audios[index] }];
        return [];
    });
    return inputs.length ? inputs : undefined;
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

function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
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

function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

function sourceNodeReferenceImages(node: CanvasNodeData | null | undefined, mode?: SeedanceImageRoleMode) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
            assetUri: activeVolcengineAssetURI(node.metadata.volcengineAsset),
            seedanceRole: defaultSeedanceImageRole(0, mode),
        },
    ];
}

function sourceNodeReferenceVideos(node: CanvasNodeData | null | undefined) {
    if (!node || node.type !== CanvasNodeType.Video || !node.metadata?.content) return [];
    const url = node.metadata.videoUrl || node.metadata.cacheUrl || node.metadata.content;
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.mp4`,
            type: node.metadata.mimeType || "video/mp4",
            url,
            storageKey: node.metadata.videoUrl || node.metadata.cacheUrl ? undefined : node.metadata.storageKey,
        },
    ];
}

function sourceNodeReferenceAudios(node: CanvasNodeData | null | undefined) {
    if (!node || node.type !== CanvasNodeType.Audio || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.${audioExtension(node.metadata.mimeType)}`,
            type: node.metadata.mimeType || "audio/mpeg",
            url: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

function audioExtension(mimeType?: string) {
    const subtype = mimeType?.split(";")[0]?.split("/")[1]?.toLowerCase();
    if (!subtype || subtype === "mpeg") return "mp3";
    if (subtype === "x-wav") return "wav";
    return subtype;
}

function isHiddenBatchChild(node: CanvasNodeData, nodes: CanvasNodeData[], collapsingBatchIds?: Set<string>) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = nodes.find((item) => item.id === rootId);
    if (root && collapsingBatchIds?.has(rootId)) return false;
    return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function isHiddenBatchConnectionEndpoint(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = nodes.find((item) => item.id === rootId);
    return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? "正面视角" : params.horizontalAngle > 0 ? `向右旋转 ${params.horizontalAngle} 度` : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
    const pitch = params.pitchAngle === 0 ? "水平视角" : params.pitchAngle > 0 ? `俯视 ${params.pitchAngle} 度` : `仰视 ${Math.abs(params.pitchAngle)} 度`;
    return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
