"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "antd";
import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Info, MessageSquare } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData } from "../types";
import type { NodeGenerationInput } from "./canvas-node-generation";
import type { EpisodeWorkbenchStats } from "../utils/episode-workbench";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";
import { buildShotReadableContent } from "../utils/shot-readable-content";
import type { CanvasProductionPackageSummary, CanvasProductionVideoVersion } from "../utils/canvas-production-packages";
import { MetadataSummary, NodeInspector } from "./canvas-node-inspector";
import { ProductionPackageContentView, ProductionPackageInfoContent } from "./canvas-production-package-inspector";
import { RawSourceSection, ShotChecklistSection, ShotInspector } from "./canvas-shot-inspector";

export type CanvasInspectorView = "context" | "assistant";

type CanvasContextInspectorProps = {
    view: CanvasInspectorView;
    onViewChange: (view: CanvasInspectorView) => void;
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    title: string;
    episodeLabel: string;
    productionLabel: string;
    hasEpisode: boolean;
    stats: EpisodeWorkbenchStats;
    selectedNode: CanvasNodeData | null;
    selectedProductionPackage?: CanvasProductionPackageSummary | null;
    selectedVideoNode?: CanvasNodeData | null;
    selectedShot?: StoryboardTableShot | null;
    selectedShotGroups?: ShotGroup[];
    selectedShotNodes?: CanvasNodeData[];
    assetTitleById?: Map<string, string>;
    checklistShots?: StoryboardTableShot[];
    checklistShotGroups?: ShotGroup[];
    checklistNodes?: CanvasNodeData[];
    activeShotId?: string;
    selectedCount: number;
    connections: CanvasConnection[];
    configInputs: NodeGenerationInput[];
    assistantSlot?: ReactNode;
    onOpenEpisodeWorkbench: () => void;
    onOpenAssets: () => void;
    onOpenAssistant: () => void;
    onSelectShot?: (shot: StoryboardTableShot, nodeId?: string) => void;
    onPreviewProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onDownloadProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onSetCurrentProductionVideoVersion: (packageId: string, nodeId: string) => void;
    onHideProductionVideoVersion: (nodeId: string) => void;
    onBindSelectedVideoToProductionPackage: (packageId: string, nodeId: string) => void;
    onInsertProductionPackageConfigNode: (packageId: string) => void;
    onInfo: (node: CanvasNodeData) => void;
    onEditText: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onContinueVideo: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
};

