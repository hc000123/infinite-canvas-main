"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "antd";

import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode, ScriptScene, StructuredEpisodeScript } from "../../../../../../canvas/utils/script-management";
import type { StoryboardTableShot } from "../../../../../../canvas/utils/storyboard-management";
import { videoWorkflowHref } from "../../../../../../original-workflow/video-workflow-routing";
import { type AgentWorkflowMappingPreview, type AgentWorkflowRunRecord, type AgentWorkflowSceneRunState, type AgentWorkflowStageOutput } from "../../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../../agent-runner-workflow-display";
import { EpisodeCanvasHandoffPage } from "./episode-canvas-handoff-page";
import type { CanvasHandoffImportTarget } from "./episode-canvas-handoff-utils";
import { EpisodeStoryboardPackagePage } from "./episode-storyboard-package-page";
import { EpisodeAssetsModulePage } from "./episode-assets-module-page";
import { EpisodeModulePanel, type EpisodeDetailRecord } from "./episode-module-panel";
import { EpisodeProductionHeader } from "./episode-production-header";
import { EpisodeModuleTabs } from "./episode-workflow-panels";
import { buildAssetStageActionHint, buildEpisodeModuleNavStatus, buildEpisodeNextActionText, buildEpisodePhaseText, episodeModules, latestPreview, previewCounts, type EpisodeModuleKey } from "../episode-workbench-display";
import { buildEpisodeModuleConfig, filterEpisodeRows, type DirectorReviewState } from "../episode-module-config";
import { buildStoryboardProductionSegments, buildStoryboardProductionSegmentsFromWorkflowOutput } from "../storyboard-production-segments";
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
    fullWorkflowRunning,
    hasScript,
    onApplyPreview,
    onBackProject,
    onCreateCanvas,
    onGeneratePreview,
    onImportCanvasPackage,
    onModuleChange,
    onOpenCanvas,
    onOpenDetail,
    onRunFullWorkflow,
    onApproveStageReview,
    onApproveStoryboardScene,
    onCancelStage,
    onCancelStoryboardScene,
    onOptimizeScript,
    onUpdateDirectorReviewState,
    onRunStage,
    onRunStoryboardScene,
    onSaveScript,
    onSaveStageResult,
    onSummarizeStoryboardScenes,
    project,
    previews,
    runningSceneKeys,
    runningStageIds,
    runningStageDrafts,
    sceneOptions,
    scriptOptimizing,
    scriptDraft,
    scriptSnapshot,
    structuredScriptDraft,
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
    fullWorkflowRunning: boolean;
    hasScript: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onBackProject: () => void;
    onCreateCanvas: () => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onImportCanvasPackage: (pkg: CanvasHandoffImportTarget) => void;
    onModuleChange: (module: EpisodeModuleKey) => void;
    onOpenCanvas: () => void;
    onOpenDetail: (record: EpisodeDetailRecord) => void;
    onRunFullWorkflow: () => void;
    onApproveStageReview: (stageId: string, note: string) => void;
    onApproveStoryboardScene: () => void;
    onCancelStage: (stageId: string) => void;
    onCancelStoryboardScene: () => void;
    onOptimizeScript: () => void;
    onUpdateDirectorReviewState: (rowId: string, state: DirectorReviewState) => void;
    onRunStage: (stageId: string) => void;
    onRunStoryboardScene: () => void;
    onSaveScript: () => void;
    onSaveStageResult: (stageId: string) => void;
    onSummarizeStoryboardScenes: () => void;
    project: { id: string; title: string };
    previews: AgentWorkflowMappingPreview[];
    runningSceneKeys: Record<string, boolean>;
    runningStageIds: Record<string, boolean>;
    runningStageDrafts: Record<string, string>;
    sceneOptions: EpisodeSceneOption[];
    scriptOptimizing: boolean;
    scriptDraft: string;
    scriptSnapshot: string;
    structuredScriptDraft?: StructuredEpisodeScript;
    setScriptDraft: (value: string) => void;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    stageSceneRows: ScriptScene[];
    workflowRun?: AgentWorkflowRunRecord;
}) {
    const [activeFilter, setActiveFilter] = useState("全部");
    const [scriptEditing, setScriptEditing] = useState(false);
    useEffect(() => setActiveFilter("全部"), [activeModule]);

    const storyboardSceneKeys = sceneOptions.map((scene) => scene.sceneKey);
    const directorDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "director-analysis", []) : undefined;
    const artDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "art-design", []) : undefined;
    const storyboardDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "seedance-storyboard", storyboardSceneKeys) : undefined;
    const artStageState = workflowRun?.stageStates.find((stage) => stage.stageId === "art-design");
    const directorStaleRunning = directorDisplay?.displayStatus === "running" && !runningStageIds["director-analysis"];
    const assetStaleRunning = artDisplay?.displayStatus === "running" && !runningStageIds["art-design"];
    const storyboardActiveRunning = Boolean(runningStageIds["seedance-storyboard"]) || Object.values(runningSceneKeys).some(Boolean);
    const storyboardStaleRunning = storyboardDisplay?.displayStatus === "running" && !storyboardActiveRunning;
    const productionBiblePreview = latestPreview(previews, "production_bible");
    const storyboardStageOutput = stageOutputs["seedance-storyboard"];
    const productionBiblePreviewCounts = productionBiblePreview ? previewCounts(productionBiblePreview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const storyboardPreview = latestPreview(previews, "storyboard_table");
    const videoPreview = latestPreview(previews, "video_node");
    const assetStageActionHint = buildAssetStageActionHint({
        allowBlockedRun: Boolean(hasScript && artDisplay?.displayStatus === "blocked" && artStageState?.dependsOnStageIds.includes("director-analysis")),
        display: artDisplay,
        errorMessage: artStageState?.errorMessage,
        hasOutput: Boolean(stageOutputs["art-design"]),
        isRunning: Boolean(runningStageIds["art-design"]),
        outputHasStateMismatch: Boolean(stageOutputs["art-design"] && artDisplay?.stageStatus !== "review" && artDisplay?.displayStatus !== "approved" && !productionBiblePreview),
        outputNeedsReview: Boolean(stageOutputs["art-design"] && artDisplay?.stageStatus === "review" && !productionBiblePreview),
        previewPending: productionBiblePreviewCounts.pending,
        previewTotal: productionBiblePreviewCounts.total,
        staleRunning: assetStaleRunning,
    });
    const currentPhase = directorStaleRunning
        ? "导演分析运行中断"
        : assetStaleRunning
          ? "资产分析运行中断"
          : storyboardStaleRunning
            ? "分镜生产包运行中断"
            : buildEpisodePhaseText({ artDisplay, directorDisplay, episodeTableShots, hasScript, productionBiblePreview, storyboardDisplay, storyboardPreview, videoPreview });
    const nextActionText = directorStaleRunning
        ? "上一次导演分析没有完成，请清理状态后重新分析。"
        : assetStaleRunning
          ? "上一次资产分析没有完成，请清理状态后重新运行。"
          : storyboardStaleRunning
            ? "上一次分镜生产包没有完成，请清理状态后重新生成。"
            : buildEpisodeNextActionText({ appliedPreviewItemIds, artDisplay, directorDisplay, episodeTableShots, hasScript, productionBiblePreview, storyboardDisplay, storyboardPreview, videoPreview });
    const flowNotice = directorStaleRunning
        ? undefined
        : assetStaleRunning || storyboardStaleRunning
          ? undefined
        : buildWorkbenchFlowNotice({
              allowBlockedArtRun: assetStageActionHint.blocked !== true,
              artDisplay,
              artErrorMessage: artStageState?.errorMessage,
              directorDisplay,
              hasScript,
              productionBiblePreview,
              productionBiblePreviewPending: productionBiblePreviewCounts.pending,
              storyboardDisplay,
              storyboardPreview,
              videoPreview,
          });
    const { assetRows, bindExtractedAsset, generateExtractedAssetImages, reviewExtractedAssetImage, uploadExtractedAssetImage } = useEpisodeProductionAssets({
        appliedPreviewItemIds,
        episode,
        episodeTableShots,
        preview: productionBiblePreview,
        projectId: project.id,
        projectTitle: project.title,
    });
    const packageSegments = useMemo(
        () => {
            const tableSegments = buildStoryboardProductionSegments({
                episode,
                episodeTableShots,
                sceneOptions,
                scriptSnapshot,
            });
            return tableSegments.length ? tableSegments : buildStoryboardProductionSegmentsFromWorkflowOutput({ episode, output: storyboardStageOutput, sceneOptions, scriptSnapshot });
        },
        [episode, episodeTableShots, sceneOptions, scriptSnapshot, storyboardStageOutput],
    );
    const tabs = episodeModules.map((module, index) => ({
        ...module,
        status:
            directorStaleRunning && module.key === "director"
                ? { text: "需清理", tone: "amber" as const }
                : assetStaleRunning && module.key === "assets"
                  ? { text: "需清理", tone: "amber" as const }
                  : storyboardStaleRunning && module.key === "storyboard"
                    ? { text: "需清理", tone: "amber" as const }
                : buildEpisodeModuleNavStatus({
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
        onSaveStageResult,
        previews,
        runningStageIds,
        runningStageDrafts,
        scriptOptimizing,
        sceneOptions,
        scriptDraft,
        scriptSnapshot,
        stageOutputs,
        stageSceneRows,
        workflowRun,
    });
    const topNotice = flowNotice && activeModule !== flowNotice.module ? flowNotice : moduleConfig.notice ? { ...moduleConfig.notice, module: activeModule } : undefined;
    const filteredRows = filterEpisodeRows(moduleConfig.rows, activeFilter);
    const hasPendingScriptDraft = Boolean(scriptSnapshot.trim() && scriptDraft.trim() && scriptDraft.trim() !== scriptSnapshot.trim());
    const visibleStructuredScript = hasPendingScriptDraft ? structuredScriptDraft : episode.structuredScript;
    const legacyWorkbenchVisible = false;
    const scriptEditor =
        activeModule === "script" ? (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.025]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-cyan-100">本集剧本正文</h3>
                            {visibleStructuredScript ? <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">{hasPendingScriptDraft ? "待确认结构稿" : "AI结构稿"} · {visibleStructuredScript.scenes.length} 场</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{hasPendingScriptDraft ? "左侧原稿，右侧待确认优化稿；确认提交后再进入导演分析。" : "默认阅读，确认内容后再进入导演分析。"}</p>
                    </div>
                    <button type="button" className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-400/45 hover:text-cyan-100" onClick={() => setScriptEditing((value) => !value)}>
                        {scriptEditing || !hasScript ? "阅读正文" : "编辑正文"}
                    </button>
                </div>
                <div className="p-4">
                    {scriptEditing || !hasScript ? (
                        <Input.TextArea className="!min-h-[420px] !bg-slate-950/70 !text-base !leading-8 !text-slate-100" value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} placeholder="粘贴本集剧本，保存后再运行导演分析。" />
                    ) : hasPendingScriptDraft ? (
                        <ScriptComparisonView draft={scriptDraft} snapshot={scriptSnapshot} />
                    ) : (
                        <ScriptTextPane label="正文" text={scriptDraft || scriptSnapshot || "暂无本集剧本。"} />
                    )}
                </div>
            </section>
        ) : undefined;
    return (
        <div className="min-h-full bg-[#05080d] bg-[linear-gradient(rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px),radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.12),transparent_32%)] [background-size:44px_44px,44px_44px,100%_100%]">
            <EpisodeProductionHeader
                boundCanvas={boundCanvas}
                canRunFullWorkflow={legacyWorkbenchVisible && hasScript}
                currentPhase={legacyWorkbenchVisible ? currentPhase : "已切换到视频工作流"}
                episode={episode}
                fullWorkflowRunning={fullWorkflowRunning}
                legacyWorkflowVisible={legacyWorkbenchVisible}
                nextActionText={legacyWorkbenchVisible ? nextActionText : "本集生产台内置四阶段流程已暂时收起，请在独立视频工作流控制台运行导演 / 资产 / 分镜。"}
                onBackProject={onBackProject}
                onOpenCanvas={onOpenCanvas}
                onRunFullWorkflow={onRunFullWorkflow}
                project={project}
            />
            <div className="px-5 py-5 xl:px-6">
                {!legacyWorkbenchVisible ? (
                    <OriginalWorkflowReplacementPanel episode={episode} projectId={project.id} />
                ) : topNotice ? (
                    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-[0_12px_44px_rgba(0,0,0,0.18)] backdrop-blur-xl ${flowNoticeClass(topNotice.tone || "slate")}`}>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold">{topNotice.title}</div>
                            <div className="mt-1 break-words text-sm leading-6 opacity-85">{topNotice.text}</div>
                        </div>
                        {"actionLabel" in topNotice && topNotice.actionLabel ? (
                            <button type="button" className="rounded-lg border border-current bg-transparent px-3 py-1.5 text-sm font-medium hover:bg-white/10" onClick={() => ("onAction" in topNotice && topNotice.onAction ? topNotice.onAction() : onModuleChange(topNotice.module))}>
                                {topNotice.actionLabel}
                            </button>
                        ) : null}
                    </div>
                ) : null}
                {legacyWorkbenchVisible ? (
                    <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
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
                                    onGenerateImage={generateExtractedAssetImages}
                                    onOpenDirector={() => onModuleChange("director")}
                                    onReviewAsset={reviewExtractedAssetImage}
                                    onRunStage={onRunStage}
                                    onSaveStageResult={onSaveStageResult}
                                    onUploadAssetImage={uploadExtractedAssetImage}
                                    preview={productionBiblePreview}
                                    projectId={project.id}
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
                                    assetRows={assetRows}
                                    currentSceneState={currentSceneState}
                                    onApplyPreview={onApplyPreview}
                                    onApproveStoryboardScene={onApproveStoryboardScene}
                                    onGeneratePreview={onGeneratePreview}
                                    onOpenAssets={() => onModuleChange("assets")}
                                    onCancelStoryboardScene={onCancelStoryboardScene}
                                    onRunStoryboardScene={onRunStoryboardScene}
                                    onSummarizeStoryboardScenes={onSummarizeStoryboardScenes}
                                    previews={previews}
                                    projectTitle={project.title}
                                    runningStoryboard={storyboardActiveRunning || currentSceneState?.status === "running"}
                                    staleRunning={storyboardStaleRunning}
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
                                <EpisodeModulePanel config={moduleConfig} editorSlot={scriptEditor} filteredRows={filteredRows} activeFilter={activeFilter} showRows={activeModule !== "script"} onFilterChange={setActiveFilter} onOpenDetail={onOpenDetail} />
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function OriginalWorkflowReplacementPanel({ episode, projectId }: { episode: ScriptEpisode; projectId: string }) {
    return (
        <section className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.055] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
            <div className="max-w-3xl">
                <div className="text-sm font-semibold text-cyan-100">本集生产台工作流已暂时收起</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">导演分析、资产提示词、Seedance 提示词和 Copy-only 拆分先统一交给独立“视频工作流”控制台处理。这里暂时只保留项目入口和关联画布入口，避免两套流程同时推进造成混乱。</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <a className="inline-flex h-9 items-center justify-center rounded-xl bg-cyan-400 px-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300" href={videoWorkflowHref(episode.order, projectId, episode.id)}>
                        打开视频工作流
                    </a>
                </div>
            </div>
        </section>
    );
}

function ScriptComparisonView({ draft, snapshot }: { draft: string; snapshot: string }) {
    return (
        <div className="grid gap-3 xl:grid-cols-2">
            <ScriptTextPane label="原稿" text={snapshot} />
            <ScriptTextPane accent label="优化稿" text={draft} />
        </div>
    );
}

function ScriptTextPane({ accent = false, label, text }: { accent?: boolean; label: string; text: string }) {
    return (
        <div className={`min-h-[420px] overflow-hidden rounded-lg border ${accent ? "border-cyan-400/25 bg-cyan-400/[0.035]" : "border-white/[0.07] bg-[#060a10]/72"}`}>
            <div className={`flex items-center justify-between gap-3 border-b px-4 py-2 ${accent ? "border-cyan-400/15 text-cyan-100" : "border-white/[0.06] text-slate-300"}`}>
                <span className="text-xs font-semibold">{label}</span>
                <span className="shrink-0 text-xs text-slate-500">{text.length} 字</span>
            </div>
            <article className="thin-scrollbar max-h-[58vh] overflow-auto whitespace-pre-wrap break-words px-5 py-4 text-base leading-8 text-slate-200">{text}</article>
        </div>
    );
}

function buildWorkbenchFlowNotice({
    allowBlockedArtRun,
    artDisplay,
    artErrorMessage,
    directorDisplay,
    hasScript,
    productionBiblePreview,
    productionBiblePreviewPending,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    allowBlockedArtRun?: boolean;
    artDisplay?: ReturnType<typeof summarizeWorkflowStageDisplayState>;
    artErrorMessage?: string;
    directorDisplay?: ReturnType<typeof summarizeWorkflowStageDisplayState>;
    hasScript: boolean;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    productionBiblePreviewPending: number;
    storyboardDisplay?: ReturnType<typeof summarizeWorkflowStageDisplayState>;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}): { actionLabel: string; module: EpisodeModuleKey; text: string; title: string; tone: "amber" | "cyan" | "red" } | undefined {
    if (!hasScript) return { actionLabel: "导入剧本", module: "script", text: "当前缺少本集剧本，后续导演分析、资产与分镜都会被阻塞。", title: "流程卡在剧本输入", tone: "amber" };
    if (directorDisplay?.displayStatus === "running") return { actionLabel: "查看运行", module: "director", text: "导演分析正在运行，完成前资产与分镜不会自动扣费推进。", title: "正在等待导演分析", tone: "cyan" };
    if (directorDisplay?.displayStatus === "error" || directorDisplay?.displayStatus === "rejected")
        return { actionLabel: "处理导演分析", module: "director", text: directorDisplay.summaryText || "导演分析异常，需要处理后才能继续。", title: "流程卡在导演分析", tone: "red" };
    if (directorDisplay?.displayStatus === "review" || directorDisplay?.displayStatus === "partial")
        return { actionLabel: "确认导演分析", module: "director", text: "导演分析已有结果，但仍有风险提示或分镜建议需要确认；确认后再进入资产与生图更稳。", title: "下一步需要用户确认", tone: "amber" };
    if (artDisplay?.displayStatus === "running") return { actionLabel: "查看资产阶段", module: "assets", text: "资产与生图阶段正在运行，可查看实时进度，等待结果返回。", title: "正在等待资产分析", tone: "cyan" };
    if ((artDisplay?.displayStatus === "blocked" && !allowBlockedArtRun) || artDisplay?.displayStatus === "error" || artDisplay?.displayStatus === "rejected")
        return { actionLabel: "处理资产阶段", module: "assets", text: artDisplay.blockedReason || artErrorMessage || artDisplay.summaryText || "资产与生图阶段存在阻塞，需要处理后才能进入分镜。", title: "流程卡在资产与生图", tone: "red" };
    if (!productionBiblePreview && artDisplay?.displayStatus !== "approved") return { actionLabel: "进入资产与生图", module: "assets", text: "导演分析已完成，下一步需要提取角色、场景、道具和服化道资产。", title: "下一步：资产与生图", tone: "cyan" };
    if (productionBiblePreview && productionBiblePreviewPending > 0) return { actionLabel: "写入设定库", module: "assets", text: `已有资产清单，${productionBiblePreviewPending} 项待写入设定库。`, title: "下一步：写入资产清单", tone: "cyan" };
    if (storyboardDisplay?.displayStatus === "running") return { actionLabel: "查看分镜阶段", module: "storyboard", text: "分镜生产包正在生成，可查看当前场次进度。", title: "正在等待分镜生产包", tone: "cyan" };
    if (storyboardDisplay?.displayStatus === "blocked" || storyboardDisplay?.displayStatus === "error" || storyboardDisplay?.displayStatus === "rejected")
        return { actionLabel: "处理分镜阶段", module: "storyboard", text: storyboardDisplay.blockedReason || storyboardDisplay.summaryText || "分镜阶段存在阻塞，需要处理后再生成视频配置。", title: "流程卡在分镜生产包", tone: "red" };
    if (!storyboardPreview) return { actionLabel: "进入分镜生产包", module: "storyboard", text: "资产阶段处理后，需要生成分镜生产包，并在右侧确认视频提示词。", title: "下一步：分镜生产包", tone: "cyan" };
    if (!videoPreview) return { actionLabel: "生成视频配置", module: "storyboard", text: "分镜生产包已准备好，下一步在分镜页统一生成视频配置；画布暂时只是可选出口。", title: "下一步：视频配置", tone: "cyan" };
    return undefined;
}

function flowNoticeClass(tone: "amber" | "cyan" | "green" | "red" | "slate") {
    if (tone === "red") return "border-rose-400/40 bg-rose-400/10 text-rose-100";
    if (tone === "green") return "border-emerald-400/35 bg-emerald-400/10 text-emerald-100";
    if (tone === "amber") return "border-amber-400/35 bg-amber-400/10 text-amber-100";
    if (tone === "slate") return "border-slate-700 bg-slate-900/60 text-slate-200";
    return "border-cyan-400/35 bg-cyan-400/10 text-cyan-100";
}
