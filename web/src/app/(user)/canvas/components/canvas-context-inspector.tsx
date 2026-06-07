"use client";

import type { ReactNode } from "react";
import { Camera, Download, FileText, Image as ImageIcon, Info, Maximize2, MessageSquare, RefreshCw, Scissors, Sparkles, Upload, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData } from "../types";
import { CanvasNodeType } from "../types";
import type { NodeGenerationInput } from "./canvas-node-generation";
import type { EpisodeWorkbenchStats } from "../utils/episode-workbench";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";
import { inspectStoryboardShot, summarizeShotInspections } from "../utils/canvas-shot-inspection";

export type CanvasInspectorView = "context" | "assistant" | "records";

type CanvasContextInspectorProps = {
    view: CanvasInspectorView;
    onViewChange: (view: CanvasInspectorView) => void;
    title: string;
    episodeLabel: string;
    productionLabel: string;
    hasEpisode: boolean;
    stats: EpisodeWorkbenchStats;
    selectedNode: CanvasNodeData | null;
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
    onOpenImageBriefs: () => void;
    onOpenAssistant: () => void;
    onSelectShot?: (shot: StoryboardTableShot, nodeId?: string) => void;
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
    title,
    episodeLabel,
    productionLabel,
    hasEpisode,
    stats,
    selectedNode,
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
    onOpenImageBriefs,
    onOpenAssistant,
    onSelectShot,
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
                    <button
                        type="button"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition hover:opacity-85"
                        style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }}
                        onClick={onOpenEpisodeWorkbench}
                    >
                        <FileText className="size-3.5" />
                        本集流程
                    </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: theme.node.fill }}>
                    <InspectorTab label="内容" active={activeView === "context"} onClick={() => onViewChange("context")} />
                    <InspectorTab
                        label="助手"
                        active={activeView === "assistant"}
                        onClick={() => {
                            onOpenAssistant();
                            onViewChange("assistant");
                        }}
                    />
                    <InspectorTab label="记录" active={activeView === "records"} onClick={() => onViewChange("records")} />
                </div>
            </div>

            {activeView === "assistant" ? (
                <div className="min-h-0 flex-1 overflow-hidden">{assistantSlot}</div>
            ) : activeView === "records" ? (
                <RecordsView selectedNode={selectedNode} theme={theme} />
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
                    onOpenImageBriefs={onOpenImageBriefs}
                    onOpenEpisodeWorkbench={onOpenEpisodeWorkbench}
                    onOpenAssistant={() => {
                        onOpenAssistant();
                        onViewChange("assistant");
                    }}
                />
            )}
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
    const title = readableShotTitle(shot);
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
            {shot.scriptText ? <TextSection title="完整脚本" text={shot.scriptText} theme={theme} /> : null}
            {shot.visualDescription ? <TextSection title="分镜描述" text={shot.visualDescription} theme={theme} /> : null}
            {prompt ? <TextSection title="Seedance 视频提示词" text={prompt} theme={theme} /> : null}
            {refs.length ? <ReferenceSection refs={refs} assetTitleById={assetTitleById} theme={theme} /> : null}
            <HandoffStatusSection groups={groups} nodes={nodes} theme={theme} />
            <ShotChecklistSection shots={checklistShots} shotGroups={checklistShotGroups} nodes={checklistNodes} activeShotId={activeShotId} theme={theme} onSelectShot={onSelectShot} />
            {shot.dialogue ? <TextSection title="对白" text={shot.dialogue} theme={theme} /> : null}
            {shot.action || shot.emotion || shot.cameraMovement ? <TextSection title="表演与镜头" text={[shot.action, shot.emotion, shot.cameraMovement].filter(Boolean).join("\n\n")} theme={theme} /> : null}
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

function readableShotTitle(shot: StoryboardTableShot) {
    const title = shot.title.trim();
    if (!title) return "";
    if (title.length > 120) return "";
    if (/^(```|[{[])/.test(title)) return "";
    if (/workflow_|workflowId|workflowVersion|stageId|agentId/.test(title)) return "";
    return title;
}

function InspectorTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button type="button" className="h-8 rounded-md text-xs font-medium transition" style={{ background: active ? theme.toolbar.panel : "transparent", color: active ? theme.node.text : theme.node.muted }} onClick={onClick}>
            {label}
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
    onOpenImageBriefs,
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
    onOpenImageBriefs: () => void;
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
                <InspectorAction icon={<Sparkles className="size-4" />} label="生图 Brief" onClick={onOpenImageBriefs} theme={theme} />
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
            {node.type === CanvasNodeType.Video && node.metadata?.content ? <video className="mt-3 max-h-60 w-full rounded-xl bg-black" src={node.metadata.content} controls playsInline /> : null}
            {node.type === CanvasNodeType.Audio && node.metadata?.content ? <audio className="mt-3 w-full" src={node.metadata.content} controls /> : null}

            {node.type === CanvasNodeType.Config ? <ConfigInputsSection inputs={inputs} theme={theme} /> : null}
            {prompt ? <TextSection title={node.type === CanvasNodeType.Text ? "完整文本" : "完整提示词"} text={prompt} theme={theme} /> : null}
            {node.metadata?.errorDetails ? <TextSection title="失败原因" text={node.metadata.errorDetails} theme={theme} danger /> : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
                <InspectorAction icon={<Info className="size-4" />} label="节点信息" onClick={() => onInfo(node)} theme={theme} />
                {node.type === CanvasNodeType.Text ? <InspectorAction icon={<FileText className="size-4" />} label="编辑文字" onClick={() => onEditText(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Text ? <InspectorAction icon={<ImageIcon className="size-4" />} label="用文本生图" onClick={() => onGenerateImage(node)} theme={theme} /> : null}
                {node.type !== CanvasNodeType.Audio ? <InspectorAction icon={<MessageSquare className="size-4" />} label="编辑 / 生成" onClick={() => onToggleDialog(node)} theme={theme} /> : null}
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

function RecordsView({ selectedNode, theme }: { selectedNode: CanvasNodeData | null; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <section className="rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                <div className="text-sm font-semibold">记录 / 任务详情</div>
                <div className="mt-2 text-xs leading-5" style={{ color: theme.node.muted }}>
                    系统提示、原始响应、规范读取和调试字段默认收在这里，主界面只展示可判断的结果。
                </div>
            </section>
            {selectedNode ? <MetadataSummary node={selectedNode} theme={theme} expanded /> : <div className="mt-3 text-sm" style={{ color: theme.node.muted }}>选中节点后可查看任务和元信息。</div>}
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
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
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
