"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Input, Select, Spin } from "antd";
import { ArrowLeft, CircleAlert, Clock3, LoaderCircle, Search } from "lucide-react";

import { listWorkflowRuns, type WorkflowRunListItem } from "@/services/api/workflow-runs";
import { useUserStore } from "@/stores/use-user-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { buildAgentProjectViews, filterAgentProjectViews, type AgentAttentionStatus } from "./agent-workspace-model";
import { AgentEpisodeOverview } from "./components/agent-episode-overview";
import { AgentProjectOverview } from "./components/agent-project-overview";
import { AgentStageGates } from "./components/agent-stage-gates";

const statusOptions: Array<{ label: string; value: AgentAttentionStatus }> = [
    { label: "全部状态", value: "all" },
    { label: "运行中", value: "running" },
    { label: "待审核", value: "review" },
    { label: "阻塞", value: "blocked" },
    { label: "失败", value: "failed" },
    { label: "已完成", value: "completed" },
];

export function AgentWorkspace() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = searchParams.get("projectId") || "";
    const episodeId = searchParams.get("episodeId") || "";
    const token = useUserStore((state) => state.token);
    const projectsHydrated = useCreativeProjectStore((state) => state.hydrated);
    const projects = useCreativeProjectStore((state) => state.projects.filter((project) => project.status === "active"));
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
    const episodes = useScriptStore((state) => state.episodes);
    const [runs, setRuns] = useState<WorkflowRunListItem[]>([]);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [remoteError, setRemoteError] = useState("");
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<AgentAttentionStatus>("all");

    useEffect(() => {
        if (!token) {
            setRuns([]);
            setRemoteError("");
            return;
        }
        let active = true;
        setRemoteLoading(true);
        setRemoteError("");
        void listWorkflowRuns({ projectId: projectId || undefined, page: 1, pageSize: 100 })
            .then((result) => { if (active) setRuns(result.items); })
            .catch((error: unknown) => { if (active) { setRuns([]); setRemoteError(error instanceof Error ? error.message : "读取运行进度失败"); } })
            .finally(() => { if (active) setRemoteLoading(false); });
        return () => { active = false; };
    }, [projectId, token]);

    const views = useMemo(() => buildAgentProjectViews({ projects, episodes, runs }), [episodes, projects, runs]);
    const visibleProjects = useMemo(() => filterAgentProjectViews(views, { keyword, status }), [keyword, status, views]);
    const selectedProject = views.find((project) => project.id === projectId);
    const selectedEpisode = selectedProject?.episodes.find((episode) => episode.id === episodeId);
    const totals = useMemo(() => ({
        running: views.reduce((total, project) => total + project.runningCount, 0),
        review: views.reduce((total, project) => total + project.reviewCount, 0),
        attention: views.reduce((total, project) => total + project.failureCount + project.warningCount, 0),
    }), [views]);

    if (!projectsHydrated || !scriptsHydrated) return <main className="studio-shell grid min-h-[calc(100dvh-3.5rem)] place-items-center"><Spin description="正在读取 Agent 工作区" /></main>;

    return (
        <main className="studio-shell min-h-[calc(100dvh-3.5rem)] text-[var(--studio-text-primary)]">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 lg:py-8">
                <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--studio-border-subtle)] pb-5">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--studio-text-muted)]">Production control</p>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">项目 Agent</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--studio-text-secondary)]">跨项目查看生产进度，在每个阶段确认结果后再继续。视频生成始终由你手动启动。</p>
                    </div>
                    {projectId ? <Button icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/agent")}>所有项目</Button> : null}
                </header>

                <section className="mt-5 grid gap-px border border-[var(--studio-border-subtle)] bg-[var(--studio-border-subtle)] sm:grid-cols-3">
                    <Metric icon={LoaderCircle} label="运行中的分集" value={totals.running} />
                    <Metric icon={Clock3} label="等待你审核" value={totals.review} />
                    <Metric icon={CircleAlert} label="异常与占位警告" value={totals.attention} />
                </section>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Select className="min-w-48" value={projectId || "all"} options={[{ label: "所有项目", value: "all" }, ...views.map((project) => ({ label: project.title, value: project.id }))]} onChange={(value) => router.push(value === "all" ? "/agent" : `/agent?projectId=${encodeURIComponent(value)}`)} />
                    {!projectId ? <Input allowClear className="max-w-72" prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} placeholder="搜索项目名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} /> : null}
                    {!projectId ? <Select className="min-w-36" value={status} options={statusOptions} onChange={setStatus} /> : null}
                    {remoteLoading ? <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--studio-text-muted)]"><LoaderCircle className="size-3.5 animate-spin" />同步运行状态</span> : null}
                </div>

                {remoteError ? <Alert className="mt-4" type="warning" showIcon message="远程进度暂不可用" description={`${remoteError}。本地项目与分集仍可查看。`} /> : null}

                <div className="mt-5 space-y-5">
                    {!projectId ? <AgentProjectOverview projects={visibleProjects} /> : selectedProject ? (
                        <>
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div><p className="text-xs text-[var(--studio-text-muted)]">当前项目</p><h2 className="mt-1 text-xl font-semibold">{selectedProject.title}</h2></div>
                                <p className="text-sm text-[var(--studio-text-secondary)]">{selectedProject.episodeCount} 个分集 · 总体 {selectedProject.progress}%</p>
                            </div>
                            <AgentEpisodeOverview episodes={selectedProject.episodes} projectId={selectedProject.id} selectedEpisodeId={episodeId} />
                            {selectedEpisode ? <AgentStageGates episode={selectedEpisode} /> : null}
                        </>
                    ) : <Alert type="info" showIcon message="项目不存在或已归档" action={<Button size="small" onClick={() => router.push("/agent")}>返回所有项目</Button>} />}
                </div>
            </div>
        </main>
    );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) {
    return <div className="flex items-center justify-between bg-[var(--studio-panel-bg)] px-4 py-4"><div><p className="text-xs text-[var(--studio-text-muted)]">{label}</p><p className="mt-1 font-mono text-2xl font-medium">{value}</p></div><Icon className="size-5 text-[var(--studio-text-muted)]" /></div>;
}