export function CanvasContextInspector({
    view,
    onViewChange,
    collapsed,
    onCollapsedChange,
    title,
    episodeLabel,
    productionLabel,
    hasEpisode,
    stats,
    selectedNode,
    selectedProductionPackage,
    selectedVideoNode,
    selectedShot,
    selectedShotGroups = [],
    selectedShotNodes = [],
    assetTitleById = new Map(),
    checklistShots = [],
    checklistShotGroups = [],
    checklistNodes = [],
    activeShotId,
    selectedCount,
    connections,
    configInputs,
    assistantSlot,
    onOpenEpisodeWorkbench,
    onOpenAssets,
    onOpenAssistant,
    onSelectShot,
    onPreviewProductionVideoVersion,
    onDownloadProductionVideoVersion,
    onSetCurrentProductionVideoVersion,
    onHideProductionVideoVersion,
    onBindSelectedVideoToProductionPackage,
    onInsertProductionPackageConfigNode,
    onInfo,
    onEditText,
    onToggleDialog,
    onGenerateImage,
    onUpload,
    onDownload,
    onSaveAsset,
    onRetry,
    onContinueVideo,
    onCrop,
    onAngle,
    onViewImage,
}: CanvasContextInspectorProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const activeView = view === "assistant" && !assistantSlot ? "context" : view;
    const [productionInfoOpen, setProductionInfoOpen] = useState(false);
    const [recordsOpen, setRecordsOpen] = useState(false);

    if (collapsed) {
        return (
            <aside className="relative flex h-full w-10 shrink-0 items-start justify-center border-l pt-3" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
                <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                    style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }}
                    onClick={() => onCollapsedChange(false)}
                    title="展开右侧面板"
                    aria-label="展开右侧面板"
                >
                    <ChevronLeft className="size-4" />
                </button>
            </aside>
        );
    }

    return (
        <aside className="relative flex h-full w-[420px] shrink-0 flex-col border-l" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{title}</div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                            <span className="rounded-md px-1.5 py-0.5" style={{ background: theme.node.fill }}>
                                {episodeLabel}
                            </span>
                            <span className="rounded-md px-1.5 py-0.5" style={{ background: theme.node.fill }}>
                                {productionLabel}
                            </span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                            style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }}
                            onClick={() => setRecordsOpen(true)}
                            title="查看记录"
                            aria-label="查看记录"
                        >
                            <FileText className="size-4" />
                        </button>
                        {selectedProductionPackage ? (
                            <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }}
                                onClick={() => setProductionInfoOpen(true)}
                                title="查看生产包信息"
                                aria-label="查看生产包信息"
                            >
                                <Info className="size-4" />
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                            style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }}
                            onClick={() => onCollapsedChange(true)}
                            title="收起右侧面板"
                            aria-label="收起右侧面板"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border p-1" style={{ background: "rgba(15, 23, 42, 0.18)", borderColor: theme.node.stroke }}>
                    <InspectorTab label="内容" active={activeView === "context"} onClick={() => onViewChange("context")} />
                    <InspectorTab
                        label="助手"
                        active={activeView === "assistant"}
                        onClick={() => {
                            onOpenAssistant();
                            onViewChange("assistant");
                        }}
                    />
                </div>
            </div>

            {activeView === "assistant" ? (
                <div className="min-h-0 flex-1 overflow-hidden">{assistantSlot}</div>
            ) : selectedNode ? (
                <NodeInspector
                    node={selectedNode}
                    selectedCount={selectedCount}
                    connections={connections}
                    inputs={configInputs}
                    theme={theme}
                    onInfo={onInfo}
                    onEditText={onEditText}
                    onToggleDialog={onToggleDialog}
                    onGenerateImage={onGenerateImage}
                    onUpload={onUpload}
                    onDownload={onDownload}
                    onSaveAsset={onSaveAsset}
                    onRetry={onRetry}
                    onContinueVideo={onContinueVideo}
                    onCrop={onCrop}
                    onAngle={onAngle}
                    onViewImage={onViewImage}
                />
            ) : selectedProductionPackage ? (
                <ProductionPackageContentView
                    productionPackage={selectedProductionPackage}
                    selectedVideoNode={selectedVideoNode}
                    theme={theme}
                    onPreviewProductionVideoVersion={onPreviewProductionVideoVersion}
                    onDownloadProductionVideoVersion={onDownloadProductionVideoVersion}
                    onSetCurrentProductionVideoVersion={onSetCurrentProductionVideoVersion}
                    onHideProductionVideoVersion={onHideProductionVideoVersion}
                    onBindSelectedVideoToProductionPackage={onBindSelectedVideoToProductionPackage}
                    onInsertProductionPackageConfigNode={onInsertProductionPackageConfigNode}
                />
            ) : selectedShot ? (
                <ShotInspector
                    shot={selectedShot}
                    groups={selectedShotGroups}
                    nodes={selectedShotNodes}
                    assetTitleById={assetTitleById}
                    checklistShots={checklistShots}
                    checklistShotGroups={checklistShotGroups}
                    checklistNodes={checklistNodes}
                    activeShotId={activeShotId}
                    theme={theme}
                    onSelectShot={onSelectShot}
                    onOpenEpisodeWorkbench={onOpenEpisodeWorkbench}
                />
            ) : (
                <CanvasOverview
                    hasEpisode={hasEpisode}
                    stats={stats}
                    checklistShots={checklistShots}
                    checklistShotGroups={checklistShotGroups}
                    checklistNodes={checklistNodes}
                    activeShotId={activeShotId}
                    theme={theme}
                    onSelectShot={onSelectShot}
                    onOpenAssets={onOpenAssets}
                    onOpenEpisodeWorkbench={onOpenEpisodeWorkbench}
                    onOpenAssistant={() => {
                        onOpenAssistant();
                        onViewChange("assistant");
                    }}
                />
            )}
            {selectedProductionPackage ? (
                <Modal title="生产包信息" open={productionInfoOpen} footer={null} onCancel={() => setProductionInfoOpen(false)} centered width={520}>
                    <ProductionPackageInfoContent
                        productionPackage={selectedProductionPackage}
                        theme={theme}
                        onPreviewProductionVideoVersion={onPreviewProductionVideoVersion}
                        onDownloadProductionVideoVersion={onDownloadProductionVideoVersion}
                        onSetCurrentProductionVideoVersion={onSetCurrentProductionVideoVersion}
                        onHideProductionVideoVersion={onHideProductionVideoVersion}
                    />
                </Modal>
            ) : null}
            <Modal title="记录 / 任务详情" open={recordsOpen} footer={null} onCancel={() => setRecordsOpen(false)} centered width={560}>
                <RecordsView selectedNode={selectedNode} selectedShot={selectedShot} theme={theme} />
            </Modal>
        </aside>
    );
}

function InspectorTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button
            type="button"
            className="relative h-8 rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            style={{
                background: active ? "rgba(111, 168, 255, 0.16)" : "transparent",
                border: active ? `1px solid ${theme.node.activeStroke}` : "1px solid transparent",
                color: active ? theme.node.activeStroke : theme.node.muted,
            }}
            aria-current={active ? "page" : undefined}
            onClick={onClick}
        >
            {label}
            {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full" style={{ background: theme.node.activeStroke }} /> : null}
        </button>
    );
}

function CanvasOverview({
    hasEpisode,
    stats,
    checklistShots,
    checklistShotGroups,
    checklistNodes,
    activeShotId,
    theme,
    onSelectShot,
    onOpenAssets,
    onOpenEpisodeWorkbench,
    onOpenAssistant,
}: {
    hasEpisode: boolean;
    stats: EpisodeWorkbenchStats;
    checklistShots: StoryboardTableShot[];
    checklistShotGroups: ShotGroup[];
    checklistNodes: CanvasNodeData[];
    activeShotId?: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelectShot?: (shot: StoryboardTableShot, nodeId?: string) => void;
    onOpenAssets: () => void;
    onOpenEpisodeWorkbench: () => void;
    onOpenAssistant: () => void;
}) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <section className="rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                <div className="text-sm font-semibold">{hasEpisode ? "承接批次概览" : "自由画布"}</div>
                <div className="mt-2 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {hasEpisode ? "画布用于承接已确认的分镜、提示词、参考素材和视频配置。检查后再执行生成。" : "当前画布未绑定集数，可继续自由编排文本、图片、视频、音频和配置节点。"}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <Stat label="分镜" value={stats.tableShotCount} theme={theme} />
                    <Stat label="生成组" value={stats.shotGroupCount} theme={theme} />
                    <Stat label="生成中" value={stats.generatingCount} theme={theme} />
                    <Stat label="失败" value={stats.failedCount} theme={theme} />
                </div>
            </section>
            <ShotChecklistSection shots={checklistShots} shotGroups={checklistShotGroups} nodes={checklistNodes} activeShotId={activeShotId} theme={theme} onSelectShot={onSelectShot} />
            <div className="mt-3 grid gap-2">
                <InspectorAction icon={<FileText className="size-4" />} label={hasEpisode ? "返回本集生产流程" : "绑定或导入本集"} onClick={onOpenEpisodeWorkbench} theme={theme} />
                <InspectorAction icon={<ImageIcon className="size-4" />} label="打开素材" onClick={onOpenAssets} theme={theme} />
                <InspectorAction icon={<MessageSquare className="size-4" />} label="打开画布助手" onClick={onOpenAssistant} theme={theme} />
            </div>
        </div>
    );
}

function RecordsView({ selectedNode, selectedShot, theme }: { selectedNode: CanvasNodeData | null; selectedShot?: StoryboardTableShot | null; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const shotRawParts = selectedShot ? buildShotReadableContent(selectedShot).raw : [];
    return (
        <div className="thin-scrollbar max-h-[70vh] overflow-y-auto px-1 py-1">
            {shotRawParts.length ? <RawSourceSection items={shotRawParts} theme={theme} expanded /> : null}
            {selectedNode ? (
                <MetadataSummary node={selectedNode} theme={theme} expanded />
            ) : !shotRawParts.length ? (
                <div className="mt-3 text-sm" style={{ color: theme.node.muted }}>
                    选中节点或镜头后可查看任务和元信息。
                </div>
            ) : null}
        </div>
    );
}

function Stat({ label, value, theme }: { label: string; value: string | number; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="rounded-lg border px-2 py-2" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div className="text-[11px]" style={{ color: theme.node.muted }}>
                {label}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function InspectorAction({ icon, label, onClick, theme, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; disabled?: boolean }) {
    return (
        <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onClick={onClick}
            disabled={disabled}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
