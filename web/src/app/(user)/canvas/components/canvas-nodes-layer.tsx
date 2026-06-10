"use client";

import type { Dispatch, MouseEvent, MutableRefObject, SetStateAction } from "react";

import { buildReferenceMentionOptions } from "../utils/canvas-reference-mentions";
import { getNodeProductionPackageId, type CanvasProductionPackageSummary } from "../utils/canvas-production-packages";
import { getInputSummary, productionNodeBadge } from "../utils/canvas-page-helpers";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata, type ContextMenuState, type SelectionBox, type ViewportTransform } from "../types";
import type { CanvasNodeHoverToolbarActions } from "./canvas-node-hover-toolbar";
import { buildNodeGenerationInputs, type NodeGenerationInput } from "./canvas-node-generation";
import { CanvasConfigNodePanel } from "./canvas-config-node-panel";
import { CanvasNode } from "./canvas-node";
import { CanvasNodePromptPanel } from "./canvas-node-prompt-panel";

type Props = {
    activeNodeId: string | null;
    activeProductionPackageId: string;
    activeTimelineNodeIds: Set<string>;
    batchChildCountById: Map<string, number>;
    batchMotionById: Map<string, { x: number; y: number; index: number }>;
    collapsingBatchIds: Set<string>;
    configInputsById: Map<string, NodeGenerationInput[]>;
    connectionTargetNodeId: string | null;
    connections: CanvasConnection[];
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
    viewport: ViewportTransform;
    visibleNodes: CanvasNodeData[];
    workspaceProjectId: string;
    handleConfigNodeChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    handleConnectStart: (event: MouseEvent, nodeId: string, handleType: "source" | "target", handleId?: string) => void;
    handleGenerateNode: (nodeId: string, mode: CanvasGenerationMode, prompt: string) => void | Promise<unknown>;
    handleNodeContentChange: (nodeId: string, content: string) => void;
    handleNodeMouseDown: (event: MouseEvent, nodeId: string) => void;
    handleNodePromptChange: (nodeId: string, prompt: string) => void;
    handleNodeResize: (nodeId: string, width: number, height: number, position?: { x: number; y: number }) => void;
    handleRefreshVideoTask: (node: CanvasNodeData) => void | Promise<void>;
    hideNodeToolbar: () => void;
    keepNodeToolbar: (nodeId: string) => void;
    normalizeVideoFrameReferences: (videoNode: CanvasNodeData, firstNode: CanvasNodeData, lastNode: CanvasNodeData) => void | Promise<void>;
    setBatchPrimary: (node: CanvasNodeData) => void;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setNodeImageSettingsOpen: Dispatch<SetStateAction<boolean>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    toggleBatchExpanded: (nodeId: string) => void;
};

export function CanvasNodesLayer({
    activeNodeId,
    activeProductionPackageId,
    activeTimelineNodeIds,
    batchChildCountById,
    batchMotionById,
    collapsingBatchIds,
    configInputsById,
    connectionTargetNodeId,
    connections,
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
    viewport,
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
    hideNodeToolbar,
    keepNodeToolbar,
    normalizeVideoFrameReferences,
    setBatchPrimary,
    setContextMenu,
    setHoveredNodeId,
    setNodeImageSettingsOpen,
    setToolbarNodeId,
    toggleBatchExpanded,
}: Props) {
    return (
        <>
            {visibleNodes.map((node) => (
                <CanvasNode
                    key={node.id}
                    data={node}
                    scale={viewport.k}
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
                    onReviewAsset={nodeToolActions.onReviewAsset}
                    reviewSubmitting={submittingReviewNodeId === node.id}
                    frameReferenceNodes={frameReferencesByVideoId.get(node.id)}
                    onNormalizeFrameReferences={(videoNode, firstNode, lastNode) => void normalizeVideoFrameReferences(videoNode, firstNode, lastNode)}
                    onContextMenu={(event, id) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
                    }}
                />
            ))}
        </>
    );
}
