"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, App, Button, Drawer, Empty, Spin } from "antd";
import { CheckCircle2, CircleAlert, Clock3, FileText, List, PanelRight, ServerCog, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { getImageBlob } from "@/services/image-storage";
import { createWorkflowMediaBatch, deleteWorkflowMediaBatch, uploadWorkflowMedia } from "@/services/api/workflow-runs";
import { useAssetStore } from "@/stores/use-asset-store";

import { WorkflowHeader } from "./components/workflow-header";
import { WorkflowAssetPanel } from "./components/workflow-asset-panel";
import { WorkflowDeliveryPanel } from "./components/workflow-delivery-panel";
import { WorkflowRunConsole } from "./components/workflow-run-console";
import { WorkflowReferenceImagePanel } from "./components/workflow-reference-image-panel";
import { WorkflowShotEditor } from "./components/workflow-shot-editor";
import { WorkflowShotQueue } from "./components/workflow-shot-queue";
import { WorkflowStagePanel } from "./components/workflow-stage-panel";
import { WorkflowStageRail } from "./components/workflow-stage-rail";
import { WorkflowStoryboardSync } from "./components/workflow-storyboard-sync";
import { WorkflowVideoConsole } from "./components/workflow-video-console";
import { useWorkflowWorkbench } from "./use-workflow-workbench";
import { useWorkflowStageActions } from "./use-workflow-stage-actions";
import { useWorkflowVideoActions } from "./use-workflow-video-actions";
import { workflowReferenceBlob, workflowReferenceImages } from "./workflow-reference-images";

export default function EpisodeWorkflowPage() {
    const params = useParams<{ episodeId: string; id: string }>();
    const { modal } = App.useApp();
    const { message } = App.useApp();
    const [queueOpen, setQueueOpen] = useState(false);
    const [consoleOpen, setConsoleOpen] = useState(false);
    const [preparingStage, setPreparingStage] = useState(false);
    const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
    const assets = useAssetStore((state) => state.assets);
    const workbench = useWorkflowWorkbench(params.id, params.episodeId);
    const remoteStageId = workbench.routeState.stage === "art" || workbench.routeState.stage === "assets" ? "art-design" : workbench.routeState.stage === "storyboard" ? "seedance-storyboard" : "";
    const stageActions = useWorkflowStageActions({ detail: workbench.detail, refresh: workbench.refreshRemote, stageId: remoteStageId });
    const videoActions = useWorkflowVideoActions(workbench.packages);
    const referenceImages = useMemo(() => workflowReferenceImages(assets, params.id, params.episodeId), [assets, params.episodeId, params.id]);
    useEffect(() => {
        setSelectedReferenceIds((current) => (current.length ? current.filter((id) => referenceImages.some((item) => item.id === id)) : referenceImages.map((item) => item.id)));
    }, [referenceImages]);

    if (!workbench.isHydrated) {
        return (
            <main className="studio-shell grid h-full place-items-center">
                <Spin description="正在读取本集生产资料" />
            </main>
        );
    }
    if (!workbench.project || !workbench.episode) {
        return (
            <main className="studio-shell grid h-full place-items-center px-6">
                <Empty description="项目或集数不存在">
                    <Button href={workbench.project ? `/projects/${workbench.project.id}` : "/projects"}>返回项目</Button>
                </Empty>
            </main>
        );
    }

    const activeStage = workbench.stageViews.find((stage) => stage.key === workbench.routeState.stage) || workbench.stageViews[0];
    const currentAgentRun = workbench.detail?.agentRuns.find((item) => item.id === stageActions.stage?.agentRunId) || null;
    const executorLabel = workbench.health?.executorLabel || "工作流执行器";

    const startCurrentStage = async () => {
        if (!stageActions.start || preparingStage) return;
        const selectedReferences = referenceImages.filter((item) => selectedReferenceIds.includes(item.id));
        if (workbench.routeState.stage !== "storyboard" || !selectedReferences.length || !workbench.detail) {
            await stageActions.start();
            return;
        }
        setPreparingStage(true);
        let batchId = "";
        try {
            const detail = await createWorkflowMediaBatch(workbench.detail.run.id, remoteStageId, stageActions.startKey);
            batchId = detail.batch.id;
            for (const [order, reference] of selectedReferences.entries()) {
                const file = await workflowReferenceBlob(reference, getImageBlob);
                const extension = ({ "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[file.type] || "png";
                await uploadWorkflowMedia(batchId, { assetId: reference.id, file, filename: `${reference.id}.${extension}`, kind: reference.kind, label: reference.label, order, version: reference.version });
            }
            const started = await stageActions.start(batchId);
            if (!started) await deleteWorkflowMediaBatch(batchId);
        } catch (error) {
            if (batchId) await deleteWorkflowMediaBatch(batchId).catch(() => undefined);
            message.error(error instanceof Error ? error.message : "参考图准备失败，请重试");
        } finally {
            setPreparingStage(false);
        }
    };

    const confirmStageStart = () => {
        const selectedCount = workbench.routeState.stage === "storyboard" ? selectedReferenceIds.length : 0;
        const local = workbench.health?.executor === "codex-cli";
        modal.confirm({
            title: `启动${activeStage.label}？`,
            content: selectedCount
                ? `将冻结并理解 ${selectedCount} 张参考图，再生成提示词。${local ? "本地 Codex 验证不扣应用算力点。" : "线上多模态 API 将按实际模型计费。"}`
                : `${workbench.routeState.stage === "storyboard" ? "当前未选择参考图，将明确降级为纯文本生成。" : "任务将进入持久化执行队列。"}${local ? "本地 Codex 验证不扣应用算力点。" : `当前预估：${stageActions.stage?.estimatedCredits || "由任务创建时计算"}。`}`,
            okText: selectedCount ? "确认并上传参考图" : "确认启动",
            cancelText: "取消",
            onOk: startCurrentStage,
        });
    };

    return (
        <main className="studio-shell flex h-full min-w-0 flex-col overflow-hidden text-[var(--studio-text-primary)]">
            <WorkflowHeader
                blockerCount={workbench.blockerCount}
                episodeTitle={`第 ${String(workbench.episode.order).padStart(2, "0")} 集 · ${workbench.episode.title}`}
                loading={workbench.remoteLoading}
                modelSummary={`${executorLabel} · ${workbench.modelSummary}`}
                onContinue={workbench.continueNext}
                onRefresh={workbench.refreshRemote}
                progress={workbench.progress}
                projectId={workbench.project.id}
                projectTitle={workbench.project.title}
                workerReady={Boolean(workbench.health?.ready)}
            />
            {workbench.remoteError ? <Alert className="mx-5 mt-3 shrink-0 xl:mx-7" showIcon closable type="warning" title="运行状态暂不可用" description={`${workbench.remoteError}。本地剧本、资产和视频生产包仍可继续查看。`} /> : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[168px_252px_minmax(420px,1fr)_320px]">
                <WorkflowStageRail active={workbench.routeState.stage} onSelect={workbench.selectRoute} stages={workbench.stageViews} />

                <WorkflowShotQueue packages={workbench.packages} selectedId={workbench.selectedPackage?.id || ""} onSelect={(shot) => workbench.selectRoute(workbench.routeState.stage, shot)} />

                <section className="thin-scrollbar min-h-0 overflow-y-auto bg-[var(--studio-workspace-bg)] px-4 py-4 xl:px-5">
                    <div className="mx-auto max-w-4xl">
                        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 xl:hidden">
                            {workbench.stageViews.map((stage) => (
                                <button
                                    key={stage.key}
                                    type="button"
                                    className={cn(
                                        "h-9 shrink-0 rounded-md border px-3 text-xs",
                                        stage.key === workbench.routeState.stage ? "border-[var(--studio-accent)] bg-[var(--studio-active-bg)] text-[var(--studio-text-primary)]" : "border-[var(--studio-border-subtle)] text-[var(--studio-text-secondary)]",
                                    )}
                                    onClick={() => workbench.selectRoute(stage.key)}
                                >
                                    {stage.label}
                                </button>
                            ))}
                        </div>
                        <div className="mb-3 flex gap-2 xl:hidden">
                            <Button className="min-h-11 flex-1" icon={<List className="size-4" />} onClick={() => setQueueOpen(true)}>
                                分镜队列
                            </Button>
                            <Button className="min-h-11 flex-1" icon={<PanelRight className="size-4" />} onClick={() => setConsoleOpen(true)}>
                                结果与运行
                            </Button>
                        </div>
                        <div className="mb-4 flex items-start justify-between gap-4 border-b border-[var(--studio-border-subtle)] pb-4">
                            <div>
                                <div className="text-xs font-medium text-[var(--studio-accent)]">当前工作区</div>
                                <h2 className="mt-1 text-xl font-semibold">{activeStage.label}</h2>
                                <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">{activeStage.description}</p>
                            </div>
                            <StageBadge status={activeStage.status} />
                        </div>
                        <StageWorkspace
                            stage={workbench.routeState.stage}
                            script={workbench.scriptSnapshot}
                            selected={workbench.selectedPackage}
                            stageActions={stageActions}
                            executorLabel={executorLabel}
                            preparingStage={preparingStage}
                            referenceImages={referenceImages}
                            selectedReferenceIds={selectedReferenceIds}
                            onReferenceChange={setSelectedReferenceIds}
                            workerReady={Boolean(workbench.health?.ready)}
                            onConfirmStart={confirmStageStart}
                            onConfirmReject={() => modal.confirm({ title: "退回当前产物？", content: "退回后需要重新生成并再次通过质量门，不会覆盖已经批准的其他阶段。", okText: "确认退回", cancelText: "取消", onOk: stageActions.reject })}
                            projectId={workbench.project.id}
                            projectTitle={workbench.project.title}
                            episodeId={workbench.episode.id}
                            onApplied={workbench.refreshRemote}
                            packages={workbench.packages}
                            onSelectShot={(shot) => workbench.selectRoute(workbench.routeState.stage, shot)}
                            videoActions={videoActions}
                        />
                    </div>
                </section>

                {workbench.routeState.stage === "video" || workbench.routeState.stage === "delivery" ? (
                    <WorkflowVideoConsole actions={videoActions} item={workbench.selectedPackage} />
                ) : (
                    <WorkflowRunConsole agentRun={currentAgentRun} events={workbench.events} health={workbench.health} stage={stageActions.stage} />
                )}
            </div>
            <Drawer title="分镜队列" placement="left" width={340} open={queueOpen} onClose={() => setQueueOpen(false)} styles={{ body: { padding: 0, overflow: "hidden" } }}>
                <div className="h-full [&>aside]:!flex [&>aside]:h-full">
                    <WorkflowShotQueue
                        packages={workbench.packages}
                        selectedId={workbench.selectedPackage?.id || ""}
                        onSelect={(shot) => {
                            workbench.selectRoute(workbench.routeState.stage, shot);
                            setQueueOpen(false);
                        }}
                    />
                </div>
            </Drawer>
            <Drawer title="结果与运行" placement="right" width={360} open={consoleOpen} onClose={() => setConsoleOpen(false)} styles={{ body: { padding: 0, overflow: "hidden" } }}>
                <div className="h-full [&>aside]:!flex [&>aside]:h-full">
                    {workbench.routeState.stage === "video" || workbench.routeState.stage === "delivery" ? (
                        <WorkflowVideoConsole actions={videoActions} item={workbench.selectedPackage} />
                    ) : (
                        <WorkflowRunConsole agentRun={currentAgentRun} events={workbench.events} health={workbench.health} stage={stageActions.stage} />
                    )}
                </div>
            </Drawer>
        </main>
    );
}

function StageWorkspace({
    episodeId,
    executorLabel,
    onApplied,
    onConfirmReject,
    onConfirmStart,
    onReferenceChange,
    onSelectShot,
    packages,
    preparingStage,
    projectId,
    projectTitle,
    referenceImages,
    script,
    selected,
    selectedReferenceIds,
    stage,
    stageActions,
    workerReady,
    videoActions,
}: {
    episodeId: string;
    executorLabel: string;
    onApplied: () => void | Promise<void>;
    onConfirmReject: () => void;
    onConfirmStart: () => void;
    onReferenceChange: (ids: string[]) => void;
    onSelectShot: (shot: string) => void;
    packages: ReturnType<typeof useWorkflowWorkbench>["packages"];
    preparingStage: boolean;
    projectId: string;
    projectTitle: string;
    referenceImages: ReturnType<typeof workflowReferenceImages>;
    script: string;
    selected: ReturnType<typeof useWorkflowWorkbench>["selectedPackage"];
    selectedReferenceIds: string[];
    stage: string;
    stageActions: ReturnType<typeof useWorkflowStageActions>;
    workerReady: boolean;
    videoActions: ReturnType<typeof useWorkflowVideoActions>;
}) {
    if (stage === "script")
        return (
            <Panel icon={<FileText className="size-4" />} title="本集确认稿" description="云端阶段将使用这份不可变快照，不会再次自动改写。">
                <pre className="thin-scrollbar max-h-[58vh] overflow-auto whitespace-pre-wrap text-sm leading-7 text-[var(--studio-text-secondary)]">{script || "本集还没有确认稿。"}</pre>
            </Panel>
        );
    if (stage === "art") return <WorkflowStagePanel executorLabel={executorLabel} label="导演与美术" preparing={preparingStage} state={stageActions} workerReady={workerReady} onConfirmStart={onConfirmStart} onConfirmReject={onConfirmReject} />;
    if (stage === "assets") return <WorkflowAssetPanel artifact={stageActions.artifact} episodeId={episodeId} onApplied={onApplied} projectId={projectId} projectTitle={projectTitle} stage={stageActions.stage} />;
    if (stage === "storyboard")
        return (
            <div className="space-y-3">
                <WorkflowReferenceImagePanel images={referenceImages} selectedIds={selectedReferenceIds} onChange={onReferenceChange} />
                <WorkflowStagePanel executorLabel={executorLabel} label="分镜提示词" preparing={preparingStage} state={stageActions} workerReady={workerReady} onConfirmStart={onConfirmStart} onConfirmReject={onConfirmReject} />
                {stageActions.artifact && stageActions.stage && ["approved", "applied"].includes(stageActions.stage.status) ? (
                    <WorkflowStoryboardSync artifact={stageActions.artifact} episodeId={episodeId} onApplied={onApplied} projectId={projectId} stage={stageActions.stage} />
                ) : null}
            </div>
        );
    if (stage === "delivery") return <WorkflowDeliveryPanel packages={packages} />;
    if (stage === "video" && !selected)
        return (
            <Panel icon={<ShieldCheck className="size-4" />} title="企业视频通道预检" description="生产包尚未生成，也可以先验证上线通道、模型和端点；预检不会创建视频任务，也不扣费。">
                <div className="grid min-h-52 place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] px-5 text-center">
                    <div className="max-w-md">
                        <p className="text-sm leading-6 text-[var(--studio-text-secondary)]">先完成这一步，可以提前排除密钥、模型或企业端点配置问题。正式生成仍会在每条分镜上再次预检并要求二次确认。</p>
                        <Button className="mt-4" icon={<ShieldCheck className="size-4" />} loading={videoActions.channelPreflighting} onClick={() => void videoActions.preflightChannel()}>
                            通道预检（不扣费）
                        </Button>
                        {videoActions.channelPreflight ? (
                            <div className={`mt-4 rounded-md border px-3 py-2 text-left text-xs leading-5 ${videoActions.channelPreflight.status === "passed" ? "border-[var(--studio-success)]/40 text-[var(--studio-success)]" : "border-[var(--studio-danger)]/40 text-[var(--studio-danger)]"}`}>
                                {videoActions.channelPreflight.message}
                            </div>
                        ) : null}
                    </div>
                </div>
            </Panel>
        );
    if (!selected && ["assets", "storyboard", "video", "delivery"].includes(stage)) return <Empty className="py-20" description="完成分镜提示词阶段后，生产包会出现在这里" />;
    if (selected) return <WorkflowShotEditor item={selected} onSelect={onSelectShot} packages={packages} />;
    return (
        <Panel icon={<ServerCog className="size-4" />} title="云端阶段工作区" description="启动、审核和质量门操作将在这里完成。">
            <div className="grid min-h-56 place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] text-sm text-[var(--studio-text-muted)]">等待阶段就绪</div>
        </Panel>
    );
}

function Panel({ children, description, icon, title }: { children: React.ReactNode; description: string; icon: React.ReactNode; title: string }) {
    return (
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
            <div className="mb-4 flex items-start gap-2">
                <span className="mt-0.5 text-[var(--studio-accent)]">{icon}</span>
                <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-xs text-[var(--studio-text-muted)]">{description}</p>
                </div>
            </div>
            {children}
        </section>
    );
}
function StageBadge({ status }: { status: string }) {
    const blocked = ["blocked", "failed", "rejected"].includes(status);
    const done = ["approved", "applied", "complete"].includes(status);
    const labels: Record<string, string> = { approved: "已批准", applied: "已应用", blocked: "被阻断", cancel_requested: "停止中", cancelled: "已停止", complete: "已完成", failed: "失败", idle: "未开始", needs_review: "待审核", queued: "排队中", ready: "可开始", rejected: "已退回", review: "待审核", running: "运行中" };
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                blocked ? "border-[var(--studio-warning)] text-[var(--studio-warning)]" : done ? "border-[var(--studio-success)] text-[var(--studio-success)]" : "border-[var(--studio-border-subtle)] text-[var(--studio-text-secondary)]",
            )}
        >
            {blocked ? <CircleAlert className="size-3" /> : done ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}
            {labels[status] || status}
        </span>
    );
}
