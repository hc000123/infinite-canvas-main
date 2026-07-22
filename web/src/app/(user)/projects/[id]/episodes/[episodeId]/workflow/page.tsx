"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, App, Button, Drawer, Empty, Spin } from "antd";
import { FileText, List, PanelRight, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { getImageBlob } from "@/services/image-storage";
import { createWorkflowMediaBatch, deleteWorkflowMediaBatch, uploadWorkflowMedia, type WorkflowStageStartOptions } from "@/services/api/workflow-runs";
import { useAssetStore } from "@/stores/use-asset-store";
import { useVideoPackageStore, type WorkflowReferenceBinding, type WorkflowVideoReference } from "@/app/(user)/video/use-video-package-store";

import { WorkflowHeader } from "./components/workflow-header";
import { WorkflowAssetPanel } from "./components/workflow-asset-panel";
import { WorkflowDeliveryPanel } from "./components/workflow-delivery-panel";
import { WorkflowReferenceImagePanel } from "./components/workflow-reference-image-panel";
import { WorkflowScriptExtractionPanel } from "./components/workflow-script-extraction-panel";
import { WorkflowRunConsole } from "./components/workflow-run-console";
import { WorkflowShotEditor } from "./components/workflow-shot-editor";
import { WorkflowShotPromptReview } from "./components/workflow-shot-prompt-review";
import { WorkflowShotQueue } from "./components/workflow-shot-queue";
import { WorkflowStageRail } from "./components/workflow-stage-rail";
import { WorkflowVideoConsole } from "./components/workflow-video-console";
import { useWorkflowAssetAutomation } from "./use-workflow-asset-automation";
import { useWorkflowStageActions } from "./use-workflow-stage-actions";
import { useWorkflowShotAutomation } from "./use-workflow-shot-automation";
import { useWorkflowVideoActions } from "./use-workflow-video-actions";
import { useWorkflowWorkbench } from "./use-workflow-workbench";
import { promptInputHash, updateReferenceBindings } from "./workflow-production-state";
import { workflowReferenceBlob, workflowReferenceImages, type WorkflowReferenceImage } from "./workflow-reference-images";

export default function EpisodeWorkflowPage() {
    const params = useParams<{ episodeId: string; id: string }>();
    const { message, modal } = App.useApp();
    const [queueOpen, setQueueOpen] = useState(false);
    const [consoleOpen, setConsoleOpen] = useState(false);
    const [preparing, setPreparing] = useState("");
    const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
    const assets = useAssetStore((state) => state.assets);
    const updatePackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const workbench = useWorkflowWorkbench(params.id, params.episodeId);
    const extraction = useWorkflowStageActions({ detail: workbench.detail, refresh: workbench.refreshRemote, stageId: "asset-extraction" });
    const assetPrompt = useWorkflowStageActions({ detail: workbench.detail, refresh: workbench.refreshRemote, stageId: "asset-image-prompt" });
    const breakdown = useWorkflowStageActions({ detail: workbench.detail, refresh: workbench.refreshRemote, stageId: "shot-breakdown" });
    const shotPrompt = useWorkflowStageActions({ detail: workbench.detail, refresh: workbench.refreshRemote, stageId: "shot-prompt" });
    const videoActions = useWorkflowVideoActions(workbench.packages);
    const assetAutomation = useWorkflowAssetAutomation({
        enabled: workbench.routeState.stage === "assets",
        extraction,
        prompts: assetPrompt,
        refresh: workbench.refreshRemote,
        runId: workbench.detail?.run.id || "",
        workerReady: Boolean(workbench.health?.ready),
    });
    const shotAutomation = useWorkflowShotAutomation({ artifact: breakdown.artifact, episodeId: params.episodeId, gate: breakdown.gate, onApplied: workbench.refreshRemote, projectId: params.id, stage: breakdown.stage });
    const referenceImages = useMemo(() => workflowReferenceImages(assets, params.id, params.episodeId), [assets, params.episodeId, params.id]);
    useEffect(() => { setSelectedReferenceIds((current) => current.length ? current.filter((id) => referenceImages.some((item) => item.id === id)) : referenceImages.map((item) => item.id)); }, [referenceImages]);

    if (!workbench.isHydrated) return <main className="studio-shell grid h-full place-items-center"><Spin description="正在读取本集生产资料" /></main>;
    if (!workbench.project || !workbench.episode) return <main className="studio-shell grid h-full place-items-center px-6"><Empty description="项目或集数不存在"><Button href={workbench.project ? `/projects/${workbench.project.id}` : "/projects"}>返回项目</Button></Empty></main>;

    const activeStage = workbench.stageViews.find((stage) => stage.key === workbench.routeState.stage) || workbench.stageViews[0];
    const selectedReferences = referenceImages.filter((item) => selectedReferenceIds.includes(item.id));
    const activeRemote = workbench.routeState.stage === "assets" ? (assetPrompt.stage && assetPrompt.stage.status !== "blocked" ? assetPrompt : extraction) : workbench.routeState.stage === "video" ? (shotPrompt.stage && shotPrompt.stage.status !== "blocked" ? shotPrompt : breakdown) : null;
    const currentAgentRun = workbench.detail?.agentRuns.find((item) => item.id === activeRemote?.stage?.agentRunId) || null;
    const executorLabel = workbench.health?.executorLabel || "工作流执行器";
    const showsQueue = ["video", "delivery"].includes(workbench.routeState.stage);
    const showsRunConsole = workbench.routeState.stage !== "assets";

    const startStage = (label: string, stageId: string, state: ReturnType<typeof useWorkflowStageActions>, options: { references?: WorkflowReferenceImage[]; context?: unknown; beforeStart?: () => void } = {}) => {
        const refs = options.references || [];
        const local = workbench.health?.executor === "codex-cli";
        modal.confirm({
            title: `启动${label}？`,
            content: `${refs.length ? `将冻结并理解 ${refs.length} 张参考图。` : "本次任务不附加参考图。"}${local ? "本地 Codex 验证不扣应用算力点。" : "线上任务将按实际模型计费。"}`,
            okText: "确认启动", cancelText: "取消",
            onOk: async () => {
                if (!workbench.detail) return;
                setPreparing(stageId);
                let batchId = "";
                try {
                    if (refs.length) {
                        const batch = await createWorkflowMediaBatch(workbench.detail.run.id, stageId, state.startKey);
                        batchId = batch.batch.id;
                        for (const [order, reference] of refs.entries()) {
                            const file = await workflowReferenceBlob(reference, getImageBlob);
                            const extension = ({ "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[file.type] || "png";
                            await uploadWorkflowMedia(batchId, { assetId: reference.id, file, filename: `${reference.id}.${extension}`, kind: reference.kind, label: reference.label, order, version: reference.version });
                        }
                    }
                    const startOptions: WorkflowStageStartOptions = { ...(batchId ? { mediaBatchId: batchId } : {}), ...(options.context ? { context: options.context } : {}) };
                    options.beforeStart?.();
                    const started = await state.start(startOptions);
                    if (!started && batchId) await deleteWorkflowMediaBatch(batchId);
                } catch (error) {
                    if (batchId) await deleteWorkflowMediaBatch(batchId).catch(() => undefined);
                    message.error(error instanceof Error ? error.message : "任务准备失败，请重试");
                } finally { setPreparing(""); }
            },
        });
    };

    const generateShotPrompt = () => {
        const item = workbench.selectedPackage;
        if (!item?.shotDraft || item.shotStatus !== "confirmed") return;
        const continuity = item.continuityReference ? continuityReferenceImage(assets, item.continuityReference.libraryAssetId, item.continuityReference.version) : null;
        if (continuity && selectedReferences.length > 8) message.info("已为上一镜尾帧保留第 9 个参考位，本镜使用前 8 张资产图。");
        const assetReferences = selectedReferences.slice(0, continuity ? 8 : 9);
        const promptReferences = continuity ? [...assetReferences, continuity] : assetReferences;
        const referenceBindings: WorkflowReferenceBinding[] = assetReferences.map((reference) => ({ logicalAssetId: logicalAssetId(reference), libraryAssetId: reference.id, version: reference.version, usage: reference.kind === "character" ? "角色一致性" : reference.kind === "scene" ? "场景与材质一致性" : "道具一致性" }));
        const workflowReferences: WorkflowVideoReference[] = assetReferences.map((reference, index) => ({ ref: `@图${index + 1}`, type: reference.kind === "character" ? "人物参考" : reference.kind === "scene" ? "场景参考" : "道具参考", name: reference.label, usage: referenceBindings[index].usage, logicalAssetId: referenceBindings[index].logicalAssetId, libraryAssetId: reference.id, version: reference.version }));
        const preparedItem = updateReferenceBindings({ ...item, workflowReferences, assets: workflowReferences.map((reference) => ({ kind: /\u4eba物/.test(reference.type) ? "角色图" as const : /\u573a景/.test(reference.type) ? "场景图" as const : "道具图" as const, name: `${reference.ref} ${reference.name}`, status: "已绑定" as const })) }, referenceBindings);
        const inputHash = promptInputHash(preparedItem);
        const context = {
            shotId: item.id, sourceScript: item.sourceScript || item.segment, shotDraft: item.shotDraft, promptInputHash: inputHash,
            references: promptReferences.map((reference, index) => ({ ref: `@图${index + 1}`, label: reference.label, kind: reference.kind, logicalAssetId: logicalAssetId(reference), libraryAssetId: reference.id, version: reference.version, usage: reference.id === item.continuityReference?.libraryAssetId ? "上一镜尾帧剧情连续性参考，不作为首帧" : reference.kind === "character" ? "角色一致性" : reference.kind === "scene" ? "场景与材质一致性" : "道具一致性", ...(reference.parentLogicalAssetId ? { parentLogicalAssetId: reference.parentLogicalAssetId } : {}), ...(reference.variantName ? { variantName: reference.variantName } : {}) })),
            ...(item.continuityReference ? { continuityReference: item.continuityReference } : {}),
        };
        startStage(`${item.id} 镜头提示词`, "shot-prompt", shotPrompt, { references: promptReferences, context, beforeStart: () => updatePackage(item, preparedItem) });
    };

    return <main className="studio-shell flex h-full min-w-0 flex-col overflow-hidden text-[var(--studio-text-primary)]">
        <WorkflowHeader blockerCount={workbench.blockerCount} episodeTitle={`第 ${String(workbench.episode.order).padStart(2, "0")} 集 · ${workbench.episode.title}`} loading={workbench.remoteLoading} modelSummary={`${executorLabel} · ${workbench.modelSummary}`} onContinue={workbench.continueNext} onRefresh={workbench.refreshRemote} progress={workbench.progress} projectId={workbench.project.id} projectTitle={workbench.project.title} workerReady={Boolean(workbench.health?.ready)} />
        {workbench.remoteError ? <Alert className="mx-5 mt-3 shrink-0 xl:mx-7" showIcon closable type="warning" title="运行状态暂不可用" description={`${workbench.remoteError}。本地剧本、资产和视频生产包仍可继续查看。`} /> : null}
        <div className={cn("grid min-h-0 flex-1 grid-cols-1", showsQueue ? "xl:grid-cols-[168px_252px_minmax(460px,1fr)_320px]" : showsRunConsole ? "xl:grid-cols-[168px_minmax(560px,1fr)_320px]" : "xl:grid-cols-[168px_minmax(0,1fr)]") }>
            <WorkflowStageRail active={workbench.routeState.stage} onSelect={workbench.selectRoute} stages={workbench.stageViews} />
            {showsQueue ? <WorkflowShotQueue packages={workbench.packages} selectedId={workbench.selectedPackage?.id || ""} onSelect={(shot) => workbench.selectRoute(workbench.routeState.stage, shot)} /> : null}
            <section className="thin-scrollbar min-h-0 overflow-y-auto bg-[var(--studio-workspace-bg)] px-4 py-4 xl:px-6">
                <div className={cn("mx-auto", workbench.routeState.stage === "assets" ? "max-w-7xl" : "max-w-5xl")}>
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1 xl:hidden">{workbench.stageViews.map((stage) => <button key={stage.key} type="button" className={cn("h-9 shrink-0 rounded-md border px-3 text-xs", stage.key === workbench.routeState.stage ? "border-[var(--studio-accent)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] text-[var(--studio-text-secondary)]")} onClick={() => workbench.selectRoute(stage.key)}>{stage.label}</button>)}</div>
                    {showsQueue ? <div className="mb-3 flex gap-2 xl:hidden"><Button className="min-h-11 flex-1" icon={<List className="size-4" />} onClick={() => setQueueOpen(true)}>分镜队列</Button><Button className="min-h-11 flex-1" icon={<PanelRight className="size-4" />} onClick={() => setConsoleOpen(true)}>视频控制台</Button></div> : null}
                    <div className="mb-5 border-b border-[var(--studio-border-subtle)] pb-4"><div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--studio-accent)]">Episode production desk</div><h2 className="mt-1 text-xl font-semibold">{activeStage.label}</h2><p className="mt-1 text-sm text-[var(--studio-text-secondary)]">{activeStage.description}</p></div>
                    {workbench.routeState.stage === "script" ? <div className="space-y-4"><Panel icon={<FileText className="size-4" />} title="本集确认稿" description="后续资产与镜头都引用这份不可变快照。"><pre className="thin-scrollbar max-h-[48vh] overflow-auto whitespace-pre-wrap text-sm leading-7 text-[var(--studio-text-secondary)]">{workbench.scriptSnapshot}</pre></Panel><WorkflowScriptExtractionPanel agentRuns={workbench.detail?.agentRuns || []} asset={extraction} projectId={workbench.project.id} shot={breakdown} workerReady={Boolean(workbench.health?.ready)} /></div> : null}
                    {workbench.routeState.stage === "assets" ? <WorkflowAssetPanel artifact={assetPrompt.artifact} automation={assetAutomation} episodeId={workbench.episode.id} onApplied={workbench.refreshRemote} projectId={workbench.project.id} projectTitle={workbench.project.title} stage={assetPrompt.stage} /> : null}
                    {workbench.routeState.stage === "video" ? (!workbench.packages.length ? <Panel icon={<RefreshCw className={`size-4 ${["queued", "running"].includes(breakdown.stage?.status || "") || shotAutomation.loading ? "animate-spin" : ""}`} />} title="正在从原剧本生成分镜" description="分镜通过质量门后会自动载入左侧队列，不需要手动填写或再次确认。"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-[var(--studio-text-secondary)]">{shotAutomation.error || breakdown.stage?.errorMessage || storyboardStatusText(breakdown.stage?.status)}</span><Button icon={<RefreshCw className="size-4" />} disabled={!breakdown.actions.canStart && !breakdown.actions.canRetry} loading={Boolean(breakdown.busyAction)} onClick={() => void (breakdown.actions.canRetry ? breakdown.retry() : breakdown.start())}>重新生成分镜</Button></div></Panel> : workbench.selectedPackage ? <div className="space-y-4"><WorkflowReferenceImagePanel images={referenceImages} selectedIds={selectedReferenceIds} onChange={setSelectedReferenceIds} /><WorkflowShotEditor canGeneratePrompt={shotPrompt.actions.canStart} item={workbench.selectedPackage} packages={workbench.packages} onSelect={(shot) => workbench.selectRoute("video", shot)} generatingPrompt={preparing === "shot-prompt" || shotPrompt.busyAction === "start"} onGeneratePrompt={generateShotPrompt} promptReview={<WorkflowShotPromptReview item={workbench.selectedPackage} state={shotPrompt} onApplied={workbench.refreshRemote} />} /></div> : <Empty className="py-20" description="请先载入分镜" />) : null}
                    {workbench.routeState.stage === "delivery" ? <WorkflowDeliveryPanel packages={workbench.packages} /> : null}
                </div>
            </section>
            {showsQueue ? <WorkflowVideoConsole actions={videoActions} item={workbench.selectedPackage} /> : showsRunConsole ? <WorkflowRunConsole agentRun={currentAgentRun} events={workbench.events} health={workbench.health} stage={activeRemote?.stage || null} /> : null}
        </div>
        <Drawer title="分镜队列" placement="left" size={340} open={queueOpen} onClose={() => setQueueOpen(false)} styles={{ body: { padding: 0, overflow: "hidden" } }}><div className="h-full [&>aside]:!flex [&>aside]:h-full"><WorkflowShotQueue packages={workbench.packages} selectedId={workbench.selectedPackage?.id || ""} onSelect={(shot) => { workbench.selectRoute("video", shot); setQueueOpen(false); }} /></div></Drawer>
        <Drawer title="视频控制台" placement="right" size={360} open={consoleOpen} onClose={() => setConsoleOpen(false)} styles={{ body: { padding: 0, overflow: "hidden" } }}><div className="h-full [&>aside]:!flex [&>aside]:h-full"><WorkflowVideoConsole actions={videoActions} item={workbench.selectedPackage} /></div></Drawer>
    </main>;
}

function Panel({ children, description, icon, title }: { children: React.ReactNode; description: string; icon: React.ReactNode; title: string }) { return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 shadow-[var(--studio-shadow)]"><div className="mb-4 flex items-start gap-2"><span className="mt-0.5 text-[var(--studio-accent)]">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">{description}</p></div></div>{children}</section>; }
function storyboardStatusText(status?: string) { return ({ blocked: "请先确认本集剧本", ready: "可从剧本开始提取", queued: "分镜任务已进入后台队列", running: "Codex 正在拆分结构化分镜", needs_review: "正在校验并载入分镜", approved: "正在载入分镜队列", applied: "分镜已载入", failed: "分镜生成失败，可重新生成", rejected: "分镜结果需要重新生成", cancelled: "分镜任务已停止" } as Record<string, string>)[status || ""] || "等待分镜任务"; }
function logicalAssetId(reference: WorkflowReferenceImage) { if (reference.logicalAssetId) return reference.logicalAssetId; const value = reference.asset.metadata?.originalWorkflow; if (!value || typeof value !== "object" || Array.isArray(value)) return reference.id; const id = (value as Record<string, unknown>).logicalAssetId; return typeof id === "string" && id ? id : reference.id; }
function continuityReferenceImage(assets: ReturnType<typeof useAssetStore.getState>["assets"], assetId: string, version: string): WorkflowReferenceImage | null { const asset = assets.find((item) => item.id === assetId); return asset?.kind === "image" ? { asset, id: asset.id, kind: "scene", label: "上一镜尾帧连续性参考", version } : null; }
