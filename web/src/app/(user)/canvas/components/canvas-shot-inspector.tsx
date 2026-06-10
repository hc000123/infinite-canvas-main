"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { inspectStoryboardShot, summarizeShotInspections } from "../utils/canvas-shot-inspection";
import { buildShotReadableContent, readableShotTitle, type ShotReadablePart } from "../utils/shot-readable-content";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

export function ShotInspector({
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
    theme: CanvasTheme;
    onSelectShot?: (shot: StoryboardTableShot, nodeId?: string) => void;
    onOpenEpisodeWorkbench: () => void;
}) {
    const prompt = groups
        .map((group) => group.effectivePrompt || group.prompt)
        .filter(Boolean)
        .join("\n\n");
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

function ReferenceSection({ refs, assetTitleById, theme }: { refs: Array<ShotGroup["assetRefs"][number]>; assetTitleById: Map<string, string>; theme: CanvasTheme }) {
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

function HandoffStatusSection({ groups, nodes, theme }: { groups: ShotGroup[]; nodes: CanvasNodeData[]; theme: CanvasTheme }) {
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

export function ShotChecklistSection({
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
    theme: CanvasTheme;
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

function MiniStat({ label, value, theme }: { label: string; value: number; theme: CanvasTheme }) {
    return (
        <div className="rounded-lg border px-2 py-1.5" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div className="text-[10px]" style={{ color: theme.node.muted }}>
                {label}
            </div>
            <div className="text-sm font-semibold tabular-nums">{value}</div>
        </div>
    );
}

export function RawSourceSection({ items, theme, expanded = false }: { items: ShotReadablePart[]; theme: CanvasTheme; expanded?: boolean }) {
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

function StatusRow({ label, title, meta, theme }: { label: string; title: string; meta: string; theme: CanvasTheme }) {
    return (
        <div className="rounded-lg border px-2 py-1.5 text-xs leading-5" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div style={{ color: theme.node.muted }}>
                {label} · {meta}
            </div>
            <div className="break-words font-medium">{title}</div>
        </div>
    );
}

function EmptyStatus({ text, theme }: { text: string; theme: CanvasTheme }) {
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

function TextSection({ title, text, theme, danger = false }: { title: string; text: string; theme: CanvasTheme; danger?: boolean }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: danger ? "rgba(127,29,29,.14)" : theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">{title}</div>
            <div className="thin-scrollbar max-h-[42vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6" data-canvas-no-zoom>
                {text}
            </div>
        </section>
    );
}

function Stat({ label, value, theme }: { label: string; value: string | number; theme: CanvasTheme }) {
    return (
        <div className="rounded-lg border px-2 py-2" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div className="text-[11px]" style={{ color: theme.node.muted }}>
                {label}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function InspectorAction({ icon, label, onClick, theme, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; theme: CanvasTheme; disabled?: boolean }) {
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

function nodeTypeLabel(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return "文本节点";
    if (node.type === CanvasNodeType.Image) return "图片节点";
    if (node.type === CanvasNodeType.Video) return "视频节点";
    if (node.type === CanvasNodeType.Audio) return "音频节点";
    return "生成配置节点";
}

function nodeStatusLabel(node: CanvasNodeData) {
    if (node.metadata?.content && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio)) return "成功";
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
