import { Check, Circle, CircleAlert, LoaderCircle, PackageCheck, Palette, ScrollText, Shapes, Video, WandSparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import type { WorkflowStageKey } from "../workflow-route-state";
import type { WorkflowStageView, WorkflowViewStatus } from "../workflow-view-types";

const stageIcons = { script: ScrollText, art: Palette, assets: Shapes, storyboard: WandSparkles, video: Video, delivery: PackageCheck };

export function WorkflowStageRail(props: { active: WorkflowStageKey; onSelect: (stage: WorkflowStageKey) => void; stages: WorkflowStageView[] }) {
    return (
        <nav aria-label="视频工作流阶段" className="hidden min-h-0 border-r border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-2 py-3 xl:block">
            <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--studio-text-muted)]">Production</div>
            <div className="space-y-1">
                {props.stages.map((stage, index) => {
                    const Icon = stageIcons[stage.key];
                    return (
                        <button
                            key={stage.key}
                            type="button"
                            aria-current={props.active === stage.key ? "step" : undefined}
                            className={cn(
                                "group relative flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-left transition",
                                props.active === stage.key ? "bg-[var(--studio-active-bg)] text-[var(--studio-text-primary)]" : "text-[var(--studio-text-secondary)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]",
                            )}
                            onClick={() => props.onSelect(stage.key)}
                        >
                            {props.active === stage.key ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--studio-accent)]" /> : null}
                            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]"><Icon className="size-3.5" /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">{index + 1}. {stage.label}</span>
                                <span className="mt-1 flex items-center gap-1 text-[10px] text-[var(--studio-text-muted)]"><StatusIcon status={stage.status} />{statusLabel(stage.status)}{stage.count ? ` · ${stage.count}` : ""}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

function StatusIcon({ status }: { status: WorkflowViewStatus }) {
    if (["approved", "applied", "complete"].includes(status)) return <Check className="size-3 text-[var(--studio-success)]" />;
    if (["queued", "running", "cancel_requested"].includes(status)) return <LoaderCircle className="size-3 animate-spin text-[var(--studio-accent)]" />;
    if (["blocked", "failed", "rejected"].includes(status)) return <CircleAlert className="size-3 text-[var(--studio-warning)]" />;
    return <Circle className="size-3" />;
}

function statusLabel(status: WorkflowViewStatus) {
    const labels: Record<WorkflowViewStatus, string> = {
        applied: "已写入",
        approved: "已通过",
        blocked: "被阻断",
        cancel_requested: "停止中",
        cancelled: "已停止",
        complete: "已完成",
        failed: "失败",
        idle: "未开始",
        needs_review: "待审核",
        queued: "排队中",
        ready: "可开始",
        rejected: "需修改",
        running: "进行中",
    };
    return labels[status];
}
