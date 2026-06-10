"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "antd";
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileText, Image as ImageIcon, Info, Link2, Maximize2, MessageSquare, RefreshCw, Scissors, Sparkles, Upload, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData } from "../types";
import { CanvasNodeType } from "../types";
import type { NodeGenerationInput } from "./canvas-node-generation";
import type { EpisodeWorkbenchStats } from "../utils/episode-workbench";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";
import { inspectStoryboardShot, summarizeShotInspections } from "../utils/canvas-shot-inspection";
import { buildShotReadableContent, readableShotTitle, type ShotReadablePart } from "../utils/shot-readable-content";
import type { CanvasProductionPackageSummary, CanvasProductionVideoVersion } from "../utils/canvas-production-packages";

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

function ShotInspector({
    shot,
    groups,
    nodes,
    assetTitleById,
    checklistShots,
    checklistShotGroups,
    checklistNodes,
    activeShotId,
    theme,
    onSelectShot,
    onOpenEpisodeWorkbench,
}: {
    shot: StoryboardTableShot;
    groups: ShotGroup[];
    nodes: CanvasNodeData[];
    assetTitleById: Map<string, string>;
    checklistShots: StoryboardTableShot[];
    checklistShotGroups: ShotGroup[];
    checklistNodes: CanvasNodeData[];
    activeShotId?: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelectShot?: (shot: StoryboardTableShot, nodeId?: string) => void;
    onOpenEpisodeWorkbench: () => void;
}) {
    const prompt = groups.map((group) => group.effectivePrompt || group.prompt).filter(Boolean).join("\n\n");
    const refs = groups.flatMap((group) => [...group.assetRefs, ...group.audioRefs]);
    const nodeStatus = summarizeShotNodes(nodes);
    const title = readableShotTitle(shot, checklistShots);
    const textParts = buildShotReadableContent(shot, checklistShots);
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                        分镜检查
                    </div>
                    <div className="mt-1 break-words text-base font-semibold">
                        镜头 {shot.order}
                        {title ? ` · ${title}` : ""}
                    </div>
                </div>
                <span className="shrink-0 rounded-md px-2 py-1 text-xs" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    {shot.estimatedDuration || 0}s
                </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat label="场次" value={shot.sceneName || "未命名"} theme={theme} />
                <Stat label="景别" value={shot.shotSize || "未填写"} theme={theme} />
                <Stat label="生成组" value={groups.length} theme={theme} />
                <Stat label="承接节点" value={nodeStatus} theme={theme} />
                <Stat label="参考素材" value={refs.length} theme={theme} />
            </div>
            {textParts.recovered ? (
                <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                    已从原始来源恢复可读内容。
                </div>
            ) : !textParts.main.length && textParts.raw.length ? (
                <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                    暂无可读正文，原始来源已收起可查。
                </div>
            ) : null}
            {textParts.main.map((part) => (
                <TextSection key={part.title} title={part.title} text={part.text} theme={theme} />
            ))}
            {prompt ? <TextSection title="Seedance 视频提示词" text={prompt} theme={theme} /> : null}
            {refs.length ? <ReferenceSection refs={refs} assetTitleById={assetTitleById} theme={theme} /> : null}
            <HandoffStatusSection groups={groups} nodes={nodes} theme={theme} />
            <ShotChecklistSection shots={checklistShots} shotGroups={checklistShotGroups} nodes={checklistNodes} activeShotId={activeShotId} theme={theme} onSelectShot={onSelectShot} />
            {textParts.raw.length ? <RawSourceSection items={textParts.raw} theme={theme} /> : null}
            <div className="mt-3">
                <InspectorAction icon={<FileText className="size-4" />} label="返回本集生产流程" onClick={onOpenEpisodeWorkbench} theme={theme} />
            </div>
        </div>
    );
}

