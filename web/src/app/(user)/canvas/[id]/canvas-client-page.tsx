"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { defaultConfig } from "@/stores/use-config-store";
import { canvasEpisodeLabel } from "../utils/canvas-episode-context";
import { isHiddenBatchChild } from "../utils/canvas-batch-nodes";
import { audioMetadata, createCanvasNode, imageMetadata, normalizeConnection, videoMetadata } from "../utils/canvas-page-helpers";
import { useCanvasConnections } from "../hooks/use-canvas-connections";
import { useCanvasClipboardActions } from "../hooks/use-canvas-clipboard-actions";
import { useCanvasConfigNodeActions } from "../hooks/use-canvas-config-node-actions";
import { useCanvasCapacity } from "../hooks/use-canvas-capacity";
import { useCanvasCapabilityActions } from "../hooks/use-canvas-capability-actions";
import { useCanvasDerivedState } from "../hooks/use-canvas-derived-state";
import { useCanvasAssetTitleSync } from "../hooks/use-canvas-asset-title-sync";
import { useCanvasDeleteActions } from "../hooks/use-canvas-delete-actions";
import { useCanvasGlobalPointerEvents } from "../hooks/use-canvas-global-pointer-events";
import { useCanvasHistory } from "../hooks/use-canvas-history";
import { useCanvasKeyboardShortcuts } from "../hooks/use-canvas-keyboard-shortcuts";
import { useCanvasMounted } from "../hooks/use-canvas-mounted";
import { useCanvasPageLocalState } from "../hooks/use-canvas-page-local-state";
import { useCanvasMediaCache } from "../hooks/use-canvas-media-cache";
import { useCanvasInspectorPanelActions } from "../hooks/use-canvas-inspector-panel-actions";
import { useCanvasGeneratedAssetArchive } from "../hooks/use-canvas-generated-asset-archive";
import { useCanvasGenerationNodeActions } from "../hooks/use-canvas-generation-node-actions";
import { useCanvasNodeCrudActions } from "../hooks/use-canvas-node-crud-actions";
import { useCanvasNodeDrag } from "../hooks/use-canvas-node-drag";
import { useCanvasBatchNodeUi } from "../hooks/use-canvas-batch-node-ui";
import { useCanvasNodeExecutionActions } from "../hooks/use-canvas-node-execution-actions";
import { useCanvasNodeInsertionActions } from "../hooks/use-canvas-node-insertion-actions";
import { useCanvasNodeMediaQualityActions } from "../hooks/use-canvas-node-media-quality-actions";
import { useCanvasPageActions } from "../hooks/use-canvas-page-actions";
import { useCanvasPageCallbacks } from "../hooks/use-canvas-page-callbacks";
import { useCanvasProjectLifecycle } from "../hooks/use-canvas-project-lifecycle";
import { useCanvasPageRuntimeEffects } from "../hooks/use-canvas-page-runtime-effects";
import { useCanvasProductionWorkbenchState } from "../hooks/use-canvas-production-workbench-state";
import { useCanvasRenderActions } from "../hooks/use-canvas-render-actions";
import { useCanvasRuntimeConfig } from "../hooks/use-canvas-runtime-config";
import { useCanvasSelectionBox } from "../hooks/use-canvas-selection-box";
import { useCanvasStoryboardCanvasActions } from "../hooks/use-canvas-storyboard-canvas-actions";
import { useCanvasNodeToolbarHover } from "../hooks/use-canvas-node-toolbar-hover";
import { useCanvasNodeToolbarState } from "../hooks/use-canvas-node-toolbar-state";
import { useCanvasToolbarActions } from "../hooks/use-canvas-toolbar-actions";
import { useCanvasUiActions } from "../hooks/use-canvas-ui-actions";
import { useCanvasVideoTaskRecovery } from "../hooks/use-canvas-video-task-recovery";
import { useCanvasMediaVersionActions } from "../hooks/use-canvas-media-version-actions";
import { useCanvasViewportGeometry } from "../hooks/use-canvas-viewport-geometry";
import { useCanvasWorkspaceStores } from "../hooks/use-canvas-workspace-stores";
import { shouldWriteGeneratedAsset } from "../utils/canvas-generated-asset-writeback";
import { App } from "antd";
import { CanvasConnectionsLayer } from "../components/canvas-connections-layer";
import { CanvasRefreshShell } from "../components/canvas-refresh-shell";
import { CanvasInteractionOverlays } from "../components/canvas-interaction-overlays";
import { CanvasTopBar } from "../components/canvas-top-bar";
import { CanvasSideInspector } from "../components/canvas-side-inspector";
import { CanvasPageOverlays } from "../components/canvas-page-overlays";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { CanvasNodesLayer } from "../components/canvas-nodes-layer";
import { CanvasFloatingControls } from "../components/canvas-floating-controls";
import { CanvasAssetBindingModal } from "../components/canvas-asset-binding-modal";
import { useAssetStore } from "@/stores/use-asset-store";
import { CANVAS_IMAGE_GENERATION_DEFAULT_COUNT } from "../constants";
import { CanvasNodeType, type CanvasNodeData } from "../types";

