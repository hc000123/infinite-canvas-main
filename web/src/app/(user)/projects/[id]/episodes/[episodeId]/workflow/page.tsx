"use client";

import { useParams } from "next/navigation";
import { Alert, Button, Empty, Spin } from "antd";
import { CheckCircle2, CircleAlert, Clock3, FileText, Film, ImageIcon, ListFilter, Play, Search, ServerCog } from "lucide-react";

import { cn } from "@/lib/utils";

import { WorkflowHeader } from "./components/workflow-header";
import { WorkflowStageRail } from "./components/workflow-stage-rail";
import { useWorkflowWorkbench } from "./use-workflow-workbench";

export default function EpisodeWorkflowPage() {
    const params = useParams<{ episodeId: string; id: string }>();
    const workbench = useWorkflowWorkbench(params.id, params.episodeId);

    if (!workbench.isHydrated) {
        return <main className="studio-shell grid h-full place-items-center"><Spin description="正在读取本集生产资料" /></main>;
    }
    if (!workbench.project || !workbench.episode) {
        return (
            <main className="studio-shell grid h-full place-items-center px-6">
                <Empty description="项目或集数不存在"><Button href={workbench.project ? `/projects/${workbench.project.id}` : "/projects"}>返回项目</Button></Empty>
            </main>
        );
    }

    const activeStage = workbench.stageViews.find((stage) => stage.key === workbench.routeState.stage) || workbench.stageViews[0];

    return (
        <main className="studio-shell flex h-full min-w-0 flex-col overflow-hidden text-[var(--studio-text-primary)]">
            <WorkflowHeader
                blockerCount={workbench.blockerCount}
                episodeTitle={`第 ${String(workbench.episode.order).padStart(2, "0")} 集 · ${workbench.episode.title}`}
                loading={workbench.remoteLoading}
                modelSummary={workbench.modelSummary}
                onContinue={workbench.continueNext}
                onRefresh={workbench.refreshRemote}
                progress={workbench.progress}
                projectId={workbench.project.id}
                projectTitle={workbench.project.title}
                workerReady={Boolean(workbench.health?.ready)}
            />
            {workbench.remoteError ? <Alert className="mx-5 mt-3 shrink-0 xl:mx-7" showIcon closable type="warning" message="云端运行状态暂不可用" description={`${workbench.remoteError}。本地剧本、资产和视频生产包仍可继续查看。`} /> : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[168px_252px_minmax(420px,1fr)_320px]">
                <WorkflowStageRail active={workbench.routeState.stage} onSelect={workbench.selectRoute} stages={workbench.stageViews} />

                <aside className="hidden min-h-0 border-r border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] xl:flex xl:flex-col">
                    <div className="shrink-0 border-b border-[var(--studio-border-subtle)] px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <div><div className="text-xs font-semibold">{activeStage.label}</div><div className="mt-1 text-[11px] text-[var(--studio-text-muted)]">{activeStage.description}</div></div>
                            <ListFilter className="size-4 text-[var(--studio-text-muted)]" />
                        </div>
                        {workbench.packages.length ? <div className="mt-3 flex h-8 items-center gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-2 text-xs text-[var(--studio-text-muted)]"><Search className="size-3.5" />搜索分镜或问题</div> : null}
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                        {workbench.packages.length ? workbench.packages.map((item) => (
                            <button
                                key={`${item.projectId}:${item.episodeId}:${item.id}`}
                                type="button"
                                className={cn("mb-1.5 w-full rounded-md border px-3 py-2.5 text-left transition", workbench.selectedPackage?.id === item.id ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)]" : "border-transparent hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)]")}
                                onClick={() => workbench.selectRoute(workbench.routeState.stage, item.id)}
                            >
                                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{item.id}</span><PackageStatus item={item} /></div>
                                <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.segment}</div>
                            </button>
                        )) : <Empty className="mt-16" image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前阶段还没有分镜条目" />}
                    </div>
                </aside>

                <section className="thin-scrollbar min-h-0 overflow-y-auto bg-[var(--studio-workspace-bg)] px-4 py-4 xl:px-5">
                    <div className="mx-auto max-w-4xl">
                        <div className="mb-4 flex items-start justify-between gap-4 border-b border-[var(--studio-border-subtle)] pb-4">
                            <div><div className="text-xs font-medium text-[var(--studio-accent)]">当前工作区</div><h2 className="mt-1 text-xl font-semibold">{activeStage.label}</h2><p className="mt-1 text-sm text-[var(--studio-text-secondary)]">{activeStage.description}</p></div>
                            <StageBadge status={activeStage.status} />
                        </div>
                        <StageWorkspace stage={workbench.routeState.stage} script={workbench.scriptSnapshot} selected={workbench.selectedPackage} />
                    </div>
                </section>

                <aside className="hidden min-h-0 border-l border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] xl:flex xl:flex-col">
                    <div className="shrink-0 border-b border-[var(--studio-border-subtle)] px-4 py-3"><div className="text-xs font-semibold">结果与运行控制台</div><div className="mt-1 text-[11px] text-[var(--studio-text-muted)]">当前阶段与分镜的唯一操作出口</div></div>
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold"><ServerCog className="size-4 text-[var(--studio-accent)]" />云端执行器</div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><ConsoleMetric label="队列" value={String(workbench.health?.queueDepth ?? "—")} /><ConsoleMetric label="运行中" value={String(workbench.health?.runningCount ?? "—")} /><ConsoleMetric label="心跳" value={workbench.health?.heartbeatFresh ? "正常" : "待恢复"} /><ConsoleMetric label="文本通道" value={workbench.health?.textChannelAvailable ? "可用" : "不可用"} /></div>
                        </div>
                        {workbench.selectedPackage ? (
                            <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3">
                                <div className="flex items-center justify-between"><span className="text-xs font-semibold">{workbench.selectedPackage.id} 视频结果</span><Film className="size-4 text-[var(--studio-text-muted)]" /></div>
                                <div className="mt-3 grid aspect-video place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] text-center text-xs text-[var(--studio-text-muted)]">{workbench.selectedPackage.generation?.video ? "已有视频版本" : "尚未生成视频"}</div>
                                <div className="mt-3 space-y-2 text-xs"><InfoLine label="模型" value={workbench.selectedPackage.config.model} /><InfoLine label="时长" value={workbench.selectedPackage.config.duration} /><InfoLine label="画幅" value={workbench.selectedPackage.config.ratio} /><InfoLine label="清晰度" value={workbench.selectedPackage.config.resolution} /></div>
                                <Button className="mt-3 w-full" type="primary" icon={<Play className="size-4" />} disabled>进入视频阶段后生成</Button>
                            </div>
                        ) : null}
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="size-4" />最近运行</div>
                            <div className="mt-2 space-y-2">{workbench.events.slice(-5).reverse().map((event) => <div key={event.cursor} className="border-l border-[var(--studio-border-strong)] pl-2 text-[11px] leading-4 text-[var(--studio-text-secondary)]">{event.type}<div className="text-[10px] text-[var(--studio-text-muted)]">{new Date(event.createdAt).toLocaleTimeString()}</div></div>)}{!workbench.events.length ? <div className="py-4 text-center text-xs text-[var(--studio-text-muted)]">暂无运行记录</div> : null}</div>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    );
}

