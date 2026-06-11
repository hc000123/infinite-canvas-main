"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Input } from "antd";

import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode, ScriptScene } from "../../../../../../canvas/utils/script-management";
import type { StoryboardTableShot } from "../../../../../../canvas/utils/storyboard-management";
import {
    type AgentWorkflowMappingPreview,
    type AgentWorkflowRunRecord,
    type AgentWorkflowSceneRunState,
    type AgentWorkflowStageOutput,
} from "../../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../../agent-runner-workflow-display";
import { EpisodeCanvasHandoffPage } from "./episode-canvas-handoff-page";
import type { CanvasHandoffImportTarget } from "./episode-canvas-handoff-utils";
import { EpisodeStoryboardPackagePage } from "./episode-storyboard-package-page";
import { EpisodeAssetsModulePage } from "./episode-assets-module-page";
import { EpisodeModulePanel, type EpisodeDetailRecord } from "./episode-module-panel";
import { EpisodeProductionHeader } from "./episode-production-header";
import { EpisodeModuleTabs } from "./episode-workflow-panels";
import {
    buildAssetStageActionHint,
    buildEpisodeModuleNavStatus,
    buildEpisodeNextActionText,
    buildEpisodePhaseText,
    episodeModules,
    latestPreview,
    previewCounts,
    type EpisodeModuleKey,
} from "../episode-workbench-display";
import { buildEpisodeModuleConfig, filterEpisodeRows, type DirectorReviewState } from "../episode-module-config";
import { buildStoryboardProductionSegments } from "../storyboard-production-segments";
import { useEpisodeProductionAssets } from "../use-episode-production-assets";
import type { EpisodeSceneOption } from "../use-episode-workbench-state";

