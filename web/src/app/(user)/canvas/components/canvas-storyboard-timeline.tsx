"use client";

import { AlertTriangle, CheckCircle2, Film, Link2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";

type CanvasStoryboardTimelineProps = {
    shots: StoryboardTableShot[];
    shotGroups: ShotGroup[];
    nodes: CanvasNodeData[];
    activeShotId?: string;
    onSelectShot: (shot: StoryboardTableShot, nodeId?: string) => void;
    onOpenWorkbench: () => void;
};

export function CanvasStoryboardTimeline({ shots, shotGroups, nodes, activeShotId, onSelectShot, onOpenWorkbench }: CanvasStoryboardTimelineProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!shots.length) return null;

    return (
        <div className="pointer-events-none absolute inset-x-4 bottom-20 z-40 flex justify-center">
            <div className="pointer-events-auto flex max-w-[min(980px,calc(100%-32px))] items-center gap-2 rounded-xl border px-2 py-2 shadow-[0_14px_34px_rgba(28,25,23,.12)] backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                <button type="button" className="inline-flex h-16 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg text-xs transition hover:opacity-80" style={{ background: theme.node.fill, color: theme.node.muted }} onClick={onOpenWorkbench}>
                    <Film className="size-4" />
                    分镜检查
                </button>
                <div className="thin-scrollbar flex min-w-0 gap-1.5 overflow-x-auto">
                    {shots.map((shot) => {
                        const groups = findShotGroups(shot, shotGroups);
                        const node = findShotNode(shot, groups, nodes);
                        const active = activeShotId === shot.id;
                        const status = shotStatusLabel(shot, groups, node);
                        const health = shotHealth(groups, node);
                        return (
                            <button
                                key={shot.id}
                                type="button"
                                className="grid h-[76px] w-52 shrink-0 grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-lg border p-1.5 text-left transition hover:opacity-90"
                                style={{ background: active ? theme.toolbar.activeBg : theme.node.fill, borderColor: active ? theme.node.activeStroke : theme.node.stroke, color: theme.node.text }}
                                onClick={() => onSelectShot(shot, node?.id)}
                            >
                                <div className="grid h-full place-items-center rounded-md" style={{ background: node?.metadata?.content ? "transparent" : theme.node.panel }}>
                                    {node?.type === "image" && node.metadata?.content ? <img src={node.metadata.content} alt={`镜头 ${shot.order}`} className="h-full w-full rounded-md object-cover" /> : node?.type === "video" && node.metadata?.content ? <Video className="size-5" /> : <span className="text-xs font-semibold tabular-nums">镜{shot.order}</span>}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold">镜头 {shot.order}</div>
                                    <div className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: theme.node.muted }}>
                                        <span>{shot.estimatedDuration || 0}s</span>
                                        <span>·</span>
                                        <span>{status}</span>
                                    </div>
                                    <div className="mt-1 break-words text-[10px]" style={{ color: theme.node.muted }}>
                                        {shot.sceneName || "未命名场次"}
                                    </div>
                                    <div className="mt-1 flex items-center gap-1">
                                        <StatusDot health={health} />
                                        <span className="truncate text-[10px]" style={{ color: health === "warning" ? "#b45309" : theme.node.muted }}>
                                            {healthLabel(health, groups)}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function findShotGroups(shot: StoryboardTableShot, shotGroups: ShotGroup[]) {
    return shotGroups.filter((group) => group.shotIds.includes(shot.id));
}

function findShotNode(shot: StoryboardTableShot, groups: ShotGroup[], nodes: CanvasNodeData[]) {
    const groupIds = groups.map((group) => group.id);
    return nodes.find(
        (node) =>
            node.metadata?.storyboardTableShotIds?.includes(shot.id) ||
            node.metadata?.storyboardShotId === shot.id ||
            (node.metadata?.shotGroupId && groupIds.includes(node.metadata.shotGroupId)) ||
            (node.metadata?.storyboardShotGroupId && groupIds.includes(node.metadata.storyboardShotGroupId)),
    );
}

function shotStatusLabel(shot: StoryboardTableShot, groups: ShotGroup[], node?: CanvasNodeData) {
    if (node?.metadata?.status === "loading") return "生成中";
    if (node?.metadata?.status === "success") return "已生成";
    if (node?.metadata?.status === "error") return "失败";
    if (groups.some((group) => group.status === "generating")) return "生成中";
    if (groups.some((group) => group.status === "done")) return "已生成";
    if (groups.some((group) => group.status === "error")) return "失败";
    if (groups.some((group) => group.status === "in_canvas")) return "已入画布";
    if (node) return "已入画布";
    if (groups.some((group) => group.effectivePrompt || group.prompt)) return "提示词就绪";
    if (shot.workflowSource) return "已审核";
    return "待承接";
}

function shotHealth(groups: ShotGroup[], node?: CanvasNodeData) {
    if (node?.metadata?.status === "error") return "danger";
    if (node?.metadata?.status === "success") return "done";
    if (groups.some((group) => group.status === "error")) return "danger";
    if (groups.some((group) => group.status === "done")) return "done";
    if (node) return "linked";
    if (groups.some((group) => group.status === "in_canvas" || group.status === "generating")) return "linked";
    if (!groups.length) return "warning";
    if (!groups.some((group) => group.assetRefs.length || group.audioRefs.length)) return "warning";
    return "ready";
}

function healthLabel(health: string, groups: ShotGroup[]) {
    if (health === "danger") return "需要重试";
    if (health === "done") return "成片可查";
    if (health === "linked") return "节点已承接";
    if (health === "ready") return `${groups.reduce((total, group) => total + group.assetRefs.length + group.audioRefs.length, 0)} 个参考`;
    return "待补承接";
}

function StatusDot({ health }: { health: string }) {
    if (health === "danger") return <AlertTriangle className="size-3 text-red-500" />;
    if (health === "done") return <CheckCircle2 className="size-3 text-emerald-500" />;
    if (health === "linked") return <Link2 className="size-3 text-blue-500" />;
    if (health === "ready") return <CheckCircle2 className="size-3 text-cyan-600" />;
    return <AlertTriangle className="size-3 text-amber-600" />;
}
