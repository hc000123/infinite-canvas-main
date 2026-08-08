import { Empty, Progress } from "antd";
import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";

import { agentEpisodeHref, type AgentEpisodeView } from "../agent-workspace-model";
import { agentStatusLabel } from "./agent-stage-gates";

export function AgentEpisodeOverview({ episodes, selectedEpisodeId }: { episodes: AgentEpisodeView[]; selectedEpisodeId?: string }) {
    if (!episodes.length) return <div className="border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] py-14"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目还没有分集，请先创建或导入剧本" /></div>;
    return (
        <div className="overflow-hidden border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]">
            {episodes.map((episode) => {
                const href = agentEpisodeHref(episode);
                return (
                    <Link key={episode.id} href={href} className={`grid gap-3 border-b border-[var(--studio-border-subtle)] px-4 py-4 transition last:border-b-0 hover:bg-[var(--studio-hover-bg)] sm:grid-cols-[minmax(0,1fr)_180px_140px_auto] sm:items-center ${selectedEpisodeId === episode.id ? "bg-[var(--studio-hover-bg)]" : ""}`}>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-[var(--studio-text-muted)]">{episode.code} · {agentStatusLabel(episode.status)}</p>
                            <h3 className="mt-1 truncate font-semibold text-[var(--studio-text-primary)]">{episode.title}</h3>
                            <p className="mt-1 text-xs text-[var(--studio-text-muted)]">下一步：{episode.currentStageLabel}</p>
                        </div>
                        <div className="flex items-center gap-3"><Progress percent={episode.progress} showInfo={false} strokeColor="var(--studio-accent)" railColor="var(--studio-border-subtle)" className="!mb-0 flex-1" /><span className="w-9 text-right font-mono text-xs text-[var(--studio-text-secondary)]">{episode.progress}%</span></div>
                        <div className="text-xs text-[var(--studio-text-secondary)]">{episode.reviewCount || episode.warningCount ? <span className="inline-flex items-center gap-1.5"><CircleAlert className="size-3.5" />{episode.reviewCount} 审核 · {episode.warningCount} 警告</span> : "状态正常"}</div>
                        <ArrowRight className="hidden size-4 text-[var(--studio-text-muted)] sm:block" />
                    </Link>
                );
            })}
        </div>
    );
}
