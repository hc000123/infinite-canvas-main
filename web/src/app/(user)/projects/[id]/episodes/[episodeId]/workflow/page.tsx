"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { App, Button, Empty, Progress, Spin, Tag } from "antd";
import { ArrowLeft, Clapperboard, FileText, PanelTop, Workflow } from "lucide-react";

import { useCanvasStore } from "../../../../../canvas/stores/use-canvas-store";
import { useScriptStore } from "../../../../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../../../../canvas/stores/use-storyboard-store";
import { buildEpisodeScriptSnapshot } from "../../../../../canvas/utils/canvas-episode-context";
import { orderedScriptScenes } from "../../../../../canvas/utils/script-management";
import { orderedStoryboardTableShots } from "../../../../../canvas/utils/storyboard-management";
import { buildSeedanceWorkflowPreset, sortedWorkflowStages, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import { summarizeWorkflowRunDisplayState, summarizeWorkflowStageDisplayState, workflowStageDisplayName, workflowStageStatusLabel, type AgentWorkflowDisplayStatus } from "../../../../agent-runner-workflow-display";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import { useAgentRunnerStore } from "../../../../use-agent-runner-store";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";
import { latestPreview, previewActionLabel, previewApplyDisabledReason, previewCounts } from "../workbench/episode-workbench-display";
import { findEpisodeWorkflowRun } from "../workflow-run-selection";

export default function EpisodeWorkflowLandingPage() {
    const params = useParams<{ id: string; episodeId: string }>();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { message, modal } = App.useApp();
    const projectId = params.id;
    const episodeId = params.episodeId;
    const [applyingPreviewIds, setApplyingPreviewIds] = useState<Record<string, boolean>>({});
    const requestedCanvasId = searchParams.get("canvasId") || "";
    const projectHydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
    const episode = useScriptStore((state) => state.episodes.find((item) => item.id === episodeId && item.projectId === projectId));
    const scenes = useScriptStore((state) => state.scenes);
    const canvases = useCanvasStore((state) => state.projects);
    const storyboardTableShots = useStoryboardStore((state) => state.tableShots);
    const workflowRuns = useAgentRunnerStore((state) => state.workflowRuns);
    const workflowOutputs = useAgentRunnerStore((state) => state.workflowOutputs);
    const workflowMappingPreviews = useAgentRunnerStore((state) => state.workflowMappingPreviews);
    const workflowAppliedPreviewItemIds = useAgentRunnerStore((state) => state.workflowAppliedPreviewItemIds);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const generateWorkflowMappingPreview = useAgentRunnerStore((state) => state.generateWorkflowMappingPreview);
    const applyProductionBiblePreview = useAgentRunnerStore((state) => state.applyProductionBiblePreview);
    const applyStoryboardPreview = useAgentRunnerStore((state) => state.applyStoryboardPreview);
    const applyVideoNodePreview = useAgentRunnerStore((state) => state.applyVideoNodePreview);
    const preset = useMemo(() => buildSeedanceWorkflowPreset(), []);
    const stages = useMemo(() => sortedWorkflowStages(preset), [preset]);
    const stageSceneRows = useMemo(() => orderedScriptScenes(scenes, episodeId), [episodeId, scenes]);
    const scriptSnapshot = useMemo(() => (episode ? buildEpisodeScriptSnapshot(episode, stageSceneRows) : ""), [episode, stageSceneRows]);
    const requestedCanvas = useMemo(() => canvases.find((canvas) => canvas.id === requestedCanvasId && canvas.projectId === projectId && canvas.episodeId === episodeId), [canvases, episodeId, projectId, requestedCanvasId]);
    const boundCanvas = useMemo(() => requestedCanvas || canvases.find((canvas) => canvas.projectId === projectId && canvas.episodeId === episodeId), [canvases, episodeId, projectId, requestedCanvas]);
    const episodeTableShots = useMemo(() => (boundCanvas ? orderedStoryboardTableShots(storyboardTableShots, boundCanvas.id, episodeId) : []), [boundCanvas, episodeId, storyboardTableShots]);
    const workflowRun = useMemo(() => findEpisodeWorkflowRun({ canvasId: boundCanvas?.id, episodeId, projectId, workflowId: preset.workflowId, workflowRuns }), [boundCanvas?.id, episodeId, preset.workflowId, projectId, workflowRuns]);
    const previews = useMemo(() => (workflowRun ? workflowMappingPreviews.filter((preview) => preview.workflowRunId === workflowRun.id) : []), [workflowMappingPreviews, workflowRun]);
    const productionBiblePreview = latestPreview(previews, "production_bible");
    const storyboardPreview = latestPreview(previews, "storyboard_table");
    const videoPreview = latestPreview(previews, "video_node");
    const sceneKeys = useMemo(() => buildExpectedSceneKeys(episodeTableShots, stageSceneRows), [episodeTableShots, stageSceneRows]);
    const stageDisplays = useMemo(() => stages.map((stage) => (workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, stage.stageId, stage.stageId === "seedance-storyboard" ? sceneKeys : []) : undefined)), [sceneKeys, stages, workflowRun]);
    const runDisplay = useMemo(() => (workflowRun ? summarizeWorkflowRunDisplayState(workflowRun, { "seedance-storyboard": sceneKeys }) : undefined), [sceneKeys, workflowRun]);
    const artStageOutput = stageOutput(workflowRun, workflowOutputs, "art-design");
    const storyboardStageOutput = stageOutput(workflowRun, workflowOutputs, "seedance-storyboard");
    const artDisplay = stageDisplays.find((display) => display?.stageId === "art-design");
    const storyboardDisplay = stageDisplays.find((display) => display?.stageId === "seedance-storyboard");
    const approvedStageCount = stageDisplays.filter((display) => display?.displayStatus === "approved").length;
    const progress = stages.length ? Math.round((approvedStageCount / stages.length) * 100) : 0;

    useEffect(() => {
        if (!project || !episode) return;
        ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
    }, [boundCanvas?.id, ensureWorkflowRun, episode, episodeId, preset, project, projectId]);

    const generatePreview = (stageId: string, label: string) => {
        if (!workflowRun) {
            message.warning("当前还没有可用的 workflow run");
            return;
        }
        const result = generateWorkflowMappingPreview(workflowRun.id, stageId);
        if (!result.ok) message.warning(result.reason || "当前阶段不能生成映射预览");
        else message.success(`已生成${label}`);
    };

    const applyPreview = (preview: AgentWorkflowMappingPreview) => {
        const counts = previewCounts(preview, workflowAppliedPreviewItemIds);
        const disabledReason = previewApplyDisabledReason(preview, counts.pending, Boolean(boundCanvas));
        if (disabledReason) {
            message.warning(disabledReason);
            return;
        }
        modal.confirm({
            title: previewActionLabel(preview.targetType),
            content: `将处理 ${counts.pending} 条待落地内容。该操作不会自动生成图片或视频，不会触发扣费。`,
            okText: "确认执行",
            cancelText: "取消",
            onOk: () => {
                setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: true }));
                try {
                    const result =
                        preview.targetType === "production_bible"
                            ? applyProductionBiblePreview(preview.previewId)
                            : preview.targetType === "storyboard_table"
                              ? applyStoryboardPreview(preview.previewId)
                              : applyVideoNodePreview(preview.previewId, { existingNodes: boundCanvas?.nodes || [] });
                    if (!result.ok) {
                        message.warning(result.reason || "当前预览不能写入");
                        return;
                    }
                    message.success(`${previewActionLabel(preview.targetType)} ${result.appliedCount || 0} 条`);
                    if (result.warnings.length) message.info(result.warnings.join("；"));
                } finally {
                    setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: false }));
                }
            },
        });
    };

    if (!projectHydrated || !scriptsHydrated) {
        return (
            <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]">
                <Spin description="正在读取本地项目" />
            </main>
        );
    }

    if (!project || !episode) {
        return (
            <main className="studio-shell h-full overflow-auto px-6 py-10 text-[var(--studio-text-primary)]">
                <div className="mx-auto max-w-3xl">
                    <Empty description="项目或集数不存在">
                        <Button href={project ? `/projects/${project.id}` : "/projects"}>返回项目</Button>
                    </Empty>
                </div>
            </main>
        );
    }

    return (
        <main className="studio-shell h-full overflow-auto text-[var(--studio-text-primary)]">
            <header className="border-b border-[var(--studio-border-subtle)] px-6 py-5 xl:px-8">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--studio-text-muted)]">
                            <Link href={`/projects/${project.id}`} className="text-[var(--studio-accent)] transition hover:text-[var(--studio-accent-hover)]">
                                {project.title}
                            </Link>
                            <span>/</span>
                            <Link href={`/projects/${project.id}/episodes/${episode.id}/workbench`} className="text-[var(--studio-accent)] transition hover:text-[var(--studio-accent-hover)]">
                                本集生产台
                            </Link>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <h1 className="break-words text-3xl font-semibold leading-tight text-[var(--studio-text-primary)]">工作流落地页</h1>
                            <StatusTag status={runDisplay?.displayStatus || "idle"} />
                        </div>
                        <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-[var(--studio-text-muted)]">{episode.title} 的 Agent 阶段、产物预览和画布承接状态集中在这里，减少最后落地时来回切换。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            icon={<ArrowLeft className="size-4" />}
                            onClick={() => router.push(`/projects/${project.id}/episodes/${episode.id}/workbench`)}
                        >
                            返回生产台
                        </Button>
                        <Button type="primary" icon={<PanelTop className="size-4" />} disabled={!boundCanvas} onClick={() => boundCanvas && router.push(`/canvas/${boundCanvas.id}`)}>
                            进入画布
                        </Button>
                    </div>
                </div>
            </header>

            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6 xl:px-8">
                <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 shadow-[var(--studio-shadow)] backdrop-blur">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">
                                    <Workflow className="size-4 text-[var(--studio-accent)]" />
                                    {preset.name}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-[var(--studio-text-muted)]">{runDisplay?.summaryText || "工作流尚未开始，进入生产台后可按阶段运行 Agent。"}</p>
                            </div>
                            <Progress type="circle" percent={progress} size={76} strokeColor="var(--studio-accent)" trailColor="var(--studio-panel-muted-bg)" format={() => `${approvedStageCount}/${stages.length}`} />
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <MetricCard label="阶段完成" value={`${approvedStageCount}/${stages.length}`} />
                            <MetricCard label="待落地项" value={String(totalPendingPreviews([productionBiblePreview, storyboardPreview, videoPreview], workflowAppliedPreviewItemIds))} />
                            <MetricCard label="画布节点" value={String(boundCanvas?.nodes?.length || 0)} />
                        </div>
                    </div>
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 shadow-[var(--studio-shadow)] backdrop-blur">
                        <div className="text-sm font-semibold text-[var(--studio-text-primary)]">承接位置</div>
                        <div className="mt-3 space-y-3 text-sm">
                            <InfoRow label="本集" value={episode.title} />
                            <InfoRow label="剧本" value={scriptSnapshot.trim() ? "已导入" : "未导入"} />
                            <InfoRow label="承接画布" value={boundCanvas?.title || "未创建"} />
                            <InfoRow label="分镜表" value={`${episodeTableShots.length} 个镜头`} />
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                    <LandingTargetCard
                        icon={<FileText className="size-5" />}
                        title="资产设定库"
                        stageId="art-design"
                        preview={productionBiblePreview}
                        appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                        hasCanvas={Boolean(boundCanvas)}
                        applying={Boolean(productionBiblePreview && applyingPreviewIds[productionBiblePreview.previewId])}
                        previewGenerationReason={previewGenerationDisabledReason(artStageOutput, artDisplay)}
                        onApply={applyPreview}
                        onGeneratePreview={generatePreview}
                    />
                    <LandingTargetCard
                        icon={<Clapperboard className="size-5" />}
                        title="分镜头表"
                        stageId="seedance-storyboard"
                        preview={storyboardPreview}
                        appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                        hasCanvas={Boolean(boundCanvas)}
                        applying={Boolean(storyboardPreview && applyingPreviewIds[storyboardPreview.previewId])}
                        previewGenerationReason={previewGenerationDisabledReason(storyboardStageOutput, storyboardDisplay)}
                        onApply={applyPreview}
                        onGeneratePreview={generatePreview}
                    />
                    <LandingTargetCard
                        icon={<PanelTop className="size-5" />}
                        title="视频配置节点"
                        stageId="seedance-storyboard"
                        preview={videoPreview}
                        appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                        hasCanvas={Boolean(boundCanvas)}
                        applying={Boolean(videoPreview && applyingPreviewIds[videoPreview.previewId])}
                        previewGenerationReason={previewGenerationDisabledReason(storyboardStageOutput, storyboardDisplay)}
                        onApply={applyPreview}
                        onGeneratePreview={generatePreview}
                    />
                </section>

                <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)] backdrop-blur">
                    <div className="border-b border-[var(--studio-border-subtle)] px-5 py-4">
                        <h2 className="text-base font-semibold text-[var(--studio-text-primary)]">阶段进度</h2>
                    </div>
                    <div className="divide-y divide-[var(--studio-border-subtle)]">
                        {stages.map((stage, index) => (
                            <StageRow
                                key={stage.stageId}
                                stage={stage}
                                order={index + 1}
                                display={stageDisplays[index]}
                                output={stageOutput(workflowRun, workflowOutputs, stage.stageId)}
                                previews={previews.filter((preview) => preview.sourceStageId === stage.stageId)}
                                onGeneratePreview={generatePreview}
                                onOpenWorkbench={() => router.push(`/projects/${project.id}/episodes/${episode.id}/workbench`)}
                            />
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-4 py-3">
            <div className="text-xs text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--studio-text-primary)]">{value}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--studio-text-muted)]">{label}</span>
            <span className="min-w-0 truncate text-right text-[var(--studio-text-primary)]">{value}</span>
        </div>
    );
}

