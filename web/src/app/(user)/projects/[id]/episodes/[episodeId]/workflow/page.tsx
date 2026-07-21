"use client";

import { useParams } from "next/navigation";
import { Alert, App, Button, Empty, Spin } from "antd";
import { CheckCircle2, CircleAlert, Clock3, FileText, Film, ImageIcon, ListFilter, Search, ServerCog } from "lucide-react";

import { cn } from "@/lib/utils";

import { WorkflowHeader } from "./components/workflow-header";
import { WorkflowRunConsole } from "./components/workflow-run-console";
import { WorkflowStagePanel } from "./components/workflow-stage-panel";
import { WorkflowStageRail } from "./components/workflow-stage-rail";
import { useWorkflowWorkbench } from "./use-workflow-workbench";
import { useWorkflowStageActions } from "./use-workflow-stage-actions";

export default function EpisodeWorkflowPage() {
    const params = useParams<{ episodeId: string; id: string }>();
    const { modal } = App.useApp();
    const workbench = useWorkflowWorkbench(params.id, params.episodeId);
    const remoteStageId = workbench.routeState.stage === "art" ? "art-design" : workbench.routeState.stage === "storyboard" ? "seedance-storyboard" : "";
    const stageActions = useWorkflowStageActions({ detail: workbench.detail, refresh: workbench.refreshRemote, stageId: remoteStageId });

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
                        <StageWorkspace
                            stage={workbench.routeState.stage}
                            script={workbench.scriptSnapshot}
                            selected={workbench.selectedPackage}
                            stageActions={stageActions}
                            workerReady={Boolean(workbench.health?.ready)}
                            onConfirmStart={() => modal.confirm({ title: `启动${activeStage.label}？`, content: `任务进入云端队列后会按实际模型预扣算力点。当前预估：${stageActions.stage?.estimatedCredits || "由任务创建时计算"}。`, okText: "确认启动", cancelText: "取消", onOk: stageActions.start })}
                            onConfirmReject={() => modal.confirm({ title: "退回当前产物？", content: "退回后需要重新生成并再次通过质量门，不会覆盖已经批准的其他阶段。", okText: "确认退回", cancelText: "取消", onOk: stageActions.reject })}
                        />
                    </div>
                </section>

                <WorkflowRunConsole events={workbench.events} health={workbench.health} stage={stageActions.stage} />
            </div>
        </main>
    );
}

function StageWorkspace({ onConfirmReject, onConfirmStart, script, selected, stage, stageActions, workerReady }: { onConfirmReject: () => void; onConfirmStart: () => void; script: string; selected: ReturnType<typeof useWorkflowWorkbench>["selectedPackage"]; stage: string; stageActions: ReturnType<typeof useWorkflowStageActions>; workerReady: boolean }) {
    if (stage === "script") return <Panel icon={<FileText className="size-4" />} title="本集确认稿" description="云端阶段将使用这份不可变快照，不会再次自动改写。"><pre className="thin-scrollbar max-h-[58vh] overflow-auto whitespace-pre-wrap text-sm leading-7 text-[var(--studio-text-secondary)]">{script || "本集还没有确认稿。"}</pre></Panel>;
    if (stage === "art" || stage === "storyboard") return <WorkflowStagePanel label={stage === "art" ? "导演与美术" : "分镜提示词"} state={stageActions} workerReady={workerReady} onConfirmStart={onConfirmStart} onConfirmReject={onConfirmReject} />;
    if (!selected && ["assets", "storyboard", "video", "delivery"].includes(stage)) return <Empty className="py-20" description="完成分镜提示词阶段后，生产包会出现在这里" />;
    if (selected) return <div className="space-y-3"><Panel icon={<Film className="size-4" />} title={`${selected.id} · ${selected.segment}`} description={`场次 ${selected.sceneKey} · ${selected.duration}`}><p className="text-sm leading-7 text-[var(--studio-text-secondary)]">{selected.prompt}</p></Panel><Panel icon={<ImageIcon className="size-4" />} title="参考资产" description={`${selected.assets.filter((item) => item.status === "已绑定").length}/${selected.assets.length} 已匹配`}><div className="grid gap-2 sm:grid-cols-2">{selected.assets.map((asset) => <div key={`${asset.kind}:${asset.name}`} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] px-3 py-2 text-xs"><span className="text-[var(--studio-text-muted)]">{asset.kind}</span><div className="mt-1 truncate">{asset.name}</div></div>)}</div></Panel></div>;
    return <Panel icon={<ServerCog className="size-4" />} title="云端阶段工作区" description="启动、审核和质量门操作将在这里完成。"><div className="grid min-h-56 place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] text-sm text-[var(--studio-text-muted)]">等待阶段就绪</div></Panel>;
}

function Panel({ children, description, icon, title }: { children: React.ReactNode; description: string; icon: React.ReactNode; title: string }) { return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]"><div className="mb-4 flex items-start gap-2"><span className="mt-0.5 text-[var(--studio-accent)]">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">{description}</p></div></div>{children}</section>; }
function StageBadge({ status }: { status: string }) { const blocked = ["blocked", "failed", "rejected"].includes(status); const done = ["approved", "applied", "complete"].includes(status); return <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", blocked ? "border-[var(--studio-warning)] text-[var(--studio-warning)]" : done ? "border-[var(--studio-success)] text-[var(--studio-success)]" : "border-[var(--studio-border-subtle)] text-[var(--studio-text-secondary)]")}>{blocked ? <CircleAlert className="size-3" /> : done ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}{status}</span>; }
function PackageStatus({ item }: { item: NonNullable<ReturnType<typeof useWorkflowWorkbench>["selectedPackage"]> }) { const blocked = item.assetStatus !== "完整" || item.risks.some((risk) => risk.level === "阻断"); return blocked ? <CircleAlert className="size-3.5 text-[var(--studio-warning)]" /> : item.generation?.status === "succeeded" ? <CheckCircle2 className="size-3.5 text-[var(--studio-success)]" /> : <span className="text-[10px] text-[var(--studio-text-muted)]">{item.promptStatus}</span>; }
