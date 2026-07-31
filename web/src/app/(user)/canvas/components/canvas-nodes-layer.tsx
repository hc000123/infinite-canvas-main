"use client";

import { memo, type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import { buildCanvasConnectedMedia } from "../utils/canvas-connected-media";
import { buildReferenceMentionOptions } from "../utils/canvas-reference-mentions";
import { serializePromptDocument, type CanvasPromptDocument } from "../utils/canvas-prompt-document";
import { getNodeProductionPackageId, type CanvasProductionPackageSummary } from "../utils/canvas-production-packages";
import { getInputSummary, productionNodeBadge } from "../utils/canvas-page-helpers";
import type { CanvasConnection, CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata, ContextMenuState, SelectionBox } from "../types";
import type { CanvasNodeHoverToolbarActions } from "./canvas-node-hover-toolbar";
import { buildNodeGenerationInputs, type NodeGenerationInput } from "./canvas-node-generation";
import { CanvasConfigNodePanel } from "./canvas-config-node-panel";
import { CanvasNode } from "./canvas-node";
import { CanvasNodePromptPanel } from "./canvas-node-prompt-panel";

type Props = {
    activeNodeId: string | null;
    canvasAiConfig: AiConfig;
    activeProductionPackageId: string;
    activeTimelineNodeIds: Set<string>;
    batchChildCountById: Map<string, number>;
    batchMotionById: Map<string, { x: number; y: number; index: number }>;
    collapsingBatchIds: Set<string>;
    configInputsById: Map<string, NodeGenerationInput[]>;
    connectionTargetNodeId: string | null;
    connections: CanvasConnection[];
    deleteConnection: (connectionId: string) => void;
    dialogNodeId: string | null;
    editRequestNonce: number;
    editingNodeId: string | null;
    frameReferencesByVideoId: Map<string, { first?: CanvasNodeData; last?: CanvasNodeData }>;
    isConnecting: boolean;
    nodeDraggingRef: MutableRefObject<boolean>;
    nodes: CanvasNodeData[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    nodeToolActions: CanvasNodeHoverToolbarActions;
    openingBatchIds: Set<string>;
    productionPackageLabelMap: Map<string, string>;
    productionPackages: CanvasProductionPackageSummary[];
    relatedNodeIds: Set<string>;
    runningNodeId: string | null;
    selectedNodeIds: Set<string>;
    selectionBox: SelectionBox | null;
    showImageInfo: boolean;
    submittingReviewNodeId: string | null;
    scale: number;
    visibleNodes: CanvasNodeData[];
    workspaceProjectId: string;
    handleConfigNodeChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    handleConnectStart: (event: MouseEvent, nodeId: string, handleType: "source" | "target", handleId?: string) => void;
    handleGenerateNode: (nodeId: string, mode: CanvasGenerationMode, prompt: string) => void | Promise<unknown>;
    handleNodeContentChange: (nodeId: string, content: string) => void;
    handleNodeMouseDown: (event: MouseEvent, nodeId: string) => void;
    handleNodePromptChange: (nodeId: string, prompt: string, promptDocument?: CanvasPromptDocument) => void;
    handleNodeResize: (nodeId: string, width: number, height: number, position?: { x: number; y: number }) => void;
    handleRefreshVideoTask: (node: CanvasNodeData) => void | Promise<void>;
    handleSwitchMediaVersion: (node: CanvasNodeData, versionId: string) => void;
    hideNodeToolbar: () => void;
    keepNodeToolbar: (nodeId: string) => void;
    normalizeVideoFrameReferences: (videoNode: CanvasNodeData, firstNode: CanvasNodeData, lastNode: CanvasNodeData) => void | Promise<void>;
    setBatchPrimary: (node: CanvasNodeData) => void;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setNodeImageSettingsOpen: Dispatch<SetStateAction<boolean>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    onExpandText: (nodeId: string) => void;
    toggleBatchExpanded: (nodeId: string) => void;
};

export const CanvasNodesLayer = memo(function CanvasNodesLayer({
    activeNodeId,
    canvasAiConfig,
    activeProductionPackageId,
    activeTimelineNodeIds,
    batchChildCountById,
    batchMotionById,
    collapsingBatchIds,
    configInputsById,
    connectionTargetNodeId,
    connections,
    deleteConnection,
    dialogNodeId,
    editRequestNonce,
    editingNodeId,
    frameReferencesByVideoId,
    isConnecting,
    nodeDraggingRef,
    nodes,
    nodesRef,
    nodeToolActions,
    openingBatchIds,
    productionPackageLabelMap,
    productionPackages,
    relatedNodeIds,
    runningNodeId,
    selectedNodeIds,
    selectionBox,
    showImageInfo,
    submittingReviewNodeId,
    scale,
    visibleNodes,
    workspaceProjectId,
    handleConfigNodeChange,
    handleConnectStart,
    handleGenerateNode,
    handleNodeContentChange,
    handleNodeMouseDown,
    handleNodePromptChange,
    handleNodeResize,
    handleRefreshVideoTask,
    handleSwitchMediaVersion,
    hideNodeToolbar,
    keepNodeToolbar,
    normalizeVideoFrameReferences,
    setBatchPrimary,
    setContextMenu,
    setDialogNodeId,
    setHoveredNodeId,
    setSelectedConnectionId,
    setSelectedNodeIds,
    setNodeImageSettingsOpen,
    setToolbarNodeId,
    onExpandText,
    toggleBatchExpanded,
}: Props) {
    return (
        <>
            {visibleNodes.map((node) => (
                <CanvasNode
                    key={node.id}
                    data={node}
                    scale={scale}
                    isSelected={selectedNodeIds.has(node.id)}
                    isRelated={relatedNodeIds.has(node.id)}
                    isFocusRelated={activeNodeId === node.id || activeTimelineNodeIds.has(node.id)}
                    isConnectionTarget={connectionTargetNodeId === node.id}
                    isConnecting={isConnecting}
                    editRequestNonce={editingNodeId === node.id ? editRequestNonce : 0}
                    showPanel={dialogNodeId === node.id && !selectionBox}
                    batchCount={batchChildCountById.get(node.id) || 0}
                    batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
                    batchClosing={Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId))}
                    batchOpening={openingBatchIds.has(node.id)}
                    batchRecovering={collapsingBatchIds.has(node.id)}
                    batchMotion={batchMotionById.get(node.id)}
                    showImageInfo={showImageInfo}
                    productionPackageBadge={productionPackages.length ? productionNodeBadge(node, productionPackages, productionPackageLabelMap) : ""}
                    isProductionPackageActive={Boolean(productionPackages.length && getNodeProductionPackageId(node) && getNodeProductionPackageId(node) === activeProductionPackageId)}
                    renderPanel={(panelNode) => {
                        const generationInputs = buildNodeGenerationInputs(panelNode.id, nodes, connections);
                        const connectedMedia = buildCanvasConnectedMedia(panelNode.id, nodes, connections);
                        return (
                            <CanvasNodePromptPanel
                                node={panelNode}
                                canvasAiConfig={canvasAiConfig}
                                isRunning={runningNodeId === panelNode.id}
                                projectId={workspaceProjectId}
                                onPromptChange={handleNodePromptChange}
                                onConfigChange={handleConfigNodeChange}
                                onGenerate={handleGenerateNode}
                                onImageSettingsOpenChange={(open) => {
                                    setNodeImageSettingsOpen(open);
                                    if (open) setToolbarNodeId(null);
                                }}
                                referenceMentionOptions={buildReferenceMentionOptions(generationInputs)}
                                hasConnectedText={generationInputs.some((input) => input.type === "text" && Boolean(input.text?.trim()))}
                                connectedMedia={connectedMedia}
                                onDisconnectConnectedMedia={deleteConnection}
                                onPreviewReference={(nodeId) => {
                                    const referenceNode = nodesRef.current.find((item) => item.id === nodeId);
                                    if (referenceNode) nodeToolActions.onViewImage(referenceNode);
                                }}
                                onSwitchMediaVersion={handleSwitchMediaVersion}
                            />
                        );
                    }}
                    renderNodeContent={(contentNode) => {
                        const connectedMedia = buildCanvasConnectedMedia(contentNode.id, nodes, connections);
                        return (
                            <CanvasConfigNodePanel
                                node={contentNode}
                                canvasAiConfig={canvasAiConfig}
                                isRunning={runningNodeId === contentNode.id}
                                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                                inputs={configInputsById.get(contentNode.id) || []}
                                connectedMedia={connectedMedia}
                                onDisconnectConnectedMedia={deleteConnection}
                                onConfigChange={handleConfigNodeChange}
                                onTextInputChange={handleNodeContentChange}
                                onPreviewReference={(nodeId) => {
                                    const referenceNode = nodesRef.current.find((item) => item.id === nodeId);
                                    if (referenceNode) nodeToolActions.onViewImage(referenceNode);
                                }}
                                onGenerate={(nodeId) => {
                                    const target = nodesRef.current.find((item) => item.id === nodeId);
                                    const inputs = configInputsById.get(nodeId) || [];
                                    const prompt = target?.metadata?.promptDocument
                                        ? serializePromptDocument(target.metadata.promptDocument, buildReferenceMentionOptions(inputs))
                                        : target?.metadata?.prompt || "";
                                    void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", prompt);
                                }}
                            />
                        );
                    }}
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
                    onImageQuickAction={(targetNode, action) => {
                        const isUpscale = action === "upscale";
                        handleConfigNodeChange(targetNode.id, {
                            prompt: isUpscale ? "提升当前图片清晰度，保留原图构图、主体、颜色和质感，减少噪点，增强细节，不改变画面内容。" : "基于参考图生成一张新图，保留主体特征和画面风格，并按文字要求调整细节。",
                            quality: isUpscale ? "high" : targetNode.metadata?.quality || "medium",
                            size: targetNode.metadata?.size || "2048x2048",
                            imagePresetId: action,
                            imagePresetLabel: isUpscale ? "图片高清" : "图生图",
                        });
                        setSelectedNodeIds(new Set([targetNode.id]));
                        setSelectedConnectionId(null);
                        setDialogNodeId(targetNode.id);
                        setToolbarNodeId(null);
                    }}
                    onExpandText={(node) => onExpandText(node.id)}
                    onDownload={nodeToolActions.onDownload}
                    onViewImage={nodeToolActions.onViewImage}
                    onReviewAsset={nodeToolActions.onReviewAsset}
                    reviewSubmitting={submittingReviewNodeId === node.id}
                    frameReferenceNodes={frameReferencesByVideoId.get(node.id)}
                    onNormalizeFrameReferences={(videoNode, firstNode, lastNode) => void normalizeVideoFrameReferences(videoNode, firstNode, lastNode)}
                    onSwitchMediaVersion={handleSwitchMediaVersion}
                    onContextMenu={(event, id) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
                    }}
                />
            ))}
        </>
    );
});