function ReferenceSection({ refs, assetTitleById, theme }: { refs: Array<ShotGroup["assetRefs"][number]>; assetTitleById: Map<string, string>; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">参考素材</div>
            <div className="space-y-1.5">
                {refs.map((ref, index) => (
                    <div key={`${ref.assetId}-${index}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded-lg border px-2 py-1.5 text-xs" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                        <span style={{ color: theme.node.muted }}>{ref.role || ref.kind}</span>
                        <span className="min-w-0 break-words">{assetTitleById.get(ref.assetId) || ref.sourceLabel || ref.assetId}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function HandoffStatusSection({ groups, nodes, theme }: { groups: ShotGroup[]; nodes: CanvasNodeData[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">承接状态</div>
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    {groups.length} 组 / {nodes.length} 节点
                </div>
            </div>
            <div className="space-y-1.5">
                {groups.length ? groups.map((group) => <StatusRow key={group.id} label="生成组" title={shotGroupStatusLabel(group)} meta={group.id} theme={theme} />) : <EmptyStatus text="尚未形成生成组" theme={theme} />}
                {nodes.length ? nodes.map((node) => <StatusRow key={node.id} label={nodeTypeLabel(node)} title={node.title} meta={nodeStatusLabel(node)} theme={theme} />) : <EmptyStatus text="尚未承接到画布节点" theme={theme} />}
            </div>
        </section>
    );
}

function ShotChecklistSection({
    shots,
    shotGroups,
    nodes,
    activeShotId,
    theme,
    onSelectShot,
}: {
    shots: StoryboardTableShot[];
    shotGroups: ShotGroup[];
    nodes: CanvasNodeData[];
    activeShotId?: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelectShot?: (shot: StoryboardTableShot, nodeId?: string) => void;
}) {
    if (!shots.length) return null;
    const rows = shots.map((shot) => ({ shot, inspection: inspectStoryboardShot(shot, shotGroups, nodes) }));
    const summary = summarizeShotInspections(rows.map((row) => row.inspection));
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">镜头检查清单</div>
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    {summary.all} 个镜头
                </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
                <MiniStat label="未承接" value={summary.todo} theme={theme} />
                <MiniStat label="就绪" value={summary.ready} theme={theme} />
                <MiniStat label="已入画布" value={summary.linked} theme={theme} />
                <MiniStat label="生成中" value={summary.running} theme={theme} />
                <MiniStat label="已生成" value={summary.done} theme={theme} />
                <MiniStat label="失败" value={summary.error} theme={theme} />
            </div>
            <div className="thin-scrollbar mt-2 max-h-56 space-y-1.5 overflow-y-auto" data-canvas-no-zoom>
                {rows.map(({ shot, inspection }) => {
                    const active = activeShotId === shot.id;
                    return (
                        <button
                            key={shot.id}
                            type="button"
                            className="w-full rounded-lg border px-2 py-1.5 text-left text-xs leading-5 transition hover:opacity-85"
                            style={{ background: active ? theme.toolbar.activeBg : theme.node.panel, borderColor: active ? theme.node.activeStroke : theme.node.stroke, color: theme.node.text }}
                            onClick={() => onSelectShot?.(shot, inspection.node?.id)}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">镜头 {shot.order}</span>
                                <span style={{ color: inspection.phase === "error" ? "#ef4444" : theme.node.muted }}>{inspection.statusLabel}</span>
                            </div>
                            <div className="break-words" style={{ color: theme.node.muted }}>
                                {shot.sceneName || "未命名场次"} · {inspection.healthLabel}
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

function MiniStat({ label, value, theme }: { label: string; value: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="rounded-lg border px-2 py-1.5" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div className="text-[10px]" style={{ color: theme.node.muted }}>
                {label}
            </div>
            <div className="text-sm font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function RawSourceSection({ items, theme, expanded = false }: { items: ShotReadablePart[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; expanded?: boolean }) {
    if (!items.length) return null;
    return (
        <details open={expanded} className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <summary className="cursor-pointer select-none text-sm font-semibold">
                原始来源
                <span className="ml-2 text-xs font-normal" style={{ color: theme.node.muted }}>
                    {items.length} 项
                </span>
            </summary>
            <div className="mt-2 space-y-2">
                {items.map((item) => (
                    <div key={item.title} className="rounded-lg border p-2" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                        <div className="mb-1 text-xs font-medium" style={{ color: theme.node.muted }}>
                            {item.title}
                        </div>
                        <div className="thin-scrollbar max-h-[38vh] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5" data-canvas-no-zoom>
                            {item.text}
                        </div>
                    </div>
                ))}
            </div>
        </details>
    );
}

function StatusRow({ label, title, meta, theme }: { label: string; title: string; meta: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="rounded-lg border px-2 py-1.5 text-xs leading-5" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div style={{ color: theme.node.muted }}>{label} · {meta}</div>
            <div className="break-words font-medium">{title}</div>
        </div>
    );
}

function EmptyStatus({ text, theme }: { text: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
            {text}
        </div>
    );
}

function summarizeShotNodes(nodes: CanvasNodeData[]) {
    if (!nodes.length) return "未入画布";
    if (nodes.some((node) => node.metadata?.status === "loading")) return "生成中";
    if (nodes.some((node) => node.metadata?.status === "error")) return "有失败";
    if (nodes.some((node) => node.metadata?.status === "success")) return "有结果";
    return `${nodes.length} 个`;
}

function InspectorTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button
            type="button"
            className="relative h-8 rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            style={{
                background: active ? "rgba(111, 168, 255, 0.16)" : "transparent",
                border: active ? `1px solid ${theme.node.selected}` : "1px solid transparent",
                color: active ? theme.node.selected : theme.node.muted,
            }}
            aria-current={active ? "page" : undefined}
            onClick={onClick}
        >
            {label}
            {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full" style={{ background: theme.node.selected }} /> : null}
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

function NodeInspector({
    node,
    selectedCount,
    connections,
    inputs,
    theme,
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
}: {
    node: CanvasNodeData;
    selectedCount: number;
    connections: CanvasConnection[];
    inputs: NodeGenerationInput[];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
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
}) {
    const upstreamCount = connections.filter((connection) => connection.toNodeId === node.id).length;
    const downstreamCount = connections.filter((connection) => connection.fromNodeId === node.id).length;
    const prompt = readablePrompt(node);
    const hasMedia = Boolean(node.metadata?.content);
    const canOpenGenerateSettings = node.type === CanvasNodeType.Config || ((node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && !hasMedia);
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                        {nodeTypeLabel(node)}
                    </div>
                    <div className="mt-1 break-words text-base font-semibold">{node.title}</div>
                </div>
                {selectedCount > 1 ? (
                    <span className="shrink-0 rounded-md px-2 py-1 text-xs" style={{ background: theme.node.fill, color: theme.node.muted }}>
                        已选 {selectedCount}
                    </span>
                ) : null}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="上游" value={upstreamCount} theme={theme} />
                <Stat label="下游" value={downstreamCount} theme={theme} />
                <Stat label="状态" value={nodeStatusLabel(node)} theme={theme} />
            </div>

            {node.type === CanvasNodeType.Image && node.metadata?.content ? <img className="mt-3 max-h-60 w-full rounded-xl object-contain" src={node.metadata.content} alt={node.title || "图片节点"} /> : null}
            {node.type === CanvasNodeType.Video && node.metadata?.content ? <video className="mt-3 max-h-60 w-full rounded-xl bg-black" src={node.metadata.content} controls controlsList="nodownload" playsInline /> : null}
            {node.type === CanvasNodeType.Audio && node.metadata?.content ? <audio className="mt-3 w-full" src={node.metadata.content} controls /> : null}

            {node.type === CanvasNodeType.Config ? <ConfigInputsSection inputs={inputs} theme={theme} /> : null}
            {prompt ? <TextSection title={node.type === CanvasNodeType.Text ? "完整文本" : "完整提示词"} text={prompt} theme={theme} /> : null}
            {node.metadata?.errorDetails ? <TextSection title="失败原因" text={node.metadata.errorDetails} theme={theme} danger /> : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
                <InspectorAction icon={<Info className="size-4" />} label="节点信息" onClick={() => onInfo(node)} theme={theme} />
                {node.type === CanvasNodeType.Text ? <InspectorAction icon={<FileText className="size-4" />} label="编辑文字" onClick={() => onEditText(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Text ? <InspectorAction icon={<ImageIcon className="size-4" />} label="用文本生图" onClick={() => onGenerateImage(node)} theme={theme} /> : null}
                {canOpenGenerateSettings ? <InspectorAction icon={<MessageSquare className="size-4" />} label="生成设置" onClick={() => onToggleDialog(node)} theme={theme} /> : null}
                {(node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && hasMedia ? <InspectorAction icon={<Download className="size-4" />} label="下载" onClick={() => onDownload(node)} theme={theme} /> : null}
                {(node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && hasMedia ? <InspectorAction icon={<Sparkles className="size-4" />} label="存素材" onClick={() => onSaveAsset(node)} theme={theme} /> : null}
                {(node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) ? <InspectorAction icon={<Upload className="size-4" />} label={hasMedia ? "替换素材" : "上传素材"} onClick={() => onUpload(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Image && hasMedia ? <InspectorAction icon={<Scissors className="size-4" />} label="裁剪" onClick={() => onCrop(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Image && hasMedia ? <InspectorAction icon={<Camera className="size-4" />} label="多角度" onClick={() => onAngle(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Image && hasMedia ? <InspectorAction icon={<Maximize2 className="size-4" />} label="查看大图" onClick={() => onViewImage(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Video && node.metadata?.lastFrameUrl ? <InspectorAction icon={<Video className="size-4" />} label="续写下一段" onClick={() => onContinueVideo(node)} theme={theme} /> : null}
                {node.metadata?.status === "error" ? <InspectorAction icon={<RefreshCw className="size-4" />} label="重试" onClick={() => onRetry(node)} theme={theme} /> : null}
            </div>

            <MetadataSummary node={node} theme={theme} />
        </div>
    );
}

function ProductionPackageInfoContent({
    productionPackage,
    theme,
    onPreviewProductionVideoVersion,
    onDownloadProductionVideoVersion,
    onSetCurrentProductionVideoVersion,
    onHideProductionVideoVersion,
}: {
    productionPackage: CanvasProductionPackageSummary;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPreviewProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onDownloadProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onSetCurrentProductionVideoVersion: (packageId: string, nodeId: string) => void;
    onHideProductionVideoVersion: (nodeId: string) => void;
}) {
    return (
        <div className="thin-scrollbar max-h-[70vh] overflow-y-auto">
            <ProductionPackageBindingSection productionPackage={productionPackage} theme={theme} />
            <VideoVersionsSection
                productionPackage={productionPackage}
                theme={theme}
                onPreview={onPreviewProductionVideoVersion}
                onDownload={onDownloadProductionVideoVersion}
                onSetCurrent={onSetCurrentProductionVideoVersion}
                onHide={onHideProductionVideoVersion}
            />
        </div>
    );
}

function ProductionPackageContentView({
    productionPackage,
    selectedVideoNode,
    theme,
    onPreviewProductionVideoVersion,
    onDownloadProductionVideoVersion,
    onSetCurrentProductionVideoVersion,
    onHideProductionVideoVersion,
    onBindSelectedVideoToProductionPackage,
    onInsertProductionPackageConfigNode,
}: {
    productionPackage: CanvasProductionPackageSummary;
    selectedVideoNode?: CanvasNodeData | null;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPreviewProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onDownloadProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onSetCurrentProductionVideoVersion: (packageId: string, nodeId: string) => void;
    onHideProductionVideoVersion: (nodeId: string) => void;
    onBindSelectedVideoToProductionPackage: (packageId: string, nodeId: string) => void;
    onInsertProductionPackageConfigNode: (packageId: string) => void;
}) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <ProductionPackageBindingSection productionPackage={productionPackage} theme={theme} />
            <ProductionPackageSlotSection productionPackage={productionPackage} selectedVideoNode={selectedVideoNode} theme={theme} onBindSelectedVideoToProductionPackage={onBindSelectedVideoToProductionPackage} onInsertProductionPackageConfigNode={onInsertProductionPackageConfigNode} />
            <ProductionPackageSourceSection productionPackage={productionPackage} theme={theme} onInsertProductionPackageConfigNode={onInsertProductionPackageConfigNode} />
            <VideoVersionsSection
                productionPackage={productionPackage}
                theme={theme}
                onPreview={onPreviewProductionVideoVersion}
                onDownload={onDownloadProductionVideoVersion}
                onSetCurrent={onSetCurrentProductionVideoVersion}
                onHide={onHideProductionVideoVersion}
            />
        </div>
    );
}

function ProductionPackageSlotSection({
    productionPackage,
    selectedVideoNode,
    theme,
    onBindSelectedVideoToProductionPackage,
    onInsertProductionPackageConfigNode,
}: {
    productionPackage: CanvasProductionPackageSummary;
    selectedVideoNode?: CanvasNodeData | null;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onBindSelectedVideoToProductionPackage: (packageId: string, nodeId: string) => void;
    onInsertProductionPackageConfigNode: (packageId: string) => void;
}) {
    const current = productionPackage.currentVersion;
    const selectedVideoTitle = selectedVideoNode ? selectedVideoNode.title || "选中视频节点" : "";
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">结果填充槽</div>
                <span className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: current ? "rgba(34,211,238,.72)" : theme.node.stroke, color: current ? "rgb(103,232,249)" : theme.node.muted }}>
                    {current ? "已填充" : "待填充"}
                </span>
            </div>
            <div className="rounded-xl border border-dashed p-3" style={{ borderColor: current ? "rgba(34,211,238,.72)" : theme.node.stroke, background: theme.node.panel }}>
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                        <Video className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{current ? `${current.label} · ${current.node.title}` : "最终视频节点"}</div>
                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {current ? `${current.status} · ${current.duration || "未记录时长"}` : selectedVideoNode ? `已选中：${selectedVideoTitle}` : "先在画布上选中一个已生成视频节点，再填入这个槽位。"}
                        </div>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <SmallInspectorButton icon={<Link2 className="size-3.5" />} label={current ? "替换为选中视频" : "填入选中视频"} onClick={() => selectedVideoNode && onBindSelectedVideoToProductionPackage(productionPackage.id, selectedVideoNode.id)} theme={theme} disabled={!selectedVideoNode} />
                    <SmallInspectorButton icon={<Video className="size-3.5" />} label={productionPackage.configNodeId ? "定位配置节点" : "新建视频配置"} onClick={() => onInsertProductionPackageConfigNode(productionPackage.id)} theme={theme} />
                </div>
            </div>
        </section>
    );
}

function ProductionPackageSourceSection({ productionPackage, theme, onInsertProductionPackageConfigNode }: { productionPackage: CanvasProductionPackageSummary; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onInsertProductionPackageConfigNode: (packageId: string) => void }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">内容素材</div>
            <div className="space-y-2">
                <SourceRow icon={<FileText className="size-4" />} title="剧情内容" value={productionPackage.sceneName} detail={`镜头范围：${productionPackage.shotRangeLabel}`} theme={theme} />
                <SourceRow icon={<MessageSquare className="size-4" />} title="提示词 / 视频配置" value={productionPackage.configNodeId ? "已放入画布" : "待创建"} detail="可生成视频配置节点后继续编辑提示词和参考输入。" theme={theme} />
                <SourceRow icon={<ImageIcon className="size-4" />} title="参考资产" value={`${Math.max(0, productionPackage.nodeIds.length - productionPackage.versions.length)} 个关联节点`} detail="可从画布节点、素材库或生产包配置继续补齐参考图、音频和文本。" theme={theme} />
            </div>
            <div className="mt-3">
                <SmallInspectorButton icon={<Upload className="size-3.5" />} label="导入为视频配置节点" onClick={() => onInsertProductionPackageConfigNode(productionPackage.id)} theme={theme} />
            </div>
        </section>
    );
}

function SourceRow({ icon, title, value, detail, theme }: { icon: ReactNode; title: string; value: string; detail: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="flex gap-2 rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: theme.toolbar.panel, color: theme.node.muted }}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">{title}</span>
                    <span className="max-w-[160px] truncate" style={{ color: theme.node.muted }}>
                        {value}
                    </span>
                </div>
                <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {detail}
                </div>
            </div>
        </div>
    );
}

function ProductionPackageBindingSection({ productionPackage, currentNode, theme }: { productionPackage: CanvasProductionPackageSummary; currentNode?: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <section className="rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">生产包绑定</div>
                    <div className="mt-1 break-words text-base font-semibold">
                        {productionPackage.label} · {productionPackage.title}
                    </div>
                </div>
                <span className="shrink-0 rounded-md border px-2 py-1 text-xs" style={{ borderColor: productionPackage.currentVersion ? "rgba(34,211,238,.72)" : theme.node.stroke, color: productionPackage.currentVersion ? "rgb(103,232,249)" : theme.node.muted }}>
                    {productionPackage.statusLabel}
                </span>
            </div>
            <div className="space-y-1.5">
                <InspectorRow label="所属段落" value={productionPackage.sceneName} theme={theme} />
                <InspectorRow label="镜头范围" value={productionPackage.shotRangeLabel} theme={theme} />
                <InspectorRow label="包内节点" value={`${productionPackage.nodeIds.length} 个`} theme={theme} />
                <InspectorRow label="当前版本" value={productionPackage.currentVersion ? `${productionPackage.currentVersion.label} · 已采用` : "暂无"} theme={theme} />
                <InspectorRow label="版本数量" value={`${productionPackage.versions.filter((version) => !version.hidden).length} 个视频结果`} theme={theme} />
                {currentNode ? <InspectorRow label="当前节点" value={currentNode.title} theme={theme} /> : null}
            </div>
        </section>
    );
}

function VideoVersionsSection({
    productionPackage,
    theme,
    onPreview,
    onDownload,
    onSetCurrent,
    onHide,
}: {
    productionPackage: CanvasProductionPackageSummary;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPreview: (version: CanvasProductionVideoVersion) => void;
    onDownload: (version: CanvasProductionVideoVersion) => void;
    onSetCurrent: (packageId: string, nodeId: string) => void;
    onHide: (nodeId: string) => void;
}) {
    const versions = productionPackage.versions;
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">视频版本</div>
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    {versions.filter((version) => !version.hidden).length} 个可用
                </div>
            </div>
            {versions.length ? (
                <div className="space-y-2">
                    {versions.map((version) => (
                        <div
                            key={version.versionId}
                            className="rounded-xl border p-3"
                            style={{
                                background: version.isCurrent ? "rgba(34,211,238,.12)" : theme.node.panel,
                                borderColor: version.isCurrent ? "rgba(34,211,238,.72)" : theme.node.stroke,
                                opacity: version.hidden ? 0.48 : 1,
                            }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="break-words text-sm font-semibold">
                                        {version.label}
                                        {version.isCurrent ? " · 当前采用" : version.hidden ? " · 已隐藏" : ""}
                                    </div>
                                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                        {formatVersionTime(version.createdAt)} · {version.duration || "未记录时长"} · {version.status}
                                    </div>
                                </div>
                                {version.isCurrent ? (
                                    <span className="shrink-0 rounded-md border px-2 py-1 text-xs" style={{ borderColor: "rgba(34,211,238,.72)", color: "rgb(103,232,249)" }}>
                                        已采用
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-2 break-words text-xs leading-5" style={{ color: theme.node.muted }}>
                                {version.note}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <SmallInspectorButton icon={<Eye className="size-3.5" />} label="预览" onClick={() => onPreview(version)} theme={theme} />
                                <SmallInspectorButton icon={<Download className="size-3.5" />} label="导出" onClick={() => onDownload(version)} theme={theme} disabled={!version.node.metadata?.content} />
                                <SmallInspectorButton icon={<CheckCircle2 className="size-3.5" />} label="设为当前" onClick={() => onSetCurrent(productionPackage.id, version.nodeId)} theme={theme} disabled={version.isCurrent || version.hidden || version.node.metadata?.status !== "success"} />
                                <SmallInspectorButton icon={<EyeOff className="size-3.5" />} label="隐藏" onClick={() => onHide(version.nodeId)} theme={theme} disabled={version.hidden} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyStatus text="暂无视频版本。可把配置节点放入画布，或先选中已有视频再绑定到这个生产包。" theme={theme} />
            )}
        </section>
    );
}

function InspectorRow({ label, value, theme }: { label: string; value: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs leading-5">
            <span style={{ color: theme.node.muted }}>{label}</span>
            <span className="break-words font-medium">{value}</span>
        </div>
    );
}

function SmallInspectorButton({ icon, label, onClick, theme, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; disabled?: boolean }) {
    return (
        <button
            type="button"
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onClick={onClick}
            disabled={disabled}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function formatVersionTime(value: string) {
    if (!value) return "未记录时间";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function ConfigInputsSection({ inputs, theme }: { inputs: NodeGenerationInput[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">完整输入预览</div>
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    {inputs.length} 项
                </div>
            </div>
            {inputs.length ? (
                <div className="space-y-2">
                    {inputs.map((input, index) => (
                        <div key={input.nodeId} className="rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                            <div className="mb-1 text-[11px]" style={{ color: theme.node.muted }}>
                                {index + 1}. {inputTypeLabel(input)} · {input.title}
                            </div>
                            {input.text ? <div className="whitespace-pre-wrap break-words text-xs leading-5">{input.text}</div> : null}
                            {input.image?.dataUrl ? <img className="max-h-36 w-full rounded-md object-contain" src={input.image.dataUrl} alt={input.title} /> : null}
                            {input.video?.url ? <video className="max-h-36 w-full rounded-md bg-black" src={input.video.url} controls playsInline /> : null}
                            {input.audio?.url ? <audio className="w-full" src={input.audio.url} controls /> : null}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    暂无上游输入
                </div>
            )}
        </section>
    );
}

function RecordsView({ selectedNode, selectedShot, theme }: { selectedNode: CanvasNodeData | null; selectedShot?: StoryboardTableShot | null; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const shotRawParts = selectedShot ? buildShotReadableContent(selectedShot).raw : [];
    return (
        <div className="thin-scrollbar max-h-[70vh] overflow-y-auto px-1 py-1">
            {shotRawParts.length ? <RawSourceSection items={shotRawParts} theme={theme} expanded /> : null}
            {selectedNode ? <MetadataSummary node={selectedNode} theme={theme} expanded /> : !shotRawParts.length ? <div className="mt-3 text-sm" style={{ color: theme.node.muted }}>选中节点或镜头后可查看任务和元信息。</div> : null}
        </div>
    );
}

function MetadataSummary({ node, theme, expanded = false }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; expanded?: boolean }) {
    const rows = [
        ["ID", node.id],
        ["模型", node.metadata?.model],
        ["任务", node.metadata?.taskId],
        ["AI 任务", node.metadata?.aiTaskId],
        ["文件", node.metadata?.bytes ? formatBytes(node.metadata.bytes) : ""],
        ["素材", node.metadata?.sourceAssetId],
        ["集数", node.metadata?.episodeTitle || node.metadata?.episodeId],
        ["分镜", node.metadata?.storyboardShotId || node.metadata?.shotGroupId],
    ].filter((row): row is [string, string] => Boolean(row[1]));
    if (!rows.length && !expanded) return null;
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">记录摘要</div>
            {rows.length ? (
                <div className="space-y-1.5">
                    {rows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-xs leading-5">
                            <span style={{ color: theme.node.muted }}>{label}</span>
                            <span className="break-all">{value}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    暂无任务记录
                </div>
            )}
        </section>
    );
}

function TextSection({ title, text, theme, danger = false }: { title: string; text: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; danger?: boolean }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: danger ? "rgba(127,29,29,.14)" : theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">{title}</div>
            <div className="thin-scrollbar max-h-[42vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6" data-canvas-no-zoom>
                {text}
            </div>
        </section>
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

function readablePrompt(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || node.metadata?.finalPrompt || "";
}

function nodeTypeLabel(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return "文本节点";
    if (node.type === CanvasNodeType.Image) return "图片节点";
    if (node.type === CanvasNodeType.Video) return "视频节点";
    if (node.type === CanvasNodeType.Audio) return "音频节点";
    return "生成配置节点";
}

function nodeStatusLabel(node: CanvasNodeData) {
    const status = node.metadata?.status || "idle";
    if (status === "loading") return "生成中";
    if (status === "success") return "成功";
    if (status === "error") return "失败";
    return "待处理";
}

function shotGroupStatusLabel(group: ShotGroup) {
    if (group.status === "generating") return "生成中";
    if (group.status === "done") return "已生成";
    if (group.status === "error") return group.errorMessage || "失败";
    if (group.status === "in_canvas") return "已入画布";
    if (group.status === "prompt_ready") return "提示词就绪";
    return "待承接";
}

function inputTypeLabel(input: NodeGenerationInput) {
    if (input.type === "text") return "文本";
    if (input.type === "image") return "图片";
    if (input.type === "video") return "视频";
    return "音频";
}
