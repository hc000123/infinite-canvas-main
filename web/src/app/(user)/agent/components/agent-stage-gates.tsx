import Link from "next/link";
import { AlertCircle, Check, Circle, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AgentEpisodeView, AgentStageStatus } from "../agent-workspace-model";

const statusMeta: Record<AgentStageStatus, { label: string; className: string; icon: typeof Circle }> = {
    idle: { label: "未开始", className: "text-[var(--studio-text-muted)]", icon: Circle },
    ready: { label: "可开始", className: "text-[var(--studio-accent)]", icon: Clock3 },
    running: { label: "运行中", className: "text-[var(--studio-accent)]", icon: LoaderCircle },
    needs_review: { label: "待审核", className: "text-[var(--studio-warning)]", icon: AlertCircle },
    approved: { label: "已批准", className: "text-[var(--studio-success)]", icon: Check },
    applied: { label: "已应用", className: "text-[var(--studio-success)]", icon: Check },
    warning: { label: "有占位", className: "text-[var(--studio-warning)]", icon: TriangleAlert },
    blocked: { label: "已阻塞", className: "text-[var(--studio-text-muted)]", icon: Circle },
    failed: { label: "失败", className: "text-[var(--studio-danger)]", icon: AlertCircle },
    cancelled: { label: "已取消", className: "text-[var(--studio-text-muted)]", icon: Circle },
    complete: { label: "已完成", className: "text-[var(--studio-success)]", icon: Check },
};

const routeStage = { script: "script", "asset-extraction": "assets", "asset-production": "assets", storyboard: "video", prompt: "video", video: "video" } as const;

export function AgentStageGates({ episode }: { episode: AgentEpisodeView }) {
    return (
        <section className="border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--studio-border-subtle)] px-4 py-3.5 sm:px-5">
                <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--studio-text-muted)]">Stage gates</p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--studio-text-primary)]">{episode.code} · {episode.title}</h2>
                </div>
                <p className="text-sm text-[var(--studio-text-secondary)]">当前：{episode.currentStageLabel}</p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-6">
                {episode.stages.map((stage, index) => {
                    const meta = statusMeta[stage.status];
                    const Icon = meta.icon;
                    const href = `/agent?projectId=${encodeURIComponent(episode.projectId)}&episodeId=${encodeURIComponent(episode.id)}&stage=${routeStage[stage.key]}`;
                    return (
                        <Link key={stage.key} href={href} className={cn("group relative min-h-36 border-b border-[var(--studio-border-subtle)] p-4 transition hover:bg-[var(--studio-hover-bg)] md:border-r xl:border-b-0", index === episode.stages.length - 1 && "md:border-r-0")}>
                            <div className="flex items-start justify-between gap-3">
                                <span className="font-mono text-xs text-[var(--studio-text-muted)]">{String(index + 1).padStart(2, "0")}</span>
                                <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.className)}><Icon className={cn("size-3.5", stage.status === "running" && "animate-spin")} />{meta.label}</span>
                            </div>
                            <h3 className="mt-5 text-sm font-semibold text-[var(--studio-text-primary)]">{stage.label}</h3>
                            <p className="mt-1.5 text-xs leading-5 text-[var(--studio-text-muted)]">{stage.blockingReason || stage.description}</p>
                            {stage.warningCount ? <p className="mt-2 text-xs font-medium text-[var(--studio-warning)]">{stage.warningCount} 项需要留意</p> : null}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

export function agentStatusLabel(status: AgentEpisodeView["status"]) {
    return ({ not_started: "尚未开始", running: "运行中", review: "待审核", blocked: "阻塞", failed: "失败", completed: "已完成" } as const)[status];
}
