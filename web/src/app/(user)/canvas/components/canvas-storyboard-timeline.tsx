"use client";

import { Film, Video } from "lucide-react";

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
                        const node = findShotNode(shot, shotGroups, nodes);
                        const active = activeShotId === shot.id;
                        const status = shotStatusLabel(shot, node);
                        return (
                            <button
                                key={shot.id}
                                type="button"
                                className="grid h-16 w-44 shrink-0 grid-cols-[44px_minmax(0,1fr)] gap-2 rounded-lg border p-1.5 text-left transition hover:opacity-90"
                                style={{ background: active ? theme.toolbar.activeBg : theme.node.fill, borderColor: active ? theme.node.activeStroke : theme.node.stroke, color: theme.node.text }}
                                onClick={() => onSelectShot(shot, node?.id)}
                            >
                                <div className="grid h-full place-items-center rounded-md" style={{ background: node?.metadata?.content ? "transparent" : theme.node.panel }}>
                                    {node?.type === "image" && node.metadata?.content ? <img src={node.metadata.content} alt={shot.title} className="h-full w-full rounded-md object-cover" /> : node?.type === "video" && node.metadata?.content ? <Video className="size-5" /> : <span className="text-xs font-semibold tabular-nums">镜{shot.order}</span>}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold">{shot.title || `镜头 ${shot.order}`}</div>
                                    <div className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: theme.node.muted }}>
                                        <span>{shot.estimatedDuration || 0}s</span>
                                        <span>·</span>
                                        <span>{status}</span>
                                    </div>
                                    <div className="mt-1 truncate text-[10px]" style={{ color: theme.node.muted }}>
                                        {shot.sceneName || "未命名场次"}
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

function findShotNode(shot: StoryboardTableShot, shotGroups: ShotGroup[], nodes: CanvasNodeData[]) {
    const groupIds = shotGroups.filter((group) => group.shotIds.includes(shot.id)).map((group) => group.id);
    return nodes.find((node) => node.metadata?.storyboardTableShotIds?.includes(shot.id) || node.metadata?.storyboardShotId === shot.id || (node.metadata?.shotGroupId && groupIds.includes(node.metadata.shotGroupId)));
}

function shotStatusLabel(shot: StoryboardTableShot, node?: CanvasNodeData) {
    if (node?.metadata?.status === "loading") return "生成中";
    if (node?.metadata?.status === "success") return "已生成";
    if (node?.metadata?.status === "error") return "失败";
    if (node) return "已入画布";
    if (shot.workflowSource) return "已审核";
    return "待承接";
}
