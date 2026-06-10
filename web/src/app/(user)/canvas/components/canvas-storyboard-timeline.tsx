"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Film, Link2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";
import { inspectStoryboardShot, summarizeShotInspections, type ShotInspectionPhase } from "../utils/canvas-shot-inspection";

type CanvasStoryboardTimelineProps = {
    shots: StoryboardTableShot[];
    shotGroups: ShotGroup[];
    nodes: CanvasNodeData[];
    activeShotId?: string;
    onSelectShot: (shot: StoryboardTableShot, nodeId?: string) => void;
    onOpenWorkbench: () => void;
};

type TimelineFilter = "all" | ShotInspectionPhase;

export function CanvasStoryboardTimeline({ shots, shotGroups, nodes, activeShotId, onSelectShot, onOpenWorkbench }: CanvasStoryboardTimelineProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [filter, setFilter] = useState<TimelineFilter>("all");
    const shotItems = useMemo(() => shots.map((shot) => ({ shot, inspection: inspectStoryboardShot(shot, shotGroups, nodes) })), [nodes, shotGroups, shots]);
    const summary = useMemo(() => summarizeShotInspections(shotItems.map((item) => item.inspection)), [shotItems]);
    const visibleShotItems = filter === "all" ? shotItems : shotItems.filter((item) => item.inspection.phase === filter);
    useEffect(() => {
        if (filter === "all" || !activeShotId) return;
        const activeItem = shotItems.find((item) => item.shot.id === activeShotId);
        if (activeItem && activeItem.inspection.phase !== filter) setFilter("all");
    }, [activeShotId, filter, shotItems]);
    if (!shots.length) return null;

    return (
        <div className="pointer-events-none absolute inset-x-4 bottom-20 z-40 flex justify-center">
            <div
                className="pointer-events-auto flex max-w-[min(1100px,calc(100%-32px))] items-stretch gap-2 rounded-xl border px-2 py-2 shadow-[0_14px_34px_rgba(28,25,23,.12)] backdrop-blur"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            >
                <div className="flex w-32 shrink-0 flex-col gap-1.5">
                    <button
                        type="button"
                        className="inline-flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                        style={{ background: theme.node.fill, color: theme.node.muted }}
                        onClick={onOpenWorkbench}
                    >
                        <Film className="size-4" />
                        分镜检查
                    </button>
                    <div className="grid grid-cols-2 gap-1">
                        {timelineFilters.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="min-h-7 rounded-md px-1 text-[10px] font-medium transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                style={{ background: filter === item.value ? theme.toolbar.activeBg : theme.node.fill, color: filter === item.value ? theme.node.text : theme.node.muted }}
                                onClick={() => setFilter(item.value)}
                            >
                                {item.label} {summary[item.value]}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="thin-scrollbar flex min-w-0 gap-1.5 overflow-x-auto">
                    {visibleShotItems.map(({ shot, inspection }) => {
                        const node = inspection.node;
                        const active = activeShotId === shot.id;
                        return (
                            <button
                                key={shot.id}
                                type="button"
                                className="grid h-[76px] w-52 shrink-0 grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-lg border p-1.5 text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                style={{ background: active ? theme.toolbar.activeBg : theme.node.fill, borderColor: active ? theme.node.activeStroke : theme.node.stroke, color: theme.node.text }}
                                onClick={() => onSelectShot(shot, node?.id)}
                            >
                                <div className="grid h-full place-items-center rounded-md" style={{ background: node?.metadata?.content ? "transparent" : theme.node.panel }}>
                                    {node?.type === "image" && node.metadata?.content ? (
                                        <img src={node.metadata.content} alt={`镜头 ${shot.order}`} className="h-full w-full rounded-md object-cover" />
                                    ) : node?.type === "video" && node.metadata?.content ? (
                                        <Video className="size-5" />
                                    ) : (
                                        <span className="text-xs font-semibold tabular-nums">镜{shot.order}</span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold">镜头 {shot.order}</div>
                                    <div className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: theme.node.muted }}>
                                        <span>{shot.estimatedDuration || 0}s</span>
                                        <span>·</span>
                                        <span>{inspection.statusLabel}</span>
                                    </div>
                                    <div className="mt-1 break-words text-[10px]" style={{ color: theme.node.muted }}>
                                        {shot.sceneName || "未命名场次"}
                                    </div>
                                    <div className="mt-1 flex items-center gap-1">
                                        <StatusDot health={inspection.health} />
                                        <span className="truncate text-[10px]" style={{ color: inspection.health === "warning" ? "#b45309" : theme.node.muted }}>
                                            {inspection.healthLabel}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {!visibleShotItems.length ? (
                        <div className="grid h-[76px] w-64 shrink-0 place-items-center rounded-lg border border-dashed px-3 text-center text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                            当前筛选下没有镜头
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

const timelineFilters: { value: TimelineFilter; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "todo", label: "未承接" },
    { value: "ready", label: "就绪" },
    { value: "linked", label: "入画布" },
    { value: "running", label: "生成中" },
    { value: "done", label: "已生成" },
    { value: "error", label: "失败" },
];

function StatusDot({ health }: { health: string }) {
    if (health === "danger") return <AlertTriangle className="size-3 text-red-500" />;
    if (health === "done") return <CheckCircle2 className="size-3 text-emerald-500" />;
    if (health === "linked") return <Link2 className="size-3 text-blue-500" />;
    if (health === "ready") return <CheckCircle2 className="size-3 text-cyan-600" />;
    return <AlertTriangle className="size-3 text-amber-600" />;
}
