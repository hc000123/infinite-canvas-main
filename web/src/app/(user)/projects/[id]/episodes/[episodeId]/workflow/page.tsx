"use client";

import { useParams } from "next/navigation";
import { Alert, App, Button, Empty, Spin } from "antd";
import { CheckCircle2, CircleAlert, Clock3, FileText, ServerCog } from "lucide-react";

import { cn } from "@/lib/utils";

import { WorkflowHeader } from "./components/workflow-header";
import { WorkflowAssetPanel } from "./components/workflow-asset-panel";
import { WorkflowRunConsole } from "./components/workflow-run-console";
import { WorkflowShotEditor } from "./components/workflow-shot-editor";
import { WorkflowShotQueue } from "./components/workflow-shot-queue";
import { WorkflowStagePanel } from "./components/workflow-stage-panel";
import { WorkflowStageRail } from "./components/workflow-stage-rail";
import { WorkflowStoryboardSync } from "./components/workflow-storyboard-sync";
import { useWorkflowWorkbench } from "./use-workflow-workbench";
import { useWorkflowStageActions } from "./use-workflow-stage-actions";

export default function EpisodeWorkflowPage() {
    const params = useParams<{ episodeId: string; id: string }>();
    const { modal } = App.useApp();
    const workbench = useWorkflowWorkbench(params.id, params.episodeId);
    const remoteStageId = workbench.routeState.stage === "art" || workbench.routeState.stage === "assets" ? "art-design" : workbench.routeState.stage === "storyboard" ? "seedance-storyboard" : "";
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

                <WorkflowShotQueue packages={workbench.packages} selectedId={workbench.selectedPackage?.id || ""} onSelect={(shot) => workbench.selectRoute(workbench.routeState.stage, shot)} />

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
                            projectId={workbench.project.id}
                            projectTitle={workbench.project.title}
                            episodeId={workbench.episode.id}
                            onApplied={workbench.refreshRemote}
                            packages={workbench.packages}
                            onSelectShot={(shot) => workbench.selectRoute(workbench.routeState.stage, shot)}
                        />
                    </div>
                </section>

                <WorkflowRunConsole events={workbench.events} health={workbench.health} stage={stageActions.stage} />
            </div>
        </main>
    );
}

function StageWorkspace({ episodeId, onApplied, onConfirmReject, onConfirmStart, onSelectShot, packages, projectId, projectTitle, script, selected, stage, stageActions, workerReady }: { episodeId: string; onApplied: () => void | Promise<void>; onConfirmReject: () => void; onConfirmStart: () => void; onSelectShot: (shot: string) => void; packages: ReturnType<typeof useWorkflowWorkbench>["packages"]; projectId: string; projectTitle: string; script: string; selected: ReturnType<typeof useWorkflowWorkbench>["selectedPackage"]; stage: string; stageActions: ReturnType<typeof useWorkflowStageActions>; workerReady: boolean }) {
    if (stage === "script") return <Panel icon={<FileText className="size-4" />} title="本集确认稿" description="云端阶段将使用这份不可变快照，不会再次自动改写。"><pre className="thin-scrollbar max-h-[58vh] overflow-auto whitespace-pre-wrap text-sm leading-7 text-[var(--studio-text-secondary)]">{script || "本集还没有确认稿。"}</pre></Panel>;
    if (stage === "art") return <WorkflowStagePanel label="导演与美术" state={stageActions} workerReady={workerReady} onConfirmStart={onConfirmStart} onConfirmReject={onConfirmReject} />;
    if (stage === "assets") return <WorkflowAssetPanel artifact={stageActions.artifact} episodeId={episodeId} onApplied={onApplied} projectId={projectId} projectTitle={projectTitle} stage={stageActions.stage} />;
    if (stage === "storyboard") return <div className="space-y-3"><WorkflowStagePanel label="分镜提示词" state={stageActions} workerReady={workerReady} onConfirmStart={onConfirmStart} onConfirmReject={onConfirmReject} />{stageActions.artifact && stageActions.stage && ["approved", "applied"].includes(stageActions.stage.status) ? <WorkflowStoryboardSync artifact={stageActions.artifact} episodeId={episodeId} onApplied={onApplied} projectId={projectId} stage={stageActions.stage} /> : null}</div>;
    if (!selected && ["assets", "storyboard", "video", "delivery"].includes(stage)) return <Empty className="py-20" description="完成分镜提示词阶段后，生产包会出现在这里" />;
    if (selected) return <WorkflowShotEditor item={selected} onSelect={onSelectShot} packages={packages} />;
    return <Panel icon={<ServerCog className="size-4" />} title="云端阶段工作区" description="启动、审核和质量门操作将在这里完成。"><div className="grid min-h-56 place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] text-sm text-[var(--studio-text-muted)]">等待阶段就绪</div></Panel>;
}

function Panel({ children, description, icon, title }: { children: React.ReactNode; description: string; icon: React.ReactNode; title: string }) { return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]"><div className="mb-4 flex items-start gap-2"><span className="mt-0.5 text-[var(--studio-accent)]">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">{description}</p></div></div>{children}</section>; }
function StageBadge({ status }: { status: string }) { const blocked = ["blocked", "failed", "rejected"].includes(status); const done = ["approved", "applied", "complete"].includes(status); return <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", blocked ? "border-[var(--studio-warning)] text-[var(--studio-warning)]" : done ? "border-[var(--studio-success)] text-[var(--studio-success)]" : "border-[var(--studio-border-subtle)] text-[var(--studio-text-secondary)]")}>{blocked ? <CircleAlert className="size-3" /> : done ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}{status}</span>; }