function LandingTargetCard({
    appliedPreviewItemIds,
    applying,
    hasCanvas,
    icon,
    onApply,
    onGeneratePreview,
    preview,
    previewGenerationReason,
    stageId,
    title,
}: {
    appliedPreviewItemIds: string[];
    applying: boolean;
    hasCanvas: boolean;
    icon: ReactNode;
    onApply: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, label: string) => void;
    preview?: AgentWorkflowMappingPreview;
    previewGenerationReason: string;
    stageId: string;
    title: string;
}) {
    const counts = preview ? previewCounts(preview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const disabledReason = preview ? previewApplyDisabledReason(preview, counts.pending, hasCanvas) : "";
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 shadow-[var(--studio-shadow)] backdrop-blur transition hover:border-[var(--studio-border-strong)]">
            <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-md bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]">{icon}</span>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]">{title}</div>
                    <div className="mt-1 text-xs text-[var(--studio-text-muted)]">{preview?.title || "暂无可落地预览"}</div>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                <CountPill label="待写入" value={counts.pending} tone="amber" />
                <CountPill label="已写入" value={counts.applied} tone="green" />
                <CountPill label="总计" value={counts.total} tone="slate" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                {preview ? (
                    <Button type="primary" className="!h-9" loading={applying} disabled={Boolean(disabledReason)} title={disabledReason} onClick={() => onApply(preview)}>
                        {disabledReason ? "暂不可写入" : previewActionLabel(preview.targetType)}
                    </Button>
                ) : (
                    <Button
                        className="!h-9"
                        disabled={Boolean(previewGenerationReason)}
                        title={previewGenerationReason}
                        onClick={() => onGeneratePreview(stageId, title)}
                    >
                        {previewGenerationReason ? "待阶段产物" : "生成预览"}
                    </Button>
                )}
                {disabledReason || previewGenerationReason ? <span className="flex items-center text-xs text-[var(--studio-text-muted)]">{disabledReason || previewGenerationReason}</span> : null}
            </div>
        </div>
    );
}

