"use client";

import { useParams, useSearchParams } from "next/navigation";
import { defaultConfig } from "@/stores/use-config-store";
import { canvasEpisodeLabel } from "../utils/canvas-episode-context";
import { isHiddenBatchChild } from "../utils/canvas-batch-nodes";
import {
    audioMetadata,
    createCanvasNode,
    imageMetadata,
    normalizeConnection,
    videoMetadata,
} from "../utils/canvas-page-helpers";
import { useCanvasConnections } from "../hooks/use-canvas-connections";
import { useCanvasClipboardActions } from "../hooks/use-canvas-clipboard-actions";
import { useCanvasConfigNodeActions } from "../hooks/use-canvas-config-node-actions";
import { useCanvasDerivedState } from "../hooks/use-canvas-derived-state";
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
import { useCanvasProductionPackageActions } from "../hooks/use-canvas-production-package-actions";
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
import { useCanvasViewportGeometry } from "../hooks/use-canvas-viewport-geometry";
import { useCanvasWorkspaceStores } from "../hooks/use-canvas-workspace-stores";
import { App } from "antd";
import { CanvasConnectionsLayer } from "../components/canvas-connections-layer";
import { CanvasProductionPackageBar } from "../components/canvas-production-package-bar";
import { CanvasRefreshShell } from "../components/canvas-refresh-shell";
import { CanvasInteractionOverlays } from "../components/canvas-interaction-overlays";
import { CanvasTopBar } from "../components/canvas-top-bar";
import { CanvasSideInspector } from "../components/canvas-side-inspector";
import { CanvasPageOverlays } from "../components/canvas-page-overlays";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { CanvasNodesLayer } from "../components/canvas-nodes-layer";
import { CanvasFloatingControls } from "../components/canvas-floating-controls";
import { CanvasNodeType } from "../types";

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
        workspaceProjectId,
        workspaceProjectTitle,
    } = useCanvasWorkspaceStores(canvasId);
    const { canvasAiConfig, canvasEpisodeContext } = useCanvasRuntimeConfig(currentProject, effectiveConfig);
    const {
        activeChatId, activeProductionPackageId, activeTimelineShotId, angleNodeId, assetPickerOpen, assetPickerTab, assistantMounted, backgroundMode,
        chatSessions, clearConfirmOpen, connections, connectionsRef, containerRef, contextMenu, cropNodeId, dialogNodeId, didInitialCenterRef,
        editRequestNonce, editingNodeId, handledFocusNodeIdRef, hoveredNodeId, imageBriefInitialId, imageBriefOpen, imageBriefOpenRequestId,
        imageInputRef, infoNodeId, inspectorView, isInspectorCollapsed, isMiniMapOpen, lastSelectedVideoNodeId, nodeCreateMenuPosition,
        nodeImageSettingsOpen, nodes, nodesRef, previewNodeId, processingQueueItemIdsRef, projectLoaded, recoveringVideoTaskIdsRef, runningNodeId,
        scriptManagerOpen, selectedConnectionId, selectedNodeIds, selectedNodeIdsRef, setActiveChatId, setActiveProductionPackageId,
        setActiveTimelineShotId, setAngleNodeId, setAssetPickerOpen, setAssetPickerTab, setAssistantCollapsed, setAssistantMounted, setBackgroundMode,
        setChatSessions, setClearConfirmOpen, setConnections, setContextMenu, setCropNodeId, setDialogNodeId, setEditRequestNonce, setEditingNodeId,
        setHoveredNodeId, setImageBriefOpen, setInfoNodeId, setInspectorView, setIsInspectorCollapsed, setIsMiniMapOpen, setLastSelectedVideoNodeId,
        setNodeCreateMenuPosition, setNodeImageSettingsOpen, setNodes, setPreviewNodeId, setProjectLoaded, setRunningNodeId, setScriptManagerOpen,
        setSelectedConnectionId, setSelectedNodeIds, setShowImageInfo, setSize, setStoryboardInitialGroupId, setStoryboardManagerOpen, setTitleDraft,
        setTitleEditing, setToolbarNodeId, setViewport, showImageInfo, size, storyboardInitialGroupId, storyboardManagerOpen, titleDraft, titleEditing,
        toolbarNodeId, uploadTargetRef, viewport, viewportRef,
    } = useCanvasPageLocalState();
    const { downloadNodeMedia, cacheUploadedCanvasMedia } = useCanvasMediaCache({ token, message, setNodes });
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
    const { archiveGeneratedAsset, archiveGeneratedVideoNode } = useCanvasGeneratedAssetArchive({
        addAssetOnce,
        canvasEpisodeContext,
        canvasId,
        ensureProjectFolder,
        projectPreset: currentProject?.preset,
        setNodes,
        workspaceProjectId,
        workspaceProjectTitle,
    });
    const { generateImageNode, generateTextNode, generateVideoNode, retryTextNode } = useCanvasGenerationNodeActions({
        archiveGeneratedAsset,
        cacheUploadedCanvasMedia,
        canvasId,
        episodeContext: canvasEpisodeContext,
        getNodes: () => nodesRef.current,
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

    const { activeNodeId, assetById, assetTitleById, frameReferencesByVideoId, packageSlotVideoNode, selectedInspectorNode, selectedVideoNode, visibleNodes } = useCanvasDerivedState({
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

    const { createAndOpenProject, deleteCurrentProject, finishTitleEditing, openEpisodeWorkbench, openWorkflowAssistant, resetViewport, returnTarget, returnToParent, saveCurrentProject, setZoomScale, startTitleEditing } = useCanvasPageActions({
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
        ensureUnfiledProject,
        flushProjects,
        message,
        navigate: navigateCanvasPage,
        nodes,
        renameProject,
        setContextMenu,
        setTitleDraft,
        setTitleEditing,
        setViewport,
        showImageInfo,
        size,
        titleDraft,
        updateProject,
        viewport,
    });

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
        canvasAiConfig,
        connectionsRef,
        containerRef,
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
        setAssetPickerOpen,
        showUploadSuccess: showCanvasSuccess,
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
        },
        derivative: {
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
        },
        tools: {
            deleteNodes,
            downloadNodeMedia,
            handleFontSizeChange,
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
        },
    });

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
    const inspectorPanelActions = useCanvasInspectorPanelActions({
        focusProductionPackage,
        setAssetPickerOpen,
        setAssetPickerTab,
        setAssistantCollapsed,
        setAssistantMounted,
        setInspectorView,
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
                    onHome={openProjectsHome}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onSaveProject={saveCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onOpenEpisodeScript={openEpisodeWorkbench}
                    onOpenWorkflowAssistant={openWorkflowAssistant}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    assistantActive={assistantMounted && inspectorView === "assistant" && !isInspectorCollapsed}
                    onExpandAssistant={inspectorPanelActions.expandAssistantPanel}
                />

                <CanvasProductionPackageBar
                    packages={productionPackages}
                    activePackageId={activeProductionPackageId}
                    inspectorCollapsed={isInspectorCollapsed}
                    selectedVideoNodeId={packageSlotVideoNode?.type === CanvasNodeType.Video && packageSlotVideoNode.metadata?.content ? packageSlotVideoNode.id : ""}
                    onSelect={inspectorPanelActions.selectProductionPackage}
                    onInsertConfig={handleInsertProductionPackageConfigNode}
                    onEditPrompt={handleEditProductionPackagePrompt}
                    onBindVideo={handleBindSelectedVideoToProductionPackage}
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
                        onSelectConnection={renderActions.selectConnection}
                    />

                    <CanvasNodesLayer
                        activeNodeId={activeNodeId}
                        activeProductionPackageId={activeProductionPackageId}
                        activeTimelineNodeIds={activeTimelineNodeIds}
                        batchChildCountById={batchChildCountById}
                        batchMotionById={batchMotionById}
                        collapsingBatchIds={collapsingBatchIds}
                        configInputsById={configInputsById}
                        connectionTargetNodeId={connectionTargetNodeId}
                        connections={connections}
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
                        setHoveredNodeId={setHoveredNodeId}
                        setNodeImageSettingsOpen={setNodeImageSettingsOpen}
                        setToolbarNodeId={setToolbarNodeId}
                        showImageInfo={showImageInfo}
                        submittingReviewNodeId={submittingReviewNodeId}
                        toggleBatchExpanded={toggleBatchExpanded}
                        viewport={viewport}
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
                    activeTimelineShotId={activeTimelineShotId}
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
                    onOpenEpisodeWorkbench={openEpisodeWorkbench}
                    onRedo={redoCanvas}
                    onResetViewport={resetViewport}
                    onSelectShot={handleTimelineShotSelect}
                    onSetZoomScale={setZoomScale}
                    onToggleMiniMap={renderActions.toggleMiniMap}
                    onUndo={undoCanvas}
                    refreshingReviewNodeId={refreshingReviewNodeId}
                    selectedNodeCount={selectedNodeIds.size}
                    setBackgroundMode={setBackgroundMode}
                    setContextMenu={setContextMenu}
                    setShowImageInfo={setShowImageInfo}
                    setViewport={setViewport}
                    shotGroups={timelineShotGroups}
                    shots={timelineShots}
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
                    nodes={nodes}
                    previewNode={previewNode}
                    projectId={workspaceProjectId}
                    projectTitle={workspaceProjectTitle}
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
                    onClosePreview={renderActions.closePreview}
                    onCloseScriptManager={renderActions.closeScriptManager}
                    onCloseStoryboardManager={renderActions.closeStoryboardManager}
                    onCreateBriefImageConfig={createBriefImageConfigNode}
                    onCropImageNode={(node, crop) => void cropImageNode(node, crop)}
                    onGenerateAngleNode={(node, params) => void generateAngleNode(node, params)}
                    onImageInputChange={handleImageInputChange}
                    onOpenStoryboardGroup={renderActions.openStoryboardGroup}
                />
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
                selectedProductionPackage={inspectorProductionPackage}
                selectedShot={activeTimelineShot}
                selectedShotGroups={activeTimelineShotGroups}
                selectedShotNodes={activeTimelineNodes}
                selectedVideoNode={packageSlotVideoNode?.type === CanvasNodeType.Video && packageSlotVideoNode.metadata?.content ? packageSlotVideoNode : null}
                sessions={chatSessions}
                stats={episodeWorkbenchStats}
                title={currentProject?.title || "未命名画布"}
                view={inspectorView}
                onApplyAssistantActions={applyAssistantActions}
                onAssistantCollapse={inspectorPanelActions.collapseAssistant}
                onAssistantCollapseStart={() => setAssistantCollapsed(true)}
                onBindSelectedVideoToProductionPackage={handleBindSelectedVideoToProductionPackage}
                onCollapsedChange={setIsInspectorCollapsed}
                onDownloadProductionVideoVersion={handleDownloadProductionVideoVersion}
                onHideProductionVideoVersion={handleHideProductionVideoVersion}
                onInsertImage={insertAssistantImage}
                onInsertProductionPackageConfigNode={handleInsertProductionPackageConfigNode}
                onInsertText={insertAssistantText}
                onOpenAssets={inspectorPanelActions.openAssetPicker}
                onOpenAssistant={inspectorPanelActions.openAssistant}
                onOpenEpisodeWorkbench={openEpisodeWorkbench}
                onOpenWorkflowAssistant={openWorkflowAssistant}
                onPasteImage={pasteAssistantImage}
                onPreviewProductionVideoVersion={handlePreviewProductionVideoVersion}
                onSelectNodeIds={setSelectedNodeIds}
                onSelectShot={handleTimelineShotSelect}
                onSessionsChange={handleAssistantSessionsChange}
                onSetCurrentProductionVideoVersion={handleSetCurrentProductionVideoVersion}
                onViewChange={setInspectorView}
            />
        </main>
    );
}
