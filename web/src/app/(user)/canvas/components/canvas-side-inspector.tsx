"use client";

import type { CanvasNodeHoverToolbarActions } from "./canvas-node-hover-toolbar";
import type { NodeGenerationInput } from "./canvas-node-generation";
import { CanvasAssistantPanel } from "./canvas-assistant-panel";
import { CanvasContextInspector, type CanvasInspectorView } from "./canvas-context-inspector";
import type { CanvasAssistantImage, CanvasAssistantSession, CanvasConnection, CanvasNodeData } from "../types";
import type { AssistantCanvasAction } from "../utils/canvas-assistant-actions";
import type { CanvasProductionPackageSummary, CanvasProductionVideoVersion } from "../utils/canvas-production-packages";
import type { EpisodeWorkbenchStats } from "../utils/episode-workbench";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";

type Props = {
    activeChatId: string | null;
    activeShotId: string;
    assistantMounted: boolean;
    assetTitleById: Map<string, string>;
    canvasEpisodeId?: string;
    canvasId: string;
    checklistNodes: CanvasNodeData[];
    checklistShotGroups: ShotGroup[];
    checklistShots: StoryboardTableShot[];
    collapsed: boolean;
    configInputs: NodeGenerationInput[];
    connections: CanvasConnection[];
    episodeLabel: string;
    hasEpisode: boolean;
    nodes: CanvasNodeData[];
    nodeToolActions: CanvasNodeHoverToolbarActions;
    onApplyAssistantActions: (actions: AssistantCanvasAction[]) => boolean;
    onBindSelectedVideoToProductionPackage: (packageId: string, nodeId: string) => void;
    onCollapsedChange: (collapsed: boolean) => void;
    onDownloadProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onHideProductionVideoVersion: (nodeId: string) => void;
    onInsertImage: (image: CanvasAssistantImage) => void;
    onInsertProductionPackageConfigNode: (packageId: string) => void;
    onInsertText: (text: string) => void;
    onOpenAssets: () => void;
    onOpenAssistant: () => void;
    onOpenEpisodeWorkbench: () => void;
    onOpenWorkflowAssistant: () => void;
    onPasteImage: (file: File) => void;
    onPreviewProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onSelectNodeIds: (ids: Set<string>) => void;
    onSelectShot: (shot: StoryboardTableShot, nodeId?: string) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null, options?: { skipCanvasHistory?: boolean }) => void;
    onSetCurrentProductionVideoVersion: (packageId: string, nodeId: string) => void;
    onAssistantCollapse: () => void;
    onAssistantCollapseStart: () => void;
    onViewChange: (view: CanvasInspectorView) => void;
    productionLabel: string;
    projectId: string;
    selectedCount: number;
    selectedNode: CanvasNodeData | null;
    selectedNodeIds: Set<string>;
    selectedProductionPackage?: CanvasProductionPackageSummary | null;
    selectedShot?: StoryboardTableShot | null;
    selectedShotGroups: ShotGroup[];
    selectedShotNodes: CanvasNodeData[];
    selectedVideoNode: CanvasNodeData | null;
    sessions: CanvasAssistantSession[];
    stats: EpisodeWorkbenchStats;
    title: string;
    view: CanvasInspectorView;
};

export function CanvasSideInspector({
    activeChatId,
    activeShotId,
    assistantMounted,
    assetTitleById,
    canvasEpisodeId,
    canvasId,
    checklistNodes,
    checklistShotGroups,
    checklistShots,
    collapsed,
    configInputs,
    connections,
    episodeLabel,
    hasEpisode,
    nodes,
    nodeToolActions,
    onApplyAssistantActions,
    onAssistantCollapse,
    onAssistantCollapseStart,
    onBindSelectedVideoToProductionPackage,
    onCollapsedChange,
    onDownloadProductionVideoVersion,
    onHideProductionVideoVersion,
    onInsertImage,
    onInsertProductionPackageConfigNode,
    onInsertText,
    onOpenAssets,
    onOpenAssistant,
    onOpenEpisodeWorkbench,
    onOpenWorkflowAssistant,
    onPasteImage,
    onPreviewProductionVideoVersion,
    onSelectNodeIds,
    onSelectShot,
    onSessionsChange,
    onSetCurrentProductionVideoVersion,
    onViewChange,
    productionLabel,
    projectId,
    selectedCount,
    selectedNode,
    selectedNodeIds,
    selectedProductionPackage,
    selectedShot,
    selectedShotGroups,
    selectedShotNodes,
    selectedVideoNode,
    sessions,
    stats,
    title,
    view,
}: Props) {
    return (
        <CanvasContextInspector
            view={view}
            onViewChange={onViewChange}
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
            title={title}
            episodeLabel={episodeLabel}
            productionLabel={productionLabel}
            hasEpisode={hasEpisode}
            stats={stats}
            selectedNode={selectedNode}
            selectedProductionPackage={selectedProductionPackage}
            selectedVideoNode={selectedVideoNode}
            selectedShot={selectedShot}
            selectedShotGroups={selectedShotGroups}
            selectedShotNodes={selectedShotNodes}
            assetTitleById={assetTitleById}
            checklistShots={checklistShots}
            checklistShotGroups={checklistShotGroups}
            checklistNodes={checklistNodes}
            activeShotId={activeShotId}
            selectedCount={selectedCount}
            connections={connections}
            configInputs={configInputs}
            assistantSlot={
                assistantMounted ? (
                    <CanvasAssistantPanel
                        embedded
                        projectId={projectId}
                        canvasId={canvasId}
                        episodeId={canvasEpisodeId}
                        nodes={nodes}
                        connections={connections}
                        selectedNodeIds={selectedNodeIds}
                        sessions={sessions}
                        activeSessionId={activeChatId}
                        onSelectNodeIds={onSelectNodeIds}
                        onSessionsChange={onSessionsChange}
                        onInsertImage={onInsertImage}
                        onInsertText={onInsertText}
                        onPasteImage={onPasteImage}
                        onApplyAssistantActions={onApplyAssistantActions}
                        onOpenWorkflowAssistant={onOpenWorkflowAssistant}
                        onCollapseStart={onAssistantCollapseStart}
                        onCollapse={onAssistantCollapse}
                    />
                ) : null
            }
            onOpenEpisodeWorkbench={onOpenEpisodeWorkbench}
            onOpenAssets={onOpenAssets}
            onOpenAssistant={onOpenAssistant}
            onSelectShot={onSelectShot}
            onPreviewProductionVideoVersion={onPreviewProductionVideoVersion}
            onDownloadProductionVideoVersion={onDownloadProductionVideoVersion}
            onSetCurrentProductionVideoVersion={onSetCurrentProductionVideoVersion}
            onHideProductionVideoVersion={onHideProductionVideoVersion}
            onBindSelectedVideoToProductionPackage={onBindSelectedVideoToProductionPackage}
            onInsertProductionPackageConfigNode={onInsertProductionPackageConfigNode}
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
    );
}

export type { CanvasInspectorView };