function CountPill({ label, tone, value }: { label: string; tone: "amber" | "green" | "slate"; value: number }) {
    const className = tone === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-200" : tone === "green" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "bg-[var(--studio-panel-muted-bg)] text-[var(--studio-text-secondary)]";
    return (
        <div className={`rounded-md px-3 py-2 ${className}`}>
            <div className="text-base font-semibold">{value}</div>
            <div className="mt-0.5 opacity-75">{label}</div>
        </div>
    );
}

function StageRow({
    display,
    onGeneratePreview,
    onOpenWorkbench,
    order,
    output,
    previews,
    stage,
}: {
    display?: ReturnType<typeof summarizeWorkflowStageDisplayState>;
    onGeneratePreview: (stageId: string, label: string) => void;
    onOpenWorkbench: () => void;
    order: number;
    output?: AgentWorkflowStageOutput;
    previews: AgentWorkflowMappingPreview[];
    stage: AgentWorkflowStage;
}) {
    const canGeneratePreview = Boolean(output && stage.stageId !== "director-analysis");
    return (
        <div className="grid gap-4 px-5 py-4 md:grid-cols-[120px_1fr_180px]">
            <div className="text-sm text-[var(--studio-text-muted)]">阶段 {order}</div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--studio-text-primary)]">{workflowStageDisplayName(stage.stageId)}</h3>
                    <StatusTag status={display?.displayStatus || "idle"} />
                </div>
                <p className="mt-2 break-words text-sm leading-6 text-[var(--studio-text-muted)]">{display?.summaryText || stage.purpose}</p>
                {output?.summary ? <p className="mt-2 break-words text-xs leading-5 text-[var(--studio-text-secondary)]">{output.summary}</p> : null}
            </div>
            <div className="flex flex-col gap-2 text-sm text-[var(--studio-text-secondary)]">
                <InfoRow label="预览" value={`${previews.length} 个`} />
                <InfoRow label="产物" value={output ? "已生成" : "未生成"} />
                <div className="mt-1 flex flex-wrap gap-2">
                    <Button size="small" onClick={onOpenWorkbench}>
                        去处理
                    </Button>
                    {canGeneratePreview ? (
                        <Button size="small" type="primary" ghost onClick={() => onGeneratePreview(stage.stageId, `${workflowStageDisplayName(stage.stageId)}预览`)}>
                            生成预览
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function StatusTag({ status }: { status: AgentWorkflowDisplayStatus }) {
    return <Tag color={statusColor(status)}>{workflowStageStatusLabel(status)}</Tag>;
}

function stageOutput(workflowRun: AgentWorkflowRunRecord | undefined, outputs: AgentWorkflowStageOutput[], stageId: string) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    return stageState?.outputId ? outputs.find((output) => output.outputId === stageState.outputId) : outputs.find((output) => output.workflowRunId === workflowRun?.id && output.stageId === stageId);
}

function previewGenerationDisabledReason(output?: AgentWorkflowStageOutput, display?: ReturnType<typeof summarizeWorkflowStageDisplayState>) {
    if (output) return "";
    if (display?.displayStatus === "running") return "阶段运行中，完成后才能生成预览";
    if (display?.displayStatus === "review" || display?.displayStatus === "partial") return "阶段待确认，批准后才能生成预览";
    if (display?.displayStatus === "blocked") return "需先在生产台处理阻塞阶段";
    if (display?.displayStatus === "error" || display?.displayStatus === "rejected") return "需先在生产台处理阶段异常";
    return "需先在生产台生成并批准阶段产物";
}

function buildExpectedSceneKeys(tableShots: Array<{ sceneId?: string; sceneName: string }>, scriptScenes: Array<{ id: string }>) {
    if (tableShots.length) return Array.from(new Set(tableShots.map((shot, index) => shot.sceneId || shot.sceneName || `scene-${index + 1}`)));
    return scriptScenes.map((scene) => scene.id);
}

function totalPendingPreviews(previews: Array<AgentWorkflowMappingPreview | undefined>, appliedPreviewItemIds: string[]) {
    return previews.reduce((total, preview) => total + (preview ? previewCounts(preview, appliedPreviewItemIds).pending : 0), 0);
}

function statusColor(status: AgentWorkflowDisplayStatus) {
    if (status === "approved") return "green";
    if (status === "running" || status === "review" || status === "partial") return "cyan";
    if (status === "error" || status === "rejected" || status === "blocked") return "red";
    return "default";
}