const CapabilityRunDrawer = dynamic(() => import("@/components/capability-runtime/capability-run-drawer").then((module) => module.CapabilityRunDrawer), { ssr: false });

export default function CanvasPage() {
    const mounted = useCanvasMounted();
    return mounted ? <InfiniteCanvasPage /> : <CanvasRefreshShell />;
}

function InfiniteCanvasPage() {
    const { message, modal } = App.useApp();
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const canvasId = params.id;
    const focusNodeId = searchParams.get("focusNodeId") || "";

    const {
        addAssetOnce: storeAddAssetOnce,
        assetBreakdownItems,
        assets,
        attachCanvasToCreativeProject,
        attachShotGroupCanvasNodes,
        attachStoryboardShotCanvasNodes,
        cleanupAssetImages,
        createProject,
        createEpisodeChildCanvas,
        creativeProject,
        canCreateChildCanvas,
        childCanvases,
        currentProject,
        deleteProjects,
        effectiveConfig,
        ensureProjectFolder,
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
        workspaceProjectId,
        workspaceProjectTitle,
    } = useCanvasWorkspaceStores(canvasId);
    const [classificationAssetIds, setClassificationAssetIds] = useState<string[]>([]);
    const addAssetOnce = useCallback(
        async (...args: Parameters<typeof storeAddAssetOnce>) => {
            const id = await storeAddAssetOnce(...args);
            const stored = useAssetStore.getState().assets.find((asset) => asset.id === id);
            if (currentProject?.projectId && currentProject.episodeId && stored?.kind === "image" && !stored.assetBinding && !shouldWriteGeneratedAsset(stored)) setClassificationAssetIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
            return id;
        },
        [currentProject, storeAddAssetOnce],
    );
    const { canvasAiConfig, canvasEpisodeContext } = useCanvasRuntimeConfig(currentProject, effectiveConfig);
    const {
        activeChatId,
        activeProductionPackageId,
        activeTimelineShotId,
        angleNodeId,
        assetPickerOpen,
        assetPickerTab,
        assistantMounted,
        backgroundMode,
        chatSessions,
        clearConfirmOpen,
        connections,
        connectionsRef,
        containerRef,
        contextMenu,
        cropNodeId,
        dialogNodeId,
        didInitialCenterRef,
        editRequestNonce,
        editingNodeId,
        expandedTextNodeId,
        handledFocusNodeIdRef,
        hoveredNodeId,
        imageBriefInitialId,
        imageBriefOpen,
        imageBriefOpenRequestId,
        imageInputRef,
        infoNodeId,
        inspectorView,
        isInspectorCollapsed,
        isMiniMapOpen,
        lastSelectedVideoNodeId,
        nodeCreateMenuPosition,
        nodeImageSettingsOpen,
        nodes,
        nodesRef,
        previewNodeId,
        processingQueueItemIdsRef,
        projectLoaded,
        recoveringVideoTaskIdsRef,
        runningNodeId,
        scriptManagerOpen,
        selectedConnectionId,
        selectedNodeIds,
        selectedNodeIdsRef,
        setActiveChatId,
        setActiveProductionPackageId,
        setActiveTimelineShotId,
        setAngleNodeId,
        setAssetPickerOpen,
        setAssetPickerTab,
        setAssistantCollapsed,
        setAssistantMounted,
        setBackgroundMode,
        setChatSessions,
        setClearConfirmOpen,
        setConnections,
        setContextMenu,
        setCropNodeId,
        setDialogNodeId,
        setEditRequestNonce,
        setEditingNodeId,
        setExpandedTextNodeId,
        setHoveredNodeId,
        setImageBriefOpen,
        setInfoNodeId,
        setInspectorView,
        setIsInspectorCollapsed,
        setIsMiniMapOpen,
        setLastSelectedVideoNodeId,
        setNodeCreateMenuPosition,
        setNodeImageSettingsOpen,
        setNodes,
        setPreviewNodeId,
        setProjectLoaded,
        setRunningNodeId,
        setScriptManagerOpen,
        setSelectedConnectionId,
        setSelectedNodeIds,
        setShowImageInfo,
        setSize,
        setStoryboardInitialGroupId,
        setStoryboardManagerOpen,
        setTitleDraft,
        setTitleEditing,
        setToolbarNodeId,
        setViewport,
        showImageInfo,
        size,
        storyboardInitialGroupId,
        storyboardManagerOpen,
        titleDraft,
        titleEditing,
        toolbarNodeId,
        uploadTargetRef,
        viewport,
        viewportRef,
    } = useCanvasPageLocalState();
    const getNodes = useCallback(() => nodesRef.current, [nodesRef]);
    const capacity = useCanvasCapacity(nodes, connections);
    const { downloadNodeMedia, cacheUploadedCanvasMedia } = useCanvasMediaCache({
        token,
        message,
        canvasId,
        canvasTitle: currentProject?.title || "未命名画布",
        projectId: workspaceProjectId,
        projectTitle: workspaceProjectTitle,
        episodeContext: canvasEpisodeContext,
        getNodes,
        setNodes,
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
    const { cleanupCanvasFiles, clearFocusParam, navigateCanvasPage, navigateToProjects, openProjectsHome, showCanvasSuccess, showImageGenerationError, showVideoGenerationWarning } = useCanvasPageCallbacks({
        canvasId,
        cleanupAssetImages,
        getCleanupHistory,
        message,
    });
    const { archiveGeneratedAsset, archiveGeneratedVideoNode, prepareGeneratedAssetNode } = useCanvasGeneratedAssetArchive({
        addAssetOnce,
        canvasEpisodeContext,
        canvasId,
        canvasTitle: currentProject?.title || "未命名画布",
        ensureProjectFolder,
        getNodes,
        projectPreset: currentProject?.preset,
        setNodes,
        workspaceProjectId,
        workspaceProjectTitle,
        token,
    });
    const { generateImageNode, generateTextNode, generateVideoNode, retryTextNode } = useCanvasGenerationNodeActions({
        archiveGeneratedAsset,
        cacheUploadedCanvasMedia,
        canvasId,
        canvasTitle: currentProject?.title || "未命名画布",
        episodeContext: canvasEpisodeContext,
        getNodes,
        prepareGeneratedAssetNode,
        projectId: workspaceProjectId,
        projectPreset: currentProject?.preset,
        projectTitle: workspaceProjectTitle,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        showImageError: showImageGenerationError,
        showVideoWarning: showVideoGenerationWarning,
        toImageMetadata: imageMetadata,
        toVideoMetadata: videoMetadata,
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

    useCanvasProjectLifecycle({
        canvasId,
        focusNodeId,
        handledFocusNodeIdRef,
        hydrated,
        nodes,
        openProject,
        projectLoaded,
        resetHistory,
        size,
        viewportRef,
        navigateToProjects,
        clearFocusParam,
        setActiveChatId,
        setBackgroundMode,
        setChatSessions,
        setConnections,
        setNodes,
        setProjectLoaded,
        setSelectedConnectionId,
        setSelectedNodeIds,
        setShowImageInfo,
        setDialogNodeId,
        setViewport,
    });

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

    const { screenToCanvas, getCanvasCenter, getAppendNodeCenter } = useCanvasViewportGeometry({
        containerRef,
        didInitialCenterRef,
        enabled: projectLoaded,
        nodesRef,
        selectedNodeIds,
        setSize,
        setViewport,
        size,
        viewportRef,
    });

    const { connectingParams, connectionTargetNodeId, pendingConnectionCreate, pendingConnectionCreateRef, mouseWorld, cancelPendingConnectionCreate, createConnectedNode, finishConnection, handleConnectStart, moveConnectionTarget } = useCanvasConnections(
        {
            nodesRef,
            connectionsRef,
            selectedNodeIdsRef,
            screenToCanvas,
            normalizeConnection,
            isNodeHidden: isHiddenBatchChild,
            createNode: createCanvasNode,
            configNodeMetadata: { model: canvasAiConfig.imageModel || canvasAiConfig.model, size: canvasAiConfig.size, count: CANVAS_IMAGE_GENERATION_DEFAULT_COUNT },
            showWarning: (text) => message.warning(text),
            setNodes,
            setConnections,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setContextMenu,
            setDialogNodeId,
        },
    );

    const { hideNodeToolbar, keepNodeToolbar } = useCanvasNodeToolbarHover({
        nodeDraggingRef,
        nodeImageSettingsOpen,
        setToolbarNodeId,
    });

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

    const { batchChildCountById, batchMotionById, collapsingBatchIds, nodeById, openingBatchIds, setBatchPrimary, toggleBatchExpanded } = useCanvasBatchNodeUi({ nodes, nodesRef, setNodes });

    const { activeNodeId, assetById, assetTitleById, frameReferencesByVideoId, selectedInspectorNode, selectedVideoNode, visibleNodes } = useCanvasDerivedState({
        assets,
        collapsingBatchIds,
        connections,
        containerRef,
        hoveredNodeId,
        lastSelectedVideoNodeId,
        nodeById,
        nodes,
        selectedNodeIds,
        size,
        viewport,
    });
    useCanvasAssetTitleSync({ assetTitleById, nodes, setNodes });
    useCanvasPageRuntimeEffects({
        connections,
        connectionsRef,
        dialogNodeId,
        nodes,
        nodesRef,
        selectedNodeIds,
        selectedNodeIdsRef,
        selectedVideoNode,
        setLastSelectedVideoNodeId,
        setNodeImageSettingsOpen,
        viewport,
        viewportRef,
    });
    const { toolbarNode, infoNode, cropNode, angleNode, previewNode, hasNewAssetVersion } = useCanvasNodeToolbarState({
        nodeById,
        assetById,
        toolbarNodeId,
        infoNodeId,
        cropNodeId,
        angleNodeId,
        previewNodeId,
    });
    const expandedTextNode = expandedTextNodeId ? nodeById.get(expandedTextNodeId) || null : null;
    const { episodeWorkbenchStats, episodeProductionLabel, timelineShots, timelineShotGroups, activeTimelineShot, activeTimelineShotGroups, activeTimelineNodeIds, activeTimelineNodes, productionPackages, productionPackageLabelMap, relatedHighlight } = useCanvasProductionWorkbenchState({
        canvasId,
        currentProject,
        creativeProject,
        productionPackagesEnabled: false,
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
        setViewport,
    });
    const { configInputsById, handleConfigNodeChange } = useCanvasConfigNodeActions({
        canvasAiConfig,
        connections,
        nodes,
        nodesRef,
        setNodes,
        updateConfig,
    });

    const { createNode, openNodeCreateMenuAtCanvasPoint, deleteNodes, deselectCanvas, clearCanvas, duplicateNode, handleNodeResize, toggleNodeFreeResize, handleNodeContentChange, handleNodePromptChange, openTextEditor } = useCanvasNodeCrudActions({
        canvasAiConfig,
        canvasId,
        chatSessions,
        connectionsRef,
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

    const createVideoFromImages = useCallback(
        (imageNodes: typeof nodes) => {
            const references = imageNodes.filter((node) => node.type === CanvasNodeType.Image && node.metadata?.content);
            if (references.length < 2) {
                message.warning("请先框选至少两张图片");
                return;
            }
            const right = Math.max(...references.map((node) => node.position.x + node.width));
            const top = Math.min(...references.map((node) => node.position.y));
            const videoNode = createCanvasNode(
                CanvasNodeType.Video,
                { x: right + 260, y: top + 150 },
                {
                    prompt: "",
                    status: "idle",
                    videoReferenceImageMode: "first_last_frame",
                    referenceRoles: references.map((node, index) => ({ nodeId: node.id, kind: "image", role: index === 0 ? "first_frame" : index === references.length - 1 ? "last_frame" : "reference", index: index + 1 })),
                    referenceOrder: references.map((node, index) => ({ nodeId: node.id, kind: "image", index: index + 1 })),
                    canvasSource: {
                        projectId: workspaceProjectId,
                        projectTitle: workspaceProjectTitle,
                        canvasId,
                        canvasTitle: currentProject?.title || "未命名画布",
                        nodeId: "",
                        sourceNodeId: references[0]?.id,
                        generationParams: { referenceCount: references.length, action: "create_video_node_from_images" },
                    },
                },
            );
            const nextVideoNode: CanvasNodeData = {
                ...videoNode,
                metadata: {
                    ...videoNode.metadata,
                    canvasSource: {
                        projectId: workspaceProjectId,
                        projectTitle: workspaceProjectTitle,
                        canvasId,
                        canvasTitle: currentProject?.title || "未命名画布",
                        nodeId: videoNode.id,
                        sourceNodeId: references[0]?.id,
                        generationParams: { referenceCount: references.length, action: "create_video_node_from_images" },
                    },
                },
            };
            setNodes((prev) => [...prev, nextVideoNode]);
            setConnections((prev) => [
                ...prev,
                ...references.map((node, index) => ({
                    id: `connection-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId: node.id,
                    toNodeId: nextVideoNode.id,
                    toHandle: index === 0 ? "first_frame" : index === references.length - 1 ? "last_frame" : undefined,
                })),
            ]);
            setSelectedNodeIds(new Set([nextVideoNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(nextVideoNode.id);
        },
        [canvasId, currentProject?.title, message, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, workspaceProjectId, workspaceProjectTitle],
    );

    const { createAndOpenProject, deleteCurrentProject, finishTitleEditing, openEpisodeWorkbench, openWorkflowAssistant, organizeCanvas, resetViewport, returnTarget, returnToParent, saveCurrentProject, setZoomScale, startTitleEditing } =
        useCanvasPageActions({
            activeChatId,
            attachCanvasToCreativeProject,
            backgroundMode,
            canvasId,
            chatSessions,
            cleanupAssetImages,
            connections,
            createProject,
            currentProject,
            deleteProjects,
            flushProjects,
            message,
            navigate: navigateCanvasPage,
            nodes,
            renameProject,
            setContextMenu,
            setNodes,
            setTitleDraft,
            setTitleEditing,
            setViewport,
            showImageInfo,
            size,
            titleDraft,
            updateProject,
            viewport,
        });
    const createAndOpenCanvas = useCallback(() => {
        if (canCreateChildCanvas && currentProject) {
            try {
                const childId = createEpisodeChildCanvas(currentProject.id, "");
                if (currentProject.projectId) attachCanvasToCreativeProject(currentProject.projectId, childId);
                navigateCanvasPage(`/canvas/${childId}`);
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "子画布创建失败");
            }
            return;
        }
        if (currentProject?.canvasRole === "child") return message.warning("子画布不能继续创建下一级画布");
        createAndOpenProject();
    }, [attachCanvasToCreativeProject, canCreateChildCanvas, createAndOpenProject, createEpisodeChildCanvas, currentProject, message, navigateCanvasPage]);
    const returnFromCanvas = useCallback(() => {
        if (currentProject?.parentCanvasId) return navigateCanvasPage(`/canvas/${currentProject.parentCanvasId}`);
        returnToParent();
    }, [currentProject, navigateCanvasPage, returnToParent]);
    useCanvasGlobalPointerEvents({
        clearSelectionBox,
        finishConnection,
        finishNodeDrag,
        moveConnectionTarget,
        moveNodeDrag,
        moveSelectionBox,
    });

    const {
        applyAssistantActions,
        addCanvasNodeToAssets,
        createBriefImageConfigNode,
        createFileNodes,
        createImageFileNode,
        handleAssetInsert,
        handleDrop,
        handleImageInputChange,
        handleUploadRequest,
        insertAssistantImage,
        insertAssistantText,
        pasteAssistantImage,
        saveNodeAsset,
        updateCanvasNodeAssetReference,
    } = useCanvasNodeInsertionActions({
        addAssetOnce,
        assetById,
        canvasId,
        canvasAiConfig,
        canvasTitle: currentProject?.title || "未命名画布",
        connectionsRef,
        containerRef,
        ensureProjectFolder,
        getCanvasCenter,
        imageInputRef,
        message,
        uploadTargetRef,
        nodesRef,
        size,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setConnections,
        showUploadSuccess: showCanvasSuccess,
        toImageMetadata: imageMetadata,
        toVideoMetadata: videoMetadata,
        toAudioMetadata: audioMetadata,
        workspaceProjectId,
        workspaceProjectTitle,
    });

    const { deleteConnection, deleteSelection } = useCanvasDeleteActions({ deleteNodes, selectedConnectionId, selectedNodeIdsRef, setConnections, setSelectedConnectionId });
    const { switchMediaVersion } = useCanvasMediaVersionActions({ modal, setNodes });
    const canvasCapability = useCanvasCapabilityActions({ nodes, nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId });

    const toolbarActions = useCanvasToolbarActions({
        createNode,
        handleUploadRequest,
        deleteSelection,
        deselectCanvas,
        openEpisodeWorkbench,
        setClearConfirmOpen,
        setAssetPickerTab,
        setAssetPickerOpen,
    });

    const { copySelectedNodes, pasteCopiedNodes, pasteSystemClipboard, pasteClipboardEvent } = useCanvasClipboardActions({
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        createImageFileNode,
        createFileNodes,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        showSuccess: showCanvasSuccess,
    });

    const { closeCanvasOverlays, confirmVideoPromptReviewWithTheme, handleAssistantSessionsChange, handleFontSizeChange, preventCanvasContextMenu } = useCanvasUiActions({
        cancelPendingConnectionCreate,
        modal,
        setActiveChatId,
        setAngleNodeId,
        setChatSessions,
        setContextMenu,
        setCropNodeId,
        setDialogNodeId,
        setEditingNodeId,
        setHoveredNodeId,
        setInfoNodeId,
        setNodes,
        setPreviewNodeId,
        setToolbarNodeId,
        skipNextHistoryCommit,
    });

    useCanvasKeyboardShortcuts({
        containerRef,
        nodesRef,
        selectedNodeIdsRef,
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
        deleteSelection,
    });

    const { normalizeVideoFrameReferences, refreshingReviewNodeId, refreshNodeVolcengineReview, submittingReviewNodeId, submitNodeVolcengineReview } = useCanvasNodeMediaQualityActions({
        token,
        message,
        nodes,
        nodesRef,
        setNodes,
        assets,
        addAssetOnce,
        updateAsset,
        volcengineAssetEnabled,
        toImageMetadata: imageMetadata,
    });

    const { cropImageNode, generateAngleNode, handleGenerateNode, handleRefreshVideoTask, nodeToolActions } = useCanvasNodeExecutionActions({
        flow: {
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
        },
        queue: {
            projectLoaded,
            queuePaused,
            queueItems,
            queueConcurrency,
            workspaceProjectId,
            nodesRef,
            processingQueueItemIdsRef,
            markQueueItemRunning,
            markQueueItemSucceeded,
            markQueueItemFailed,
        },
        refresh: {
            archiveGeneratedVideoNode,
            cacheUploadedCanvasMedia,
            canvasAiConfig,
            message,
            setNodes,
            toVideoMetadata: videoMetadata,
        },
        retry: {
            assets,
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
            canvasTitle: currentProject?.title || "未命名画布",
            projectPreset: currentProject?.preset,
            canvasEpisodeContext,
            canvasId,
            archiveGeneratedAsset,
            prepareGeneratedAssetNode,
        },
        derivative: {
            addCanvasNodeToAssets,
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
            canvasTitle: currentProject?.title || "未命名画布",
            workspaceProjectId,
            workspaceProjectTitle,
            canvasEpisodeContext,
            message,
            createNode: createCanvasNode,
            imageMetadata,
        },
        tools: {
            deleteNodes,
            downloadNodeMedia,
            handleFontSizeChange,
            handleUploadRequest,
            openNodeCapability: canvasCapability.openNodeCapability,
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
        },
    });

    const inspectorPanelActions = useCanvasInspectorPanelActions({
        setAssetPickerOpen,
        setAssetPickerTab,
        setAssistantMounted,
        setIsInspectorCollapsed,
    });
    const renderActions = useCanvasRenderActions({
        setAngleNodeId,
        setAssetPickerOpen,
        setClearConfirmOpen,
        setContextMenu,
        setCropNodeId,
        setImageBriefOpen,
        setInfoNodeId,
        setIsMiniMapOpen,
        setNodeCreateMenuPosition,
        setPreviewNodeId,
        setScriptManagerOpen,
        setSelectedConnectionId,
        setSelectedNodeIds,
        setStoryboardInitialGroupId,
        setStoryboardManagerOpen,
        setViewport,
    });

    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    episodeProductionLabel={currentProject?.canvasRole === "child" ? "子画布" : canCreateChildCanvas ? `主画布 · ${episodeProductionLabel}` : episodeProductionLabel}
                    hasEpisode={Boolean(currentProject?.episodeId)}
                    canCreateChildCanvas={canCreateChildCanvas}
                    childCanvases={childCanvases}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    capacity={capacity}
                    returnLabel={currentProject?.parentCanvasId ? "返回主画布" : returnTarget.label}
                    onReturnParent={returnFromCanvas}
                    onHome={openProjectsHome}
                    onCreateProject={createAndOpenCanvas}
                    onOpenChildCanvas={(id) => navigateCanvasPage(`/canvas/${id}`)}
                    onDeleteProject={deleteCurrentProject}
                    onSaveProject={saveCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onOpenAssets={inspectorPanelActions.openAssetPicker}
                    onOrganizeCanvas={organizeCanvas}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    backgroundMode={backgroundMode}
                    onViewportChange={renderActions.updateViewport}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasDoubleClick={openNodeCreateMenuAtCanvasPoint}
                    onCanvasDeselect={deselectCanvas}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                    onPaste={(event) => pasteClipboardEvent(event)}
                >
                    <CanvasConnectionsLayer
                        connectingParams={connectingParams}
                        connections={connections}
                        mouseWorld={mouseWorld}
                        nodeById={nodeById}
                        nodes={nodes}
                        relatedConnectionIds={relatedHighlight.connectionIds}
                        selectedConnectionId={selectedConnectionId}
                        viewport={viewport}
                        viewportSize={size}
                        onSelectConnection={renderActions.selectConnection}
                        onDeleteConnection={deleteConnection}
                    />

                    <CanvasNodesLayer
                        activeNodeId={activeNodeId}
                        canvasAiConfig={canvasAiConfig}
                        activeProductionPackageId={activeProductionPackageId}
                        activeTimelineNodeIds={activeTimelineNodeIds}
                        batchChildCountById={batchChildCountById}
                        batchMotionById={batchMotionById}
                        collapsingBatchIds={collapsingBatchIds}
                        configInputsById={configInputsById}
                        connectionTargetNodeId={connectionTargetNodeId}
                        connections={connections}
                        deleteConnection={deleteConnection}
                        dialogNodeId={dialogNodeId}
                        editRequestNonce={editRequestNonce}
                        editingNodeId={editingNodeId}
                        frameReferencesByVideoId={frameReferencesByVideoId}
                        handleConfigNodeChange={handleConfigNodeChange}
                        handleConnectStart={handleConnectStart}
                        handleGenerateNode={handleGenerateNode}
                        handleNodeContentChange={handleNodeContentChange}
                        handleNodeMouseDown={handleNodeMouseDown}
                        handleNodePromptChange={handleNodePromptChange}
                        handleNodeResize={handleNodeResize}
                        handleRefreshVideoTask={handleRefreshVideoTask}
                        handleSwitchMediaVersion={switchMediaVersion}
                        hideNodeToolbar={hideNodeToolbar}
                        isConnecting={Boolean(connectingParams)}
                        keepNodeToolbar={keepNodeToolbar}
                        nodeDraggingRef={nodeDraggingRef}
                        nodes={nodes}
                        nodesRef={nodesRef}
                        nodeToolActions={nodeToolActions}
                        normalizeVideoFrameReferences={normalizeVideoFrameReferences}
                        openingBatchIds={openingBatchIds}
                        productionPackageLabelMap={productionPackageLabelMap}
                        productionPackages={productionPackages}
                        relatedNodeIds={relatedHighlight.nodeIds}
                        runningNodeId={runningNodeId}
                        selectedNodeIds={selectedNodeIds}
                        selectionBox={selectionBox}
                        setBatchPrimary={setBatchPrimary}
                        setContextMenu={setContextMenu}
                        setDialogNodeId={setDialogNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                        setSelectedConnectionId={setSelectedConnectionId}
                        setSelectedNodeIds={setSelectedNodeIds}
                        setNodeImageSettingsOpen={setNodeImageSettingsOpen}
                        setToolbarNodeId={setToolbarNodeId}
                        onExpandText={setExpandedTextNodeId}
                        showImageInfo={showImageInfo}
                        submittingReviewNodeId={submittingReviewNodeId}
                        toggleBatchExpanded={toggleBatchExpanded}
                        scale={viewport.k}
                        visibleNodes={visibleNodes}
                        workspaceProjectId={workspaceProjectId}
                    />

                    <CanvasInteractionOverlays
                        nodeCreateMenuPosition={nodeCreateMenuPosition}
                        pendingConnectionCreate={pendingConnectionCreate}
                        selectionBox={selectionBox}
                        selectionFill={theme.canvas.selectionFill}
                        selectionStroke={theme.canvas.selectionStroke}
                        onCancelPendingConnectionCreate={cancelPendingConnectionCreate}
                        onCloseNodeCreateMenu={renderActions.closeNodeCreateMenu}
                        onCreateConnectedNode={createConnectedNode}
                        onCreateNode={createNode}
                    />
                </InfiniteCanvas>

                <CanvasFloatingControls
                    backgroundMode={backgroundMode}
                    canRedo={historyState.canRedo}
                    canUndo={historyState.canUndo}
                    contextMenu={contextMenu}
                    deleteNodes={deleteNodes}
                    duplicateNode={duplicateNode}
                    hasNewAssetVersion={hasNewAssetVersion}
                    hideNodeToolbar={hideNodeToolbar}
                    isMiniMapOpen={isMiniMapOpen}
                    isNodeDragging={isNodeDragging}
                    keepNodeToolbar={keepNodeToolbar}
                    nodeImageSettingsOpen={nodeImageSettingsOpen}
                    nodeToolActions={nodeToolActions}
                    nodes={nodes}
                    onCreateVideoFromImages={createVideoFromImages}
                    onRedo={redoCanvas}
                    onResetViewport={resetViewport}
                    onSetZoomScale={setZoomScale}
                    onToggleMiniMap={renderActions.toggleMiniMap}
                    onUndo={undoCanvas}
                    refreshingReviewNodeId={refreshingReviewNodeId}
                    selectedNodeCount={selectedNodeIds.size}
                    selectedNodeIds={selectedNodeIds}
                    setBackgroundMode={setBackgroundMode}
                    setContextMenu={setContextMenu}
                    setShowImageInfo={setShowImageInfo}
                    setViewport={setViewport}
                    showImageInfo={showImageInfo}
                    size={size}
                    submittingReviewNodeId={submittingReviewNodeId}
                    toolbarActions={toolbarActions}
                    toolbarNode={toolbarNode}
                    viewport={viewport}
                />

                <CanvasPageOverlays
                    angleNode={angleNode}
                    assetPickerOpen={assetPickerOpen}
                    assetPickerTab={assetPickerTab}
                    canvases={currentProject ? [currentProject] : []}
                    clearConfirmOpen={clearConfirmOpen}
                    cropNode={cropNode}
                    imageBriefInitialId={imageBriefInitialId}
                    imageBriefOpen={imageBriefOpen}
                    imageBriefOpenRequestId={imageBriefOpenRequestId}
                    imageInputRef={imageInputRef}
                    infoNode={infoNode}
                    expandedTextNode={expandedTextNode}
                    nodes={nodes}
                    previewNode={previewNode}
                    projectId={workspaceProjectId}
                    projectTitle={workspaceProjectTitle}
                    episodeId={currentProject?.episodeId}
                    scriptInitialEpisodeId={currentProject?.episodeId}
                    scriptManagerOpen={scriptManagerOpen}
                    storyboardInitialGroupId={storyboardInitialGroupId}
                    storyboardManagerOpen={storyboardManagerOpen}
                    onAddShotGroupToCanvas={addShotGroupToCanvas}
                    onAddStoryboardGroupToCanvas={addStoryboardGroupToCanvas}
                    onAssetInsert={handleAssetInsert}
                    onClearCanvas={clearCanvas}
                    onCloseAngle={renderActions.closeAngle}
                    onCloseAssetPicker={renderActions.closeAssetPicker}
                    onCloseClearConfirm={renderActions.closeClearConfirm}
                    onCloseCrop={renderActions.closeCrop}
                    onCloseImageBrief={renderActions.closeImageBrief}
                    onCloseInfo={renderActions.closeInfo}
                    onCloseTextEditor={() => setExpandedTextNodeId(null)}
                    onClosePreview={renderActions.closePreview}
                    onCloseScriptManager={renderActions.closeScriptManager}
                    onCloseStoryboardManager={renderActions.closeStoryboardManager}
                    onCreateBriefImageConfig={createBriefImageConfigNode}
                    onCropImageNode={(node, crop, mode) => void cropImageNode(node, crop, mode)}
                    onGenerateAngleNode={(node, params) => void generateAngleNode(node, params)}
                    onImageInputChange={handleImageInputChange}
                    onOpenStoryboardGroup={renderActions.openStoryboardGroup}
                    onSaveTextNode={handleNodeContentChange}
                />
                <CapabilityRunDrawer
                    open={Boolean(canvasCapability.activeNode)}
                    onClose={canvasCapability.close}
                    title="节点 Skill 能力"
                    source="canvas_chat"
                    projectId={workspaceProjectId || canvasId}
                    episodeId={currentProject?.episodeId}
                    sourceText={canvasCapability.sourceText}
                    targetKind="node"
                    targetId={canvasCapability.activeNode?.id || canvasId}
                    onConsume={canvasCapability.consume}
                />
                {currentProject?.projectId && currentProject.episodeId ? (
                    <CanvasAssetBindingModal assetId={classificationAssetIds[0]} projectId={currentProject.projectId} episodeId={currentProject.episodeId} onClose={() => setClassificationAssetIds((ids) => ids.slice(1))} />
                ) : null}
            </section>
            <CanvasSideInspector
                activeChatId={activeChatId}
                activeShotId={activeTimelineShotId}
                assistantMounted={assistantMounted}
                assetTitleById={assetTitleById}
                canvasEpisodeId={canvasEpisodeContext?.episodeId}
                canvasId={canvasId}
                checklistNodes={nodes}
                checklistShotGroups={timelineShotGroups}
                checklistShots={timelineShots}
                collapsed={isInspectorCollapsed}
                configInputs={selectedInspectorNode?.type === CanvasNodeType.Config ? configInputsById.get(selectedInspectorNode.id) || [] : []}
                connections={connections}
                episodeLabel={canvasEpisodeLabel(currentProject)}
                hasEpisode={Boolean(currentProject?.episodeId)}
                nodes={nodes}
                nodeToolActions={nodeToolActions}
                productionLabel={episodeProductionLabel}
                projectId={workspaceProjectId}
                selectedCount={selectedNodeIds.size}
                selectedNode={selectedInspectorNode}
                selectedNodeIds={selectedNodeIds}
                selectedProductionPackage={null}
                selectedShot={activeTimelineShot}
                selectedShotGroups={activeTimelineShotGroups}
                selectedShotNodes={activeTimelineNodes}
                selectedVideoNode={null}
                sessions={chatSessions}
                stats={episodeWorkbenchStats}
                title={currentProject?.title || "未命名画布"}
                view={inspectorView}
                onApplyAssistantActions={applyAssistantActions}
                onConsumeAgentOutput={canvasCapability.consumeAgentOutput}
                onAssistantCollapse={inspectorPanelActions.collapseAssistant}
                onAssistantCollapseStart={() => setAssistantCollapsed(true)}
                onBindSelectedVideoToProductionPackage={() => undefined}
                onCollapsedChange={setIsInspectorCollapsed}
                onDownloadProductionVideoVersion={() => undefined}
                onHideProductionVideoVersion={() => undefined}
                onInsertImage={insertAssistantImage}
                onInsertProductionPackageConfigNode={() => undefined}
                onInsertText={insertAssistantText}
                onOpenAssets={inspectorPanelActions.openAssetPicker}
                onOpenAssistant={inspectorPanelActions.openAssistant}
                onOpenEpisodeWorkbench={openEpisodeWorkbench}
                onOpenWorkflowAssistant={openWorkflowAssistant}
                onPasteImage={pasteAssistantImage}
                onPreviewProductionVideoVersion={() => undefined}
                onSelectNodeIds={setSelectedNodeIds}
                onSelectShot={handleTimelineShotSelect}
                onSessionsChange={handleAssistantSessionsChange}
                onSetCurrentProductionVideoVersion={() => undefined}
                onViewChange={setInspectorView}
            />
        </main>
    );
}