function StageWorkspace({ script, selected, stage }: { script: string; selected: ReturnType<typeof useWorkflowWorkbench>["selectedPackage"]; stage: string }) {
    if (stage === "script") return <Panel icon={<FileText className="size-4" />} title="本集确认稿" description="云端阶段将使用这份不可变快照，不会再次自动改写。"><pre className="thin-scrollbar max-h-[58vh] overflow-auto whitespace-pre-wrap text-sm leading-7 text-[var(--studio-text-secondary)]">{script || "本集还没有确认稿。"}</pre></Panel>;
    if (!selected && ["assets", "storyboard", "video", "delivery"].includes(stage)) return <Empty className="py-20" description="完成分镜提示词阶段后，生产包会出现在这里" />;
    if (selected) return <div className="space-y-3"><Panel icon={<Film className="size-4" />} title={`${selected.id} · ${selected.segment}`} description={`场次 ${selected.sceneKey} · ${selected.duration}`}><p className="text-sm leading-7 text-[var(--studio-text-secondary)]">{selected.prompt}</p></Panel><Panel icon={<ImageIcon className="size-4" />} title="参考资产" description={`${selected.assets.filter((item) => item.status === "已绑定").length}/${selected.assets.length} 已匹配`}><div className="grid gap-2 sm:grid-cols-2">{selected.assets.map((asset) => <div key={`${asset.kind}:${asset.name}`} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] px-3 py-2 text-xs"><span className="text-[var(--studio-text-muted)]">{asset.kind}</span><div className="mt-1 truncate">{asset.name}</div></div>)}</div></Panel></div>;
    return <Panel icon={<ServerCog className="size-4" />} title="云端阶段工作区" description="启动、审核和质量门操作将在这里完成。"><div className="grid min-h-56 place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] text-sm text-[var(--studio-text-muted)]">等待阶段就绪</div></Panel>;
}

function Panel({ children, description, icon, title }: { children: React.ReactNode; description: string; icon: React.ReactNode; title: string }) { return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]"><div className="mb-4 flex items-start gap-2"><span className="mt-0.5 text-[var(--studio-accent)]">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">{description}</p></div></div>{children}</section>; }
function StageBadge({ status }: { status: string }) { const blocked = ["blocked", "failed", "rejected"].includes(status); const done = ["approved", "applied", "complete"].includes(status); return <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", blocked ? "border-[var(--studio-warning)] text-[var(--studio-warning)]" : done ? "border-[var(--studio-success)] text-[var(--studio-success)]" : "border-[var(--studio-border-subtle)] text-[var(--studio-text-secondary)]")}>{blocked ? <CircleAlert className="size-3" /> : done ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}{status}</span>; }
function PackageStatus({ item }: { item: NonNullable<ReturnType<typeof useWorkflowWorkbench>["selectedPackage"]> }) { const blocked = item.assetStatus !== "完整" || item.risks.some((risk) => risk.level === "阻断"); return blocked ? <CircleAlert className="size-3.5 text-[var(--studio-warning)]" /> : item.generation?.status === "succeeded" ? <CheckCircle2 className="size-3.5 text-[var(--studio-success)]" /> : <span className="text-[10px] text-[var(--studio-text-muted)]">{item.promptStatus}</span>; }
function ConsoleMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-[var(--studio-panel-muted-bg)] px-2 py-2"><div className="text-[10px] text-[var(--studio-text-muted)]">{label}</div><div className="mt-1 font-medium tabular-nums">{value}</div></div>; }
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><span className="text-[var(--studio-text-muted)]">{label}</span><span className="truncate text-right">{value}</span></div>; }