export function EpisodeProductionShell({
    activeModule,
    appliedPreviewItemIds,
    applyingPreviewIds,
    boundCanvas,
    currentScene,
    currentSceneState,
    directorReviewStates,
    episode,
    episodeTableShots,
    hasScript,
    onApplyPreview,
    onBackProject,
    onCreateCanvas,
    onGeneratePreview,
    onImportCanvasPackage,
    onModuleChange,
    onOpenCanvas,
    onOpenDetail,
    onApproveStageReview,
    onApproveStoryboardScene,
    onCancelStage,
    onOptimizeScript,
    onUpdateDirectorReviewState,
    onRunStage,
    onRunStoryboardScene,
    onSaveScript,
    onSummarizeStoryboardScenes,
    project,
    previews,
    runningStageIds,
    sceneOptions,
    scriptOptimizing,
    scriptDraft,
    scriptSnapshot,
    setScriptDraft,
    stageOutputs,
    stageSceneRows,
    workflowRun,
}: {
    activeModule: EpisodeModuleKey;
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    boundCanvas?: CanvasProject;
    currentScene?: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    directorReviewStates: Record<string, DirectorReviewState>;
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onBackProject: () => void;
    onCreateCanvas: () => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onImportCanvasPackage: (pkg: CanvasHandoffImportTarget) => void;
    onModuleChange: (module: EpisodeModuleKey) => void;
    onOpenCanvas: () => void;
    onOpenDetail: (record: EpisodeDetailRecord) => void;
    onApproveStageReview: (stageId: string, note: string) => void;
    onApproveStoryboardScene: () => void;
    onCancelStage: (stageId: string) => void;
    onOptimizeScript: () => void;
    onUpdateDirectorReviewState: (rowId: string, state: DirectorReviewState) => void;
    onRunStage: (stageId: string) => void;
    onRunStoryboardScene: () => void;
    onSaveScript: () => void;
    onSummarizeStoryboardScenes: () => void;
    project: { id: string; title: string };
    previews: AgentWorkflowMappingPreview[];
    runningStageIds: Record<string, boolean>;
    sceneOptions: EpisodeSceneOption[];
    scriptOptimizing: boolean;
    scriptDraft: string;
    scriptSnapshot: string;
    setScriptDraft: (value: string) => void;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    stageSceneRows: ScriptScene[];
    workflowRun?: AgentWorkflowRunRecord;
}) {
    const router = useRouter();
    const { message } = App.useApp();
    const [activeFilter, setActiveFilter] = useState("全部");
    const [scriptEditing, setScriptEditing] = useState(false);
    useEffect(() => setActiveFilter("全部"), [activeModule]);

    const storyboardSceneKeys = sceneOptions.map((scene) => scene.sceneKey);
    const directorDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "director-analysis", []) : undefined;
    const artDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "art-design", []) : undefined;
    const storyboardDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "seedance-storyboard", storyboardSceneKeys) : undefined;
    const productionBiblePreview = latestPreview(previews, "production_bible");
    const productionBiblePreviewCounts = productionBiblePreview ? previewCounts(productionBiblePreview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const storyboardPreview = latestPreview(previews, "storyboard_table");
    const videoPreview = latestPreview(previews, "video_node");
    const assetStageActionHint = buildAssetStageActionHint({
        display: artDisplay,
        hasOutput: Boolean(stageOutputs["art-design"]),
        isRunning: Boolean(runningStageIds["art-design"]),
        outputHasStateMismatch: Boolean(stageOutputs["art-design"] && artDisplay?.stageStatus !== "review" && artDisplay?.displayStatus !== "approved" && !productionBiblePreview),
        outputNeedsReview: Boolean(stageOutputs["art-design"] && artDisplay?.stageStatus === "review" && !productionBiblePreview),
        previewPending: productionBiblePreviewCounts.pending,
        previewTotal: productionBiblePreviewCounts.total,
    });
    const currentPhase = buildEpisodePhaseText({ artDisplay, boundCanvas, directorDisplay, episodeTableShots, hasScript, productionBiblePreview, storyboardDisplay, storyboardPreview, videoPreview });
    const nextActionText = buildEpisodeNextActionText({ appliedPreviewItemIds, artDisplay, boundCanvas, directorDisplay, episodeTableShots, hasScript, productionBiblePreview, storyboardDisplay, storyboardPreview, videoPreview });
    const flowNotice = buildWorkbenchFlowNotice({
        artDisplay,
        boundCanvas,
        directorDisplay,
        hasScript,
        productionBiblePreview,
        storyboardDisplay,
        storyboardPreview,
        videoPreview,
    });
    const { assetRows, bindExtractedAsset, uploadExtractedAssetImage } = useEpisodeProductionAssets({
        appliedPreviewItemIds,
        episode,
        episodeTableShots,
        preview: productionBiblePreview,
        projectId: project.id,
        projectTitle: project.title,
    });
    const packageSegments = useMemo(
        () =>
            buildStoryboardProductionSegments({
                episode,
                episodeTableShots,
                sceneOptions,
                scriptSnapshot,
            }),
        [episode, episodeTableShots, sceneOptions, scriptSnapshot],
    );
    const tabs = episodeModules.map((module, index) => ({
        ...module,
        status: buildEpisodeModuleNavStatus({
            appliedPreviewItemIds,
            artDisplay,
            boundCanvas,
            directorDisplay,
            episodeTableShots,
            hasScript,
            key: module.key,
            productionBiblePreview,
            storyboardDisplay,
            storyboardPreview,
            videoPreview,
        }),
        step: index + 1,
    }));
    const moduleConfig = buildEpisodeModuleConfig({
        activeModule,
        appliedPreviewItemIds,
        applyingPreviewIds,
        boundCanvas,
        currentScene,
        currentSceneState,
        directorReviewStates,
        episode,
        episodeTableShots,
        hasScript,
        onApplyPreview,
        onGeneratePreview,
        onOpenCanvas,
        onApproveStageReview,
        onUpdateDirectorReviewState,
        onCancelStage,
        onOptimizeScript,
        onRunStage,
        onRunStoryboardScene,
        onSaveScript,
        previews,
        runningStageIds,
        scriptOptimizing,
        sceneOptions,
        scriptDraft,
        scriptSnapshot,
        stageOutputs,
        stageSceneRows,
        workflowRun,
    });
    const filteredRows = filterEpisodeRows(moduleConfig.rows, activeFilter);
    const scriptEditor =
        activeModule === "script" ? (
            <section className="rounded-xl border border-slate-700/70 bg-black/20">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                    <div>
                        <h3 className="text-sm font-semibold text-cyan-100">本集剧本正文</h3>
                        <p className="mt-1 text-xs text-slate-500">默认阅读，确认内容后再进入导演分析。</p>
                    </div>
                    <button type="button" className="rounded-md border border-slate-700 bg-slate-950/55 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/70 hover:text-cyan-100" onClick={() => setScriptEditing((value) => !value)}>
                        {scriptEditing || !hasScript ? "阅读正文" : "编辑正文"}
                    </button>
                </div>
                <div className="p-4">
                    {scriptEditing || !hasScript ? (
                        <Input.TextArea className="!min-h-[420px] !bg-slate-950/70 !text-base !leading-8 !text-slate-100" value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} placeholder="粘贴本集剧本，保存后再运行导演分析。" />
                    ) : (
                        <article className="thin-scrollbar max-h-[58vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/65 px-5 py-4 text-base leading-8 text-slate-200">{scriptSnapshot || scriptDraft || "暂无本集剧本。"}</article>
                    )}
                </div>
            </section>
        ) : undefined;
    const prepareReferenceGeneration = () => {
        message.info("已准备生成参数；可直接进入生图工作台生成参考图。");
    };
    const openImageWorkbenchWithPrompt = (payload: { assetId?: string; briefId?: string; prompt: string; title?: string }) => {
        const params = new URLSearchParams({
            projectId: project.id,
            projectTitle: project.title,
            episodeId: episode.id,
            episodeTitle: episode.title,
            source: "episode-workbench",
            prompt: payload.prompt,
        });
        if (payload.assetId) params.set("assetId", payload.assetId);
        if (payload.briefId) params.set("briefId", payload.briefId);
        if (payload.title) params.set("title", payload.title);
        const href = `/image?${params.toString()}`;
        router.push(href);
        window.setTimeout(() => {
            if (window.location.pathname !== "/image") window.location.assign(href);
        }, 120);
    };
    return (
        <div className="min-h-full bg-[radial-gradient(circle_at_0%_0%,rgba(20,184,196,0.16),transparent_30%),linear-gradient(180deg,#071017_0%,#050b10_46%,#03070b_100%)]">
            <EpisodeProductionHeader boundCanvas={boundCanvas} currentPhase={currentPhase} episode={episode} nextActionText={nextActionText} onBackProject={onBackProject} onOpenCanvas={onOpenCanvas} project={project} />
            <div className="px-6 py-5 xl:px-8">
                {flowNotice ? (
                    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${flowNoticeClass(flowNotice.tone)}`}>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold">{activeModule === flowNotice.module ? flowNotice.title.replace(/^下一步：/, "当前步骤：") : flowNotice.title}</div>
                            <div className="mt-1 break-words text-sm leading-6 opacity-85">{flowNotice.text}</div>
                        </div>
                        {activeModule === flowNotice.module ? null : <button type="button" className="rounded-md border border-current bg-transparent px-3 py-1.5 text-sm font-medium hover:bg-white/10" onClick={() => onModuleChange(flowNotice.module)}>
                            {flowNotice.actionLabel}
                        </button>}
                    </div>
                ) : null}
                <div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
                    <EpisodeModuleTabs activeModule={activeModule} onChange={onModuleChange} tabs={tabs} />
                    <div className="min-w-0">
                        {activeModule === "assets" ? (
                            <EpisodeAssetsModulePage
                                appliedPreviewItemIds={appliedPreviewItemIds}
                                applyingPreviewIds={applyingPreviewIds}
                                assets={assetRows}
                                episode={episode}
                                onApplyPreview={onApplyPreview}
                                onApproveStageReview={onApproveStageReview}
                                onBindAsset={bindExtractedAsset}
                                onCancelStage={onCancelStage}
                                onGeneratePreview={onGeneratePreview}
                                onOpenDirector={() => onModuleChange("director")}
                                onOpenImageWorkbench={openImageWorkbenchWithPrompt}
                                onPrepareGenerate={prepareReferenceGeneration}
                                onRunStage={onRunStage}
                                onUploadAssetImage={uploadExtractedAssetImage}
                                preview={productionBiblePreview}
                                projectTitle={project.title}
                                runningStageIds={runningStageIds}
                                stageActionHint={assetStageActionHint}
                                stageOutputs={stageOutputs}
                                workflowRun={workflowRun}
                            />
                        ) : activeModule === "storyboard" ? (
                            <EpisodeStoryboardPackagePage
                                episode={episode}
                                appliedPreviewItemIds={appliedPreviewItemIds}
                                applyingPreviewIds={applyingPreviewIds}
                                currentSceneState={currentSceneState}
                                hasCanvas={Boolean(boundCanvas)}
                                onApplyPreview={onApplyPreview}
                                onApproveStoryboardScene={onApproveStoryboardScene}
                                onGeneratePreview={onGeneratePreview}
                                onOpenAssets={() => onModuleChange("assets")}
                                onOpenCanvas={onOpenCanvas}
                                onRunStoryboardScene={onRunStoryboardScene}
                                onSummarizeStoryboardScenes={onSummarizeStoryboardScenes}
                                previews={previews}
                                projectTitle={project.title}
                                runningStoryboard={currentSceneState?.status === "running"}
                                segments={packageSegments}
                            />
                        ) : activeModule === "canvas" ? (
                            <EpisodeCanvasHandoffPage
                                boundCanvas={boundCanvas}
                                episode={episode}
                                onCreateCanvas={onCreateCanvas}
                                onImportPackage={onImportCanvasPackage}
                                onOpenAssets={() => onModuleChange("assets")}
                                onOpenCanvas={onOpenCanvas}
                                onOpenStoryboard={() => onModuleChange("storyboard")}
                                projectTitle={project.title}
                                segments={packageSegments}
                            />
                        ) : (
                            <EpisodeModulePanel config={moduleConfig} editorSlot={scriptEditor} filteredRows={filteredRows} activeFilter={activeFilter} onFilterChange={setActiveFilter} onOpenDetail={onOpenDetail} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function buildWorkbenchFlowNotice({
    artDisplay,
    boundCanvas,
    directorDisplay,
    hasScript,
    productionBiblePreview,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    artDisplay?: ReturnType<typeof summarizeWorkflowStageDisplayState>;
    boundCanvas?: CanvasProject;
    directorDisplay?: ReturnType<typeof summarizeWorkflowStageDisplayState>;
    hasScript: boolean;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    storyboardDisplay?: ReturnType<typeof summarizeWorkflowStageDisplayState>;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}): { actionLabel: string; module: EpisodeModuleKey; text: string; title: string; tone: "amber" | "cyan" | "red" } | undefined {
    if (!hasScript) return { actionLabel: "导入剧本", module: "script", text: "当前缺少本集剧本，后续导演分析、资产与分镜都会被阻塞。", title: "流程卡在剧本输入", tone: "amber" };
    if (directorDisplay?.displayStatus === "running") return { actionLabel: "查看运行", module: "director", text: "导演分析正在运行，完成前资产与分镜不会自动扣费推进。", title: "正在等待导演分析", tone: "cyan" };
    if (directorDisplay?.displayStatus === "error" || directorDisplay?.displayStatus === "rejected") return { actionLabel: "处理导演分析", module: "director", text: directorDisplay.summaryText || "导演分析异常，需要处理后才能继续。", title: "流程卡在导演分析", tone: "red" };
    if (directorDisplay?.displayStatus === "review" || directorDisplay?.displayStatus === "partial") return { actionLabel: "确认导演分析", module: "director", text: "导演分析已有结果，但仍有风险提示或分镜建议需要确认；确认后再进入资产与生图更稳。", title: "下一步需要用户确认", tone: "amber" };
    if (artDisplay?.displayStatus === "running") return { actionLabel: "查看资产阶段", module: "assets", text: "资产与生图阶段正在运行，可查看实时进度，等待结果返回。", title: "正在等待资产分析", tone: "cyan" };
    if (artDisplay?.displayStatus === "blocked" || artDisplay?.displayStatus === "error" || artDisplay?.displayStatus === "rejected") return { actionLabel: "处理资产阶段", module: "assets", text: artDisplay.blockedReason || artDisplay.summaryText || "资产与生图阶段存在阻塞，需要处理后才能进入分镜。", title: "流程卡在资产与生图", tone: "red" };
    if (!productionBiblePreview && artDisplay?.displayStatus !== "approved") return { actionLabel: "进入资产与生图", module: "assets", text: "导演分析已完成，下一步需要提取角色、场景、道具和服化道资产。", title: "下一步：资产与生图", tone: "cyan" };
    if (storyboardDisplay?.displayStatus === "running") return { actionLabel: "查看分镜阶段", module: "storyboard", text: "分镜生产包正在生成，可查看当前场次进度。", title: "正在等待分镜生产包", tone: "cyan" };
    if (storyboardDisplay?.displayStatus === "blocked" || storyboardDisplay?.displayStatus === "error" || storyboardDisplay?.displayStatus === "rejected") return { actionLabel: "处理分镜阶段", module: "storyboard", text: storyboardDisplay.blockedReason || storyboardDisplay.summaryText || "分镜阶段存在阻塞，需要处理后才能承接到画布。", title: "流程卡在分镜生产包", tone: "red" };
    if (!storyboardPreview) return { actionLabel: "进入分镜生产包", module: "storyboard", text: "资产阶段处理后，需要生成分镜生产包，再决定是否承接到画布。", title: "下一步：分镜生产包", tone: "cyan" };
    if (!boundCanvas && !videoPreview) return { actionLabel: "进入画布承接", module: "canvas", text: "分镜生产包已准备好，下一步可创建承接画布或生成待落地节点预览。", title: "等待承接到画布", tone: "amber" };
    return undefined;
}

function flowNoticeClass(tone: "amber" | "cyan" | "red") {
    if (tone === "red") return "border-rose-400/40 bg-rose-400/10 text-rose-100";
    if (tone === "amber") return "border-amber-400/35 bg-amber-400/10 text-amber-100";
    return "border-cyan-400/35 bg-cyan-400/10 text-cyan-100";
}
