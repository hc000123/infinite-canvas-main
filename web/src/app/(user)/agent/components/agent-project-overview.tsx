import { Empty, Progress } from "antd";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, Clock3, Layers3 } from "lucide-react";

import type { AgentProjectView } from "../agent-workspace-model";
import { agentStatusLabel } from "./agent-stage-gates";

export function AgentProjectOverview({ projects }: { projects: AgentProjectView[] }) {
    if (!projects.length) return <div className="border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] py-16"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的项目" /></div>;
    return (
        <div className="border-t border-[var(--studio-border-subtle)]">
            {projects.map((project) => (
                <Link key={project.id} href={`/agent?projectId=${encodeURIComponent(project.id)}`} className="group -mx-3 grid gap-4 border-b border-[var(--studio-border-subtle)] px-3 py-4 transition-colors duration-100 hover:bg-[var(--studio-hover-bg)] sm:grid-cols-[minmax(0,1fr)_72px_minmax(250px,0.8fr)_auto] sm:items-center">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-lg font-semibold text-[var(--studio-text-primary)]">{project.title}</h2>
                            <span className="text-xs text-[var(--studio-text-muted)]">{agentStatusLabel(project.status)}</span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-sm text-[var(--studio-text-muted)]">{project.description || "尚未填写项目说明"}</p>
                        <p className="mt-1 text-xs text-[var(--studio-text-muted)]">最近推进：{project.currentStageLabel}</p>
                    </div>
                    <div className="font-mono text-2xl font-medium tracking-tight text-[var(--studio-text-primary)]">{project.progress}%</div>
                    <div className="min-w-0">
                        <Progress percent={project.progress} showInfo={false} strokeColor="var(--studio-accent)" railColor="var(--studio-border-subtle)" className="!mb-2" />
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--studio-text-secondary)]">
                            <span className="inline-flex items-center gap-1.5"><Layers3 className="size-3.5" />{project.episodeCount} 个分集</span>
                            <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" />{project.reviewCount} 待审核</span>
                            <span className="inline-flex items-center gap-1.5"><CircleAlert className="size-3.5" />{project.failureCount + project.warningCount} 异常</span>
                        </div>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-[var(--studio-text-muted)] transition-colors group-hover:text-[var(--studio-text-primary)]" />
                </Link>
            ))}
        </div>
    );
}
