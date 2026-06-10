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
import { EpisodeCanvasHandoffPage, type CanvasHandoffImportTarget } from "./episode-canvas-handoff-page";
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
    onUpdateDirectorReviewState,
    onRunStage,
    onRunStoryboardScene,
    onSaveScript,
    onSummarizeStoryboardScenes,
    project,
    previews,
    runningStageIds,
    sceneOptions,
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
    onUpdateDirectorReviewState: (rowId: string, state: DirectorReviewState) => void;
    onRunStage: (stageId: string) => void;
    onRunStoryboardScene: () => void;
    onSaveScript: () => void;
    onSummarizeStoryboardScenes: () => void;
    project: { id: string; title: string };
    previews: AgentWorkflowMappingPreview[];
    runningStageIds: Record<string, boolean>;
    sceneOptions: EpisodeSceneOption[];
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
        previewPending: productionBiblePreviewCounts.pending,
        previewTotal: productionBiblePreviewCounts.total,
    });
    const currentPhase = buildEpisodePhaseText({ artDisplay, boundCanvas, directorDisplay, episodeTableShots, hasScript, productionBiblePreview, storyboardDisplay, storyboardPreview, videoPreview });
    const nextActionText = buildEpisodeNextActionText({ appliedPreviewItemIds, artDisplay, boundCanvas, directorDisplay, episodeTableShots, hasScript, productionBiblePreview, storyboardDisplay, storyboardPreview, videoPreview });
    const { assetRows, bindExtractedAsset } = useEpisodeProductionAssets({
        appliedPreviewItemIds,
        episode,
        episodeTableShots,
        preview: productionBiblePreview,
        projectId: project.id,
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
        onRunStage,
        onRunStoryboardScene,
        onSaveScript,
        previews,
        runningStageIds,
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
            <details className="rounded-lg border border-slate-700/70 bg-black/20 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-cyan-200">编辑 / 导入本集剧本</summary>
                <div className="mt-3 grid gap-3">
                    <Input.TextArea className="!bg-slate-950/70 !text-slate-100" rows={7} value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} placeholder="粘贴本集剧本，保存后进入导演分析。" />
                </div>
            </details>
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
                                onGeneratePreview={onGeneratePreview}
                                onOpenImageWorkbench={openImageWorkbenchWithPrompt}
                                onPrepareGenerate={prepareReferenceGeneration}
                                onRunStage={onRunStage}
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
