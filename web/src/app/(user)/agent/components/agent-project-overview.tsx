import { Empty, Progress } from "antd";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, Clock3, Layers3 } from "lucide-react";

import type { AgentProjectView } from "../agent-workspace-model";
import { agentStatusLabel } from "./agent-stage-gates";

export function AgentProjectOverview({ projects }: { projects: AgentProjectView[] }) {
    if (!projects.length) return <div className="border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] py-16"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的项目" /></div>;
    return (
        <div className="grid gap-3 lg:grid-cols-2">
            {projects.map((project) => (
                <Link key={project.id} href={`/agent?projectId=${encodeURIComponent(project.id)}`} className="group border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-xs text-[var(--studio-text-muted)]">{agentStatusLabel(project.status)}</p>
                            <h2 className="mt-1 truncate text-lg font-semibold text-[var(--studio-text-primary)]">{project.title}</h2>
                            <p className="mt-1 line-clamp-1 text-sm text-[var(--studio-text-muted)]">{project.description || "尚未填写项目说明"}</p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-[var(--studio-text-muted)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--studio-text-primary)]" />
                    </div>
                    <div className="mt-5 flex items-end gap-4">
                        <span className="font-mono text-3xl font-medium tracking-tight text-[var(--studio-text-primary)]">{project.progress}%</span>
                        <Progress percent={project.progress} showInfo={false} strokeColor="var(--studio-accent)" trailColor="var(--studio-border-subtle)" className="!mb-1 flex-1" />
                    </div>
                    <div className="mt-5 grid grid-cols-3 border-t border-[var(--studio-border-subtle)] pt-4 text-xs text-[var(--studio-text-secondary)]">
                        <span className="inline-flex items-center gap-1.5"><Layers3 className="size-3.5" />{project.episodeCount} 个分集</span>
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" />{project.reviewCount} 待审核</span>
                        <span className="inline-flex items-center justify-end gap-1.5"><CircleAlert className="size-3.5" />{project.failureCount + project.warningCount} 异常/警告</span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--studio-text-muted)]">最近推进：{project.currentStageLabel}</p>
                </Link>
            ))}
        </div>
    );
}
