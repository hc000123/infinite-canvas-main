"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Empty, Progress, Tag } from "antd";
import { ArrowLeft, Clapperboard, FileText, PanelTop, Workflow } from "lucide-react";

import { useCanvasStore, type CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
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
import { latestPreview, previewCounts } from "../workbench/episode-workbench-display";

export default function EpisodeWorkflowLandingPage() {
    const params = useParams<{ id: string; episodeId: string }>();
    const searchParams = useSearchParams();
    const router = useRouter();
    const projectId = params.id;
    const episodeId = params.episodeId;
    const requestedCanvasId = searchParams.get("canvasId") || "";
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const episode = useScriptStore((state) => state.episodes.find((item) => item.id === episodeId && item.projectId === projectId));
    const scenes = useScriptStore((state) => state.scenes);
    const canvases = useCanvasStore((state) => state.projects);
    const storyboardTableShots = useStoryboardStore((state) => state.tableShots);
    const workflowRuns = useAgentRunnerStore((state) => state.workflowRuns);
    const workflowOutputs = useAgentRunnerStore((state) => state.workflowOutputs);
    const workflowMappingPreviews = useAgentRunnerStore((state) => state.workflowMappingPreviews);
    const workflowAppliedPreviewItemIds = useAgentRunnerStore((state) => state.workflowAppliedPreviewItemIds);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const preset = useMemo(() => buildSeedanceWorkflowPreset(), []);
    const stages = useMemo(() => sortedWorkflowStages(preset), [preset]);
    const stageSceneRows = useMemo(() => orderedScriptScenes(scenes, episodeId), [episodeId, scenes]);
    const scriptSnapshot = useMemo(() => (episode ? buildEpisodeScriptSnapshot(episode, stageSceneRows) : ""), [episode, stageSceneRows]);
    const requestedCanvas = useMemo(() => canvases.find((canvas) => canvas.id === requestedCanvasId && canvas.projectId === projectId && canvas.episodeId === episodeId), [canvases, episodeId, projectId, requestedCanvasId]);
    const boundCanvas = useMemo(() => requestedCanvas || canvases.find((canvas) => canvas.projectId === projectId && canvas.episodeId === episodeId), [canvases, episodeId, projectId, requestedCanvas]);
    const episodeTableShots = useMemo(() => (boundCanvas ? orderedStoryboardTableShots(storyboardTableShots, boundCanvas.id, episodeId) : []), [boundCanvas, episodeId, storyboardTableShots]);
    const workflowRun = useMemo(() => findWorkflowRun(workflowRuns, projectId, episodeId, preset.workflowId, boundCanvas), [boundCanvas, episodeId, preset.workflowId, projectId, workflowRuns]);
    const previews = useMemo(() => (workflowRun ? workflowMappingPreviews.filter((preview) => preview.workflowRunId === workflowRun.id) : []), [workflowMappingPreviews, workflowRun]);
    const productionBiblePreview = latestPreview(previews, "production_bible");
    const storyboardPreview = latestPreview(previews, "storyboard_table");
    const videoPreview = latestPreview(previews, "video_node");
    const sceneKeys = useMemo(() => buildExpectedSceneKeys(episodeTableShots, stageSceneRows), [episodeTableShots, stageSceneRows]);
    const stageDisplays = useMemo(() => stages.map((stage) => (workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, stage.stageId, stage.stageId === "seedance-storyboard" ? sceneKeys : []) : undefined)), [sceneKeys, stages, workflowRun]);
    const runDisplay = useMemo(() => (workflowRun ? summarizeWorkflowRunDisplayState(workflowRun, { "seedance-storyboard": sceneKeys }) : undefined), [sceneKeys, workflowRun]);
    const approvedStageCount = stageDisplays.filter((display) => display?.displayStatus === "approved").length;
    const progress = stages.length ? Math.round((approvedStageCount / stages.length) * 100) : 0;

    useEffect(() => {
        if (!project || !episode) return;
        ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
    }, [boundCanvas?.id, ensureWorkflowRun, episode, episodeId, preset, project, projectId]);

    if (!project || !episode) {
        return (
            <main className="h-full overflow-auto bg-background px-6 py-10 text-stone-950 dark:text-stone-100">
                <div className="mx-auto max-w-3xl">
                    <Empty description="项目或集数不存在">
                        <Button href={project ? `/projects/${project.id}` : "/projects"}>返回项目</Button>
                    </Empty>
                </div>
            </main>
        );
    }

    return (
        <main className="h-full overflow-auto bg-[#050b10] text-slate-100">
            <header className="border-b border-slate-800/80 px-6 py-5 xl:px-8">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                            <Link href={`/projects/${project.id}`} className="text-cyan-300/85 hover:text-cyan-200">
                                {project.title}
                            </Link>
                            <span>/</span>
                            <Link href={`/projects/${project.id}/episodes/${episode.id}/workbench`} className="text-cyan-300/85 hover:text-cyan-200">
                                本集生产台
                            </Link>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <h1 className="break-words text-3xl font-semibold leading-tight text-slate-50">工作流落地页</h1>
                            <StatusTag status={runDisplay?.displayStatus || "idle"} />
                        </div>
                        <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-slate-500">{episode.title} 的 Agent 阶段、产物预览和画布承接状态集中在这里，减少最后落地时来回切换。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button className="!border-slate-700 !bg-slate-950/50 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" icon={<ArrowLeft className="size-4" />} onClick={() => router.push(`/projects/${project.id}/episodes/${episode.id}/workbench`)}>
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
                    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                                    <Workflow className="size-4 text-cyan-300" />
                                    {preset.name}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-slate-500">{runDisplay?.summaryText || "工作流尚未开始，进入生产台后可按阶段运行 Agent。"}</p>
                            </div>
                            <Progress type="circle" percent={progress} size={76} strokeColor="#22d3ee" trailColor="rgba(51,65,85,.8)" format={() => `${approvedStageCount}/${stages.length}`} />
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <MetricCard label="阶段完成" value={`${approvedStageCount}/${stages.length}`} />
                            <MetricCard label="待落地项" value={String(totalPendingPreviews([productionBiblePreview, storyboardPreview, videoPreview], workflowAppliedPreviewItemIds))} />
                            <MetricCard label="画布节点" value={String(boundCanvas?.nodes?.length || 0)} />
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5">
                        <div className="text-sm font-semibold text-slate-200">承接位置</div>
                        <div className="mt-3 space-y-3 text-sm text-slate-400">
                            <InfoRow label="本集" value={episode.title} />
                            <InfoRow label="剧本" value={scriptSnapshot.trim() ? "已导入" : "未导入"} />
                            <InfoRow label="承接画布" value={boundCanvas?.title || "未创建"} />
                            <InfoRow label="分镜表" value={`${episodeTableShots.length} 个镜头`} />
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                    <LandingTargetCard icon={<FileText className="size-5" />} title="资产设定库" preview={productionBiblePreview} appliedPreviewItemIds={workflowAppliedPreviewItemIds} />
                    <LandingTargetCard icon={<Clapperboard className="size-5" />} title="分镜头表" preview={storyboardPreview} appliedPreviewItemIds={workflowAppliedPreviewItemIds} />
                    <LandingTargetCard icon={<PanelTop className="size-5" />} title="视频配置节点" preview={videoPreview} appliedPreviewItemIds={workflowAppliedPreviewItemIds} />
                </section>

                <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70">
                    <div className="border-b border-slate-800/80 px-5 py-4">
                        <h2 className="text-base font-semibold text-slate-100">阶段进度</h2>
                    </div>
                    <div className="divide-y divide-slate-800/80">
                        {stages.map((stage, index) => (
                            <StageRow key={stage.stageId} stage={stage} order={index + 1} display={stageDisplays[index]} output={stageOutput(workflowRun, workflowOutputs, stage.stageId)} previews={previews.filter((preview) => preview.sourceStageId === stage.stageId)} />
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 px-4 py-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">{label}</span>
            <span className="min-w-0 truncate text-right text-slate-200">{value}</span>
        </div>
    );
}

function LandingTargetCard({ appliedPreviewItemIds, icon, preview, title }: { appliedPreviewItemIds: string[]; icon: ReactNode; preview?: AgentWorkflowMappingPreview; title: string }) {
    const counts = preview ? previewCounts(preview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    return (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5">
            <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-200">{icon}</span>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
                    <div className="mt-1 text-xs text-slate-500">{preview?.title || "暂无可落地预览"}</div>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                <CountPill label="待写入" value={counts.pending} tone="amber" />
                <CountPill label="已写入" value={counts.applied} tone="green" />
                <CountPill label="总计" value={counts.total} tone="slate" />
            </div>
        </div>
    );
}

function CountPill({ label, tone, value }: { label: string; tone: "amber" | "green" | "slate"; value: number }) {
    const className = tone === "amber" ? "bg-amber-400/10 text-amber-200" : tone === "green" ? "bg-emerald-400/10 text-emerald-200" : "bg-slate-800/80 text-slate-300";
    return (
        <div className={`rounded-xl px-3 py-2 ${className}`}>
            <div className="text-base font-semibold">{value}</div>
            <div className="mt-0.5 opacity-75">{label}</div>
        </div>
    );
}

function StageRow({ display, order, output, previews, stage }: { display?: ReturnType<typeof summarizeWorkflowStageDisplayState>; order: number; output?: AgentWorkflowStageOutput; previews: AgentWorkflowMappingPreview[]; stage: AgentWorkflowStage }) {
    return (
        <div className="grid gap-4 px-5 py-4 md:grid-cols-[120px_1fr_180px]">
            <div className="text-sm text-slate-500">阶段 {order}</div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{workflowStageDisplayName(stage.stageId)}</h3>
                    <StatusTag status={display?.displayStatus || "idle"} />
                </div>
                <p className="mt-2 break-words text-sm leading-6 text-slate-500">{display?.summaryText || stage.purpose}</p>
                {output?.summary ? <p className="mt-2 break-words text-xs leading-5 text-slate-400">{output.summary}</p> : null}
            </div>
            <div className="flex flex-col gap-2 text-sm text-slate-400">
                <InfoRow label="预览" value={`${previews.length} 个`} />
                <InfoRow label="产物" value={output ? "已生成" : "未生成"} />
            </div>
        </div>
    );
}

function StatusTag({ status }: { status: AgentWorkflowDisplayStatus }) {
    return <Tag color={statusColor(status)}>{workflowStageStatusLabel(status)}</Tag>;
}

function findWorkflowRun(workflowRuns: AgentWorkflowRunRecord[], projectId: string, episodeId: string, workflowId: string, boundCanvas?: CanvasProject) {
    return workflowRuns.find((run) => run.projectId === projectId && run.episodeId === episodeId && run.workflowId === workflowId && (boundCanvas ? run.canvasId === boundCanvas.id : !run.canvasId));
}

function stageOutput(workflowRun: AgentWorkflowRunRecord | undefined, outputs: AgentWorkflowStageOutput[], stageId: string) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    return stageState?.outputId ? outputs.find((output) => output.outputId === stageState.outputId) : outputs.find((output) => output.workflowRunId === workflowRun?.id && output.stageId === stageId);
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
