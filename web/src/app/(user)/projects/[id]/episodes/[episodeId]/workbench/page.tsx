"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, App, Button, Card, Collapse, Empty, Input, Space, Tag } from "antd";
import { CheckCircle2, Play, XCircle } from "lucide-react";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { buildAssetVersionReference } from "../../../../../assets/asset-version-references";
import { useCanvasStore, type CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import { useProductionBibleStore } from "../../../../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../../../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../../../../canvas/stores/use-storyboard-store";
import type { ScriptEpisode, ScriptScene } from "../../../../../canvas/utils/script-management";
import { canvasEpisodeContextFromEpisode } from "../../../../../canvas/utils/canvas-episode-context";
import { buildCanvasProjectPresetFromConfig } from "../../../../../canvas/utils/canvas-project-preset";
import type { ProductionBibleItem } from "../../../../../canvas/utils/production-bible";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import { workflowStageDetail, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import { useAgentRunnerStore } from "../../../../use-agent-runner-store";
import { evaluateWorkflowQualityGates, getWorkflowStageRequiredReadings, type WorkflowGateCheckResult, type WorkflowRequiredReading } from "../../../../workflow-quality-gates";
import {
    canGenerateWorkflowMappingPreview,
    getWorkflowStageSceneProgress,
    summarizeWorkflowStageDisplayState,
    workflowMappingPreviewItemKey,
    workflowStageStatusLabel,
    type AgentWorkflowDisplayStatus,
    type AgentWorkflowMappingPreview,
    type AgentWorkflowMappingPreviewItem,
    type AgentWorkflowRunRecord,
    type AgentWorkflowSceneRunState,
    type AgentWorkflowStageOutput,
    type AgentWorkflowStageState,
} from "../../../../agent-runner";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";
import { useEpisodeWorkbenchState, type EpisodeSceneOption } from "./use-episode-workbench-state";
import { useEpisodeWorkbenchPreviewActions } from "./use-episode-workbench-preview-actions";
import { useEpisodeWorkbenchRunActions } from "./use-episode-workbench-run-actions";
import { EpisodeAssetsModulePage } from "./components/episode-assets-module-page";
import { EpisodeCanvasHandoffPage, type CanvasHandoffImportTarget } from "./components/episode-canvas-handoff-page";
import { EpisodeStoryboardPackagePage } from "./components/episode-storyboard-package-page";
import { EpisodeDetailDrawer, EpisodeModulePanel, EpisodeProgress, EpisodeStatusPill, episodeToneTextClass, type EpisodeDetailRecord, type EpisodeModuleConfig, type EpisodeModuleRow, type EpisodeStatusTone } from "./components/episode-module-panel";
import { buildStageOutputDigest, findDigestSection, findOutputKeywordLine, StageOutputDigest } from "./components/stage-output-digest";
import { buildStoryboardProductionSegments, type StoryboardStorySegment } from "./storyboard-production-segments";

const stageCopy: Record<string, { title: string; agent: string; input: string; output: string; previewTargets: Array<AgentWorkflowMappingPreview["targetType"]> }> = {
    "director-analysis": {
        title: "导演分析",
        agent: "导演分析 Agent",
        input: "本集剧本",
        output: "导演分析、讲戏本、人物清单、场景清单、互动道具清单",
        previewTargets: [],
    },
    "art-design": {
        title: "服化道美术设计",
        agent: "美术设计 Agent",
        input: "导演分析产物、人物 / 场景 / 道具清单、art-design skill / template / examples",
        output: "人物设定提示词、场景 2x2 规划提示词、道具提示词、服化道提示词",
        previewTargets: ["production_bible"],
    },
    "seedance-storyboard": {
        title: "Seedance 分镜",
        agent: "分镜 Agent",
        input: "本集剧本、导演讲戏本、美术设定、参考资产、Seedance 方法论、industrial-quality-rules",
        output: "场次视觉 DNA、生成 P / 镜头 P 拆分表、单 P 任务卡、Seedance 2.0 一键复制提示词",
        previewTargets: ["storyboard_table", "video_node"],
    },
};

type EpisodeModuleKey = "script" | "director" | "assets" | "storyboard" | "canvas";
type EpisodeModuleNavStatus = { detail?: string; text: string; tone: EpisodeStatusTone };
type DirectorReviewState = "confirmed" | "adopted";

type WorkflowStageDisplaySummary = ReturnType<typeof summarizeWorkflowStageDisplayState>;
type EpisodeExtractedAsset = {
    canGenerate: boolean;
    candidates: Asset[];
    description: string;
    episodeLabel: string;
    id: string;
    item?: AgentWorkflowMappingPreviewItem;
    libraryMatchCount: number;
    name: string;
    productionBibleItem?: ProductionBibleItem;
    promptDraft: string;
    referencedShotLabels: string[];
    sourceReason: string;
    status: "已绑定" | "待绑定" | "待生成" | "待确认" | "缺素材";
    tone: EpisodeStatusTone;
    type: "角色" | "场景" | "道具" | "服装";
};

export default function EpisodeProductionWorkbenchPage() {
    const params = useParams<{ id: string; episodeId: string }>();
    const router = useRouter();
    const { message, modal } = App.useApp();
    const projectId = params.id;
    const episodeId = params.episodeId;
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const attachCanvas = useCreativeProjectStore((state) => state.attachCanvas);
    const episode = useScriptStore((state) => state.episodes.find((item) => item.id === episodeId && item.projectId === projectId));
    const scenes = useScriptStore((state) => state.scenes);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const canvases = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const storyboardTableShots = useStoryboardStore((state) => state.tableShots);
    const workflowRuns = useAgentRunnerStore((state) => state.workflowRuns);
    const workflowOutputs = useAgentRunnerStore((state) => state.workflowOutputs);
    const workflowEvidences = useAgentRunnerStore((state) => state.workflowEvidences);
    const workflowMappingPreviews = useAgentRunnerStore((state) => state.workflowMappingPreviews);
    const workflowAppliedPreviewItemIds = useAgentRunnerStore((state) => state.workflowAppliedPreviewItemIds);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const markWorkflowStageReadingsRead = useAgentRunnerStore((state) => state.markWorkflowStageReadingsRead);
    const summarizeApprovedStoryboardScenes = useAgentRunnerStore((state) => state.summarizeApprovedStoryboardScenes);
    const generateWorkflowMappingPreview = useAgentRunnerStore((state) => state.generateWorkflowMappingPreview);
    const applyProductionBiblePreview = useAgentRunnerStore((state) => state.applyProductionBiblePreview);
    const applyStoryboardPreview = useAgentRunnerStore((state) => state.applyStoryboardPreview);
    const applyVideoNodePreview = useAgentRunnerStore((state) => state.applyVideoNodePreview);
    const approveRun = useAgentRunnerStore((state) => state.approveRun);
    const rejectRun = useAgentRunnerStore((state) => state.rejectRun);
    const startWorkflowTextRun = useAgentRunnerStore((state) => state.startWorkflowTextRun);
    const completeWorkflowTextRun = useAgentRunnerStore((state) => state.completeWorkflowTextRun);
    const failWorkflowTextRun = useAgentRunnerStore((state) => state.failWorkflowTextRun);
    const effectiveConfig = useEffectiveConfig();
    const checkAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [scriptDraft, setScriptDraft] = useState("");
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [sceneReviewNotes, setSceneReviewNotes] = useState<Record<string, string>>({});
    const [selectedSceneKey, setSelectedSceneKey] = useState("");
    const [subSceneKey, setSubSceneKey] = useState("");
    const [applyingPreviewIds, setApplyingPreviewIds] = useState<Record<string, boolean>>({});
    const [activeStageIds, setActiveStageIds] = useState<string[]>([]);
    const [activeModule, setActiveModule] = useState<EpisodeModuleKey>("director");
    const [detailRecord, setDetailRecord] = useState<EpisodeDetailRecord | null>(null);
    const [directorReviewStates, setDirectorReviewStates] = useState<Record<string, DirectorReviewState>>({});
    const [initialModuleSynced, setInitialModuleSynced] = useState(false);
    const { boundCanvas, episodeTableShots, hasScript, preset, previews, sceneOptions, scriptSnapshot, stageOutputs, stages, stageSceneRows, workflowRun } = useEpisodeWorkbenchState({
        canvases,
        episode,
        episodeId,
        projectId,
        scenes,
        storyboardTableShots,
        workflowMappingPreviews,
        workflowOutputs,
        workflowRuns,
    });
    const directorOutputText = stageOutputs["director-analysis"]?.rawText || "";

    useEffect(() => {
        if (episode) setScriptDraft(scriptSnapshot);
    }, [episode, scriptSnapshot]);

    useEffect(() => {
        setInitialModuleSynced(false);
    }, [episodeId]);

    useEffect(() => {
        setDirectorReviewStates({});
    }, [directorOutputText, episodeId]);

    useEffect(() => {
        if (!hasScript) {
            setActiveModule("script");
            return;
        }
        if (!initialModuleSynced) {
            setActiveModule("director");
            setInitialModuleSynced(true);
        }
    }, [hasScript, initialModuleSynced]);

    useEffect(() => {
        if (!project || !episode) return;
        ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
    }, [boundCanvas?.id, ensureWorkflowRun, episode, episodeId, preset, project, projectId]);

    useEffect(() => {
        if (!sceneOptions.length) {
            setSelectedSceneKey("");
            return;
        }
        if (!selectedSceneKey || !sceneOptions.some((scene) => scene.sceneKey === selectedSceneKey)) setSelectedSceneKey(sceneOptions[0].sceneKey);
    }, [sceneOptions, selectedSceneKey]);

    useEffect(() => {
        setActiveStageIds(
            stages
                .filter((stage) => {
                    const stageState = workflowRun?.stageStates.find((item) => item.stageId === stage.stageId);
                    const status = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, stage.stageId, stage.stageId === "seedance-storyboard" ? sceneOptions.map((scene) => scene.sceneKey) : []).displayStatus : stageState?.status;
                    if (status === "approved") return Boolean(stageState?.outputId);
                    return workflowRun?.currentStageId === stage.stageId || !status || status === "idle" || status === "review" || status === "running" || status === "rejected" || status === "error" || status === "blocked" || status === "partial";
                })
                .map((stage) => stage.stageId),
        );
    }, [sceneOptions, stages, workflowRun]);

    const selectedBaseScene = sceneOptions.find((scene) => scene.sceneKey === selectedSceneKey);
    const currentScene = selectedBaseScene ? withSubScene(selectedBaseScene, subSceneKey) : undefined;
    const currentSceneState = currentScene ? workflowRun?.sceneStates?.find((scene) => scene.stageId === "seedance-storyboard" && scene.sceneKey === currentScene.sceneKey) : undefined;

    const { runStage, runStoryboardScene, runningStageIds } = useEpisodeWorkbenchRunActions({
        boundCanvas,
        checkAiConfigReady,
        currentScene,
        currentSceneState,
        effectiveConfig,
        ensureWorkflowRun,
        episode: episode as ScriptEpisode,
        episodeId,
        failWorkflowTextRun,
        hasScript,
        message,
        preset,
        projectId,
        projectTitle: project?.title || "",
        scriptSnapshot,
        stageOutputs,
        stages,
        startWorkflowTextRun,
        completeWorkflowTextRun,
        workflowRun,
        workflowRuns,
    });

    const createBoundCanvas = useCallback(() => {
        if (!project || !episode) return "";
        const canvasId = createCanvas(`${episode.title} 承接画布`, buildCanvasProjectPresetFromConfig(effectiveConfig, project.preset), { projectId: project.id, episodeContext: canvasEpisodeContextFromEpisode(project.id, episode, stageSceneRows) });
        attachCanvas(project.id, canvasId);
        message.success("已创建承接画布");
        router.push(`/canvas/${canvasId}`);
        return canvasId;
    }, [attachCanvas, createCanvas, effectiveConfig, episode, message, project, router, stageSceneRows]);

    const { confirmApplyPreview, generatePreview, openCanvasOrCreate, summarizeStoryboardScenes } = useEpisodeWorkbenchPreviewActions({
        applyProductionBiblePreview,
        applyStoryboardPreview,
        applyVideoNodePreview,
        boundCanvas,
        generateWorkflowMappingPreview,
        message,
        modal,
        router,
        setApplyingPreviewIds,
        onCreateCanvas: createBoundCanvas,
        summarizeApprovedStoryboardScenes,
        workflowAppliedPreviewItemIds,
        workflowRun,
    });

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

    const saveScript = () => {
        updateEpisode(episode.id, { summary: scriptDraft });
        message.success("本集剧本已保存");
    };

    const updateDirectorReviewState = (rowId: string, state: DirectorReviewState) => {
        const nextStates = { ...directorReviewStates, [rowId]: state };
        const directorStageState = workflowRun?.stageStates.find((item) => item.stageId === "director-analysis");
        setDirectorReviewStates(nextStates);
        if (nextStates["director-risk"] === "confirmed" && nextStates["director-storyboard"] === "adopted") {
            if (directorStageState?.status === "review" && directorStageState.runnerRunId) {
                approveRun(directorStageState.runnerRunId, "风险提示已确认，分镜建议已采用。");
                message.success("导演分析已批准，资产与生图已解锁");
                return;
            }
            if (directorStageState?.status !== "approved") message.warning("导演分析缺少可批准的运行记录，请重新分析后再确认");
        }
        message.success(state === "adopted" ? "已采用分镜建议" : "已确认风险提示");
    };
    const approveStageReview = (stageId: string, note: string) => {
        const stageState = workflowRun?.stageStates.find((item) => item.stageId === stageId);
        if (stageState?.status !== "review" || !stageState.runnerRunId) {
            message.warning("当前阶段缺少可批准的运行记录");
            return;
        }
        approveRun(stageState.runnerRunId, note);
        message.success("已批准阶段结果");
    };
    const approveCurrentStoryboardScene = () => {
        if (currentSceneState?.status !== "review" || !currentSceneState.runnerRunId) {
            message.warning("当前场次缺少可批准的运行记录");
            return;
        }
        approveRun(currentSceneState.runnerRunId, sceneReviewNotes[currentSceneState.sceneKey] || "分镜场次结果已确认。");
        message.success("已批准当前场次");
    };
    const importCanvasPackage = (pkg: CanvasHandoffImportTarget) => {
        if (!boundCanvas) {
            message.info("已先创建承接画布，请进入画布后再导入生产包节点组。");
            createBoundCanvas();
            return;
        }
        let previewGenerationReason = "";
        let videoPreview = latestPreview(previews, "video_node");
        if (!videoPreview && workflowRun) {
            const previewResult = generateWorkflowMappingPreview(workflowRun.id, "seedance-storyboard");
            if (previewResult.ok) {
                videoPreview = latestPreview(
                    useAgentRunnerStore.getState().workflowMappingPreviews.filter((item) => item.workflowRunId === workflowRun.id),
                    "video_node",
                );
            } else {
                previewGenerationReason = previewResult.reason || "";
            }
        }
        if (!videoPreview) {
            message.warning(previewGenerationReason || "还没有可导入的视频节点预览，请先在分镜生产包阶段生成画布预览。");
            return;
        }
        const selectedItemIds = findVideoPreviewItemIdsForPackage(videoPreview, pkg);
        if (!selectedItemIds.length) {
            message.warning(`没有找到 P${padEpisodeOrder(pkg.order)} 对应的视频节点预览。`);
            return;
        }
        setApplyingPreviewIds((state) => ({ ...state, [videoPreview.previewId]: true }));
        const result = applyVideoNodePreview(videoPreview.previewId, {
            existingNodes: boundCanvas.nodes || [],
            selectedItemIds,
        });
        setApplyingPreviewIds((state) => ({ ...state, [videoPreview.previewId]: false }));
        if (!result.ok) {
            message.warning(result.reason || "导入画布失败，请检查视频节点预览状态。");
            return;
        }
        const focusNodeId = result.focusNodeIds?.[0];
        message.success(`已导入 P${padEpisodeOrder(pkg.order)}，正在进入画布`);
        router.push(`/canvas/${boundCanvas.id}${focusNodeId ? `?focusNodeId=${encodeURIComponent(focusNodeId)}` : ""}`);
    };

    return (
        <main className="h-full overflow-auto bg-[#050b10] text-slate-100">
            <EpisodeProductionShell
                activeModule={activeModule}
                appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                applyingPreviewIds={applyingPreviewIds}
                boundCanvas={boundCanvas}
                currentScene={currentScene}
                currentSceneState={currentSceneState}
                episode={episode}
                episodeTableShots={episodeTableShots}
                hasScript={hasScript}
                directorReviewStates={directorReviewStates}
                onApplyPreview={confirmApplyPreview}
                onBackProject={() => router.push(`/projects/${project.id}`)}
                onCreateCanvas={createBoundCanvas}
                onGeneratePreview={generatePreview}
                onImportCanvasPackage={importCanvasPackage}
                onModuleChange={setActiveModule}
                onOpenCanvas={openCanvasOrCreate}
                onOpenDetail={setDetailRecord}
                onApproveStageReview={approveStageReview}
                onApproveStoryboardScene={approveCurrentStoryboardScene}
                onUpdateDirectorReviewState={updateDirectorReviewState}
                onRunStage={(stageId) => {
                    const stage = stages.find((item) => item.stageId === stageId);
                    if (stage) void runStage(stage);
                }}
                onRunStoryboardScene={() => void runStoryboardScene()}
                onSaveScript={saveScript}
                onSummarizeStoryboardScenes={summarizeStoryboardScenes}
                project={project}
                previews={previews}
                runningStageIds={runningStageIds}
                sceneOptions={sceneOptions}
                scriptDraft={scriptDraft}
                scriptSnapshot={scriptSnapshot}
                setScriptDraft={setScriptDraft}
                stageOutputs={stageOutputs}
                stageSceneRows={stageSceneRows}
                workflowRun={workflowRun}
            />
            <EpisodeDetailDrawer onClose={() => setDetailRecord(null)} record={detailRecord} />
        </main>
    );
}

const episodeModules: Array<{ key: EpisodeModuleKey; label: string }> = [
    { key: "script", label: "剧本" },
    { key: "director", label: "导演分析" },
    { key: "assets", label: "资产与生图" },
    { key: "storyboard", label: "分镜生产包" },
    { key: "canvas", label: "画布承接" },
];

function EpisodeProductionShell({
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
    const assetLibrary = useAssetStore((state) => state.assets);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const updateProductionBibleItem = useProductionBibleStore((state) => state.updateItem);
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
    const assetRows = buildEpisodeExtractedAssets({
        appliedPreviewItemIds,
        assetLibrary,
        episode,
        episodeTableShots,
        preview: productionBiblePreview,
        productionBibleItems,
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
    const bindExtractedAsset = (row: EpisodeExtractedAsset, asset: Asset) => {
        if (!row.productionBibleItem) {
            message.warning("请先将资产清单写入设定库，再绑定项目资产库素材。");
            return;
        }
        if (row.productionBibleItem.assetRefs.some((ref) => ref.assetId === asset.id)) {
            message.info("当前素材已经绑定到这条资产。");
            return;
        }
        updateProductionBibleItem(row.productionBibleItem.id, {
            assetRefs: [
                ...row.productionBibleItem.assetRefs,
                {
                    assetId: asset.id,
                    assetVersion: buildAssetVersionReference(asset),
                    role: productionBibleRoleForExtractedAsset(row),
                },
            ],
        });
        message.success(`已绑定 ${asset.title}`);
    };
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
            <header className="border-b border-slate-800/80 px-6 py-5 xl:px-8">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                            <Link href={`/projects/${project.id}`} className="text-cyan-300/85 hover:text-cyan-200">
                                {project.title}
                            </Link>
                            <span>/</span>
                            <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <h1 className="break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title}</h1>
                            <EpisodeStatusPill status={currentPhase} tone="cyan" />
                        </div>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">建议下一步：{nextActionText}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button className="!border-slate-700 !bg-slate-950/50 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" onClick={onBackProject}>
                            返回项目
                        </Button>
                        <Button type="primary" onClick={onOpenCanvas}>
                            {boundCanvas ? "进入画布" : "创建承接画布"}
                        </Button>
                    </div>
                </div>
            </header>
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

function EpisodeModuleTabs({ activeModule, onChange, tabs }: { activeModule: EpisodeModuleKey; onChange: (module: EpisodeModuleKey) => void; tabs: Array<{ key: EpisodeModuleKey; label: string; status: EpisodeModuleNavStatus; step: number }> }) {
    return (
        <nav className="grid content-start gap-1.5 rounded-xl border border-slate-800 bg-slate-950/35 p-2">
            {tabs.map((tab) => {
                const active = tab.key === activeModule;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        className={`rounded-lg border px-3 py-2.5 text-left transition ${active ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]" : "border-transparent bg-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-950/45 hover:text-slate-100"}`}
                        onClick={() => onChange(tab.key)}
                        title={tab.status.detail || tab.status.text}
                    >
                        <span className="flex items-center gap-2">
                            <span className={`grid size-6 shrink-0 place-items-center rounded-md border text-xs font-semibold ${active ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100" : "border-slate-700 bg-slate-900/70 text-slate-400"}`}>
                                {tab.step}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-base font-semibold">{tab.label}</span>
                        </span>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${episodeModuleNavToneClass(tab.status.tone)}`}>{tab.status.text}</span>
                    </button>
                );
            })}
        </nav>
    );
}

function buildEpisodeModuleConfig(input: {
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
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenCanvas: () => void;
    onApproveStageReview: (stageId: string, note: string) => void;
    onUpdateDirectorReviewState: (rowId: string, state: DirectorReviewState) => void;
    onRunStage: (stageId: string) => void;
    onRunStoryboardScene: () => void;
    onSaveScript: () => void;
    previews: AgentWorkflowMappingPreview[];
    runningStageIds: Record<string, boolean>;
    sceneOptions: EpisodeSceneOption[];
    scriptDraft: string;
    scriptSnapshot: string;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    stageSceneRows: ScriptScene[];
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    if (input.activeModule === "script") return buildScriptModuleConfig(input);
    if (input.activeModule === "director") return buildDirectorModuleConfig(input);
    if (input.activeModule === "assets") return buildAssetsModuleConfig(input);
    if (input.activeModule === "storyboard") return buildStoryboardModuleConfig(input);
    return buildCanvasModuleConfig(input);
}

function buildScriptModuleConfig(input: {
    episode: ScriptEpisode;
    hasScript: boolean;
    onRunStage: (stageId: string) => void;
    onSaveScript: () => void;
    runningStageIds: Record<string, boolean>;
    scriptDraft: string;
    scriptSnapshot: string;
    stageSceneRows: ScriptScene[];
}): EpisodeModuleConfig {
    const characters = uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).join("、") || "待导演分析确认";
    const sceneList = input.stageSceneRows.map((scene) => `第 ${padEpisodeOrder(scene.order)} 场 ${scene.location || "未标注地点"}：${scene.beat || scene.dialogue || "待补充"}`).join("\n") || "暂无结构化场次；可在详情查看剧本文本。";
    const scriptBody = input.scriptSnapshot || input.scriptDraft || "暂无本集剧本。";
    const scriptChanged = input.scriptDraft.trim() !== input.scriptSnapshot.trim();
    const scriptOverview = extractEpisodeOverview(input.episode.summary || input.scriptSnapshot) || (input.hasScript ? `已导入本集剧本，完整正文 ${scriptBody.length} 字，点击查看。` : "尚未导入本集剧本。");
    const sceneListPreview = input.stageSceneRows.length ? `已整理 ${input.stageSceneRows.length} 个结构化场次，点击查看列表。` : "暂无结构化场次；可在详情查看剧本文本。";
    const rows: EpisodeModuleRow[] = [
        {
            actionLabel: "查看",
            cells: ["剧本摘要", scriptOverview, `${input.stageSceneRows.length} 场`],
            detail: { body: scriptBody, meta: [{ label: "场次数", value: String(input.stageSceneRows.length) }], subtitle: "本集剧本全文只在详情中展示，主列表保持总览。", title: "剧本摘要" },
            highlight: !input.hasScript,
            id: "script-summary",
            status: input.hasScript ? "已完成" : "待生成",
            tone: input.hasScript ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["场次列表", sceneListPreview, `${input.stageSceneRows.length} 条`],
            detail: { body: sceneList, subtitle: "结构化场次列表。", title: "场次列表" },
            id: "script-scenes",
            status: input.stageSceneRows.length ? "已完成" : "待确认",
            tone: input.stageSceneRows.length ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["核心冲突", input.episode.hook || "待补充核心冲突。", "故事钩子"],
            detail: { body: input.episode.hook || scriptBody, title: "核心冲突" },
            id: "script-conflict",
            status: input.episode.hook ? "已完成" : "待确认",
            tone: input.episode.hook ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["人物", characters, `${uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).length} 人`],
            detail: { body: characters, title: "人物" },
            id: "script-characters",
            status: characters === "待导演分析确认" ? "待确认" : "已完成",
            tone: characters === "待导演分析确认" ? "amber" : "green",
        },
        {
            actionLabel: "查看",
            cells: ["爽点", input.episode.turningPoint || "待补充爽点 / 转折。", "转折"],
            detail: { body: input.episode.turningPoint || scriptBody, title: "爽点" },
            id: "script-high-point",
            status: input.episode.turningPoint ? "已完成" : "待确认",
            tone: input.episode.turningPoint ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["反转点", input.episode.cliffhanger || "待补充反转点 / 悬念。", "悬念"],
            detail: { body: input.episode.cliffhanger || scriptBody, title: "反转点" },
            id: "script-reversal",
            status: input.episode.cliffhanger ? "已完成" : "待确认",
            tone: input.episode.cliffhanger ? "green" : "amber",
        },
    ];
    return {
        actions: input.hasScript
            ? [
                  { disabled: !input.scriptDraft.trim() || !scriptChanged, label: "保存修改", onClick: input.onSaveScript },
                  { disabled: false, label: "运行分析", loading: Boolean(input.runningStageIds["director-analysis"]), onClick: () => input.onRunStage("director-analysis"), primary: true },
              ]
            : [{ disabled: !input.scriptDraft.trim(), label: "导入剧本", onClick: input.onSaveScript, primary: true }],
        columns: "110px minmax(300px,1fr) 80px 90px 80px",
        emptyText: "暂无剧本条目",
        filters: ["全部", "已完成", "待确认", "待生成"],
        headers: ["类型", "内容", "引用", "状态", "操作"],
        rows,
        subtitle: "用于承载本集剧本摘要、场次、核心冲突、人物、爽点和反转点；全文在详情抽屉查看。",
        summary: [
            { label: "剧本状态", tone: input.hasScript ? "green" : "amber", value: input.hasScript ? "已导入" : "待导入" },
            { label: "场次", value: String(input.stageSceneRows.length) },
            { label: "人物", value: String(uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).length) },
            { label: "文本量", tone: input.hasScript ? "cyan" : "slate", value: `${scriptBody.length} 字` },
        ],
        title: "剧本模块",
    };
}

function buildDirectorModuleConfig(input: {
    directorReviewStates: Record<string, DirectorReviewState>;
    hasScript: boolean;
    onUpdateDirectorReviewState: (rowId: string, state: DirectorReviewState) => void;
    onRunStage: (stageId: string) => void;
    runningStageIds: Record<string, boolean>;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const output = input.stageOutputs["director-analysis"];
    const digest = output ? buildStageOutputDigest("director-analysis", output) : undefined;
    const display = input.workflowRun ? summarizeWorkflowStageDisplayState(input.workflowRun, "director-analysis", []) : undefined;
    const stageState = input.workflowRun?.stageStates.find((stage) => stage.stageId === "director-analysis");
    const errorMessage = display?.displayStatus === "error" ? stageState?.errorMessage : "";
    const status = output ? "已完成" : input.hasScript ? workflowDisplayText(display) : "待生成";
    const tone = episodeToneFromWorkflow(display, output ? "green" : input.hasScript ? "cyan" : "amber");
    const fullBody = output ? output.rawText : "尚未生成导演分析。";
    const directorApproved = display?.displayStatus === "approved";
    const riskConfirmed = directorApproved || input.directorReviewStates["director-risk"] === "confirmed";
    const storyboardAdopted = directorApproved || input.directorReviewStates["director-storyboard"] === "adopted";
    const riskSummary = buildDirectorRiskSummary(fullBody);
    const rows: EpisodeModuleRow[] = [
        directorRow("director-target", "本集目标", digest?.summary || "待确认本集叙事目标。", status, tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis")),
        directorRow("director-rhythm", "情绪节奏", findDigestSection(digest, ["导演讲戏", "导演分析"]) || "待输出情绪节奏。", status, tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis")),
        directorRow(
            "director-risk",
            "风险提示",
            output ? riskSummary : "待识别风险提示。",
            output ? (riskConfirmed ? "已确认" : "待确认") : status,
            output ? (riskConfirmed ? "green" : "amber") : tone,
            fullBody,
            output ? undefined : () => input.onRunStage("director-analysis"),
            Boolean(output && !riskConfirmed),
            output && !riskConfirmed ? "查看" : undefined,
            output && !riskConfirmed ? { label: "确认风险提示", onClick: () => input.onUpdateDirectorReviewState("director-risk", "confirmed"), primary: true } : undefined,
        ),
        directorRow(
            "director-storyboard",
            "分镜建议",
            findDigestSection(digest, ["场景清单", "场景", "导演讲戏"]) || "待形成分镜建议。",
            output ? (storyboardAdopted ? "已采用" : "待采用") : status,
            output ? (storyboardAdopted ? "green" : "cyan") : tone,
            fullBody,
            output && !storyboardAdopted ? () => input.onUpdateDirectorReviewState("director-storyboard", "adopted") : output ? undefined : () => input.onRunStage("director-analysis"),
            false,
            output && !storyboardAdopted ? "采用" : undefined,
        ),
    ];
    return {
        actions: [{ disabled: !input.hasScript, label: output ? "重新分析" : "运行分析", loading: Boolean(input.runningStageIds["director-analysis"]), onClick: () => input.onRunStage("director-analysis"), primary: true }],
        columns: "120px minmax(300px,1fr) 90px 90px 80px",
        emptyText: "暂无导演分析记录",
        filters: ["全部", "已完成", "已确认", "已采用", "待确认", "待采用", "待生成"],
        headers: ["项目", "分析内容", "来源", "状态", "操作"],
        rows,
        subtitle: errorMessage ? `上次运行失败：${errorMessage}。请检查 AI 配置、额度或网络后重新运行。` : "确认这一集的戏剧方向、情绪节奏、风险提示和分镜建议；完整分析进入详情抽屉查看。",
        summary: [
            { label: "阶段状态", tone, value: status },
            { label: "输出", value: output ? "1" : "0" },
            { label: "风险提示", tone: output ? (riskConfirmed ? "green" : "amber") : "slate", value: output ? (riskConfirmed ? "已确认" : "待确认") : "未生成" },
            { label: "操作", tone: display?.displayStatus === "error" ? "amber" : input.hasScript ? "cyan" : "amber", value: display?.displayStatus === "error" && input.hasScript ? "可重试" : input.hasScript ? "可运行" : "缺剧本" },
        ],
        title: "导演分析模块",
    };
}

function buildEpisodeExtractedAssets({
    assetLibrary,
    episode,
    episodeTableShots,
    preview,
    productionBibleItems,
    projectId,
}: {
    appliedPreviewItemIds: string[];
    assetLibrary: Asset[];
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    preview?: AgentWorkflowMappingPreview;
    productionBibleItems: ProductionBibleItem[];
    projectId: string;
}): EpisodeExtractedAsset[] {
    if (!preview?.items.length) return [];
    return preview.items.map((item, index) => {
        const type = episodeAssetTypeFromPreviewItem(item);
        const name = item.title || mappedFieldText(item.mappedFields.name) || `资产 ${index + 1}`;
        const fullDescription = mappedFieldText(item.mappedFields.description) || item.sourceText || item.reason || "待确认资产描述。";
        const description = listSafeText(fullDescription, "待确认资产描述。");
        const productionBibleItem = findProductionBibleItemForPreviewItem({ item, preview, productionBibleItems, projectId });
        const candidates = matchProjectAssetCandidates(assetLibrary, { description, name, type });
        const canGenerate = item.action !== "skip" && Boolean(fullDescription.trim());
        const status = episodeExtractedAssetStatus({ canGenerate, candidates, item, productionBibleItem });
        return {
            canGenerate,
            candidates,
            description,
            episodeLabel: `第 ${padEpisodeOrder(episode.order)} 集`,
            id: item.itemId,
            item,
            libraryMatchCount: candidates.length,
            name,
            productionBibleItem,
            promptDraft: makeAssetPromptDraft({ description: fullDescription, name, promptSnippets: item.mappedFields.promptSnippets, type }),
            referencedShotLabels: referencedShotLabelsForAsset(episodeTableShots, name, description),
            sourceReason: item.reason,
            status,
            tone: episodeExtractedAssetTone(status),
            type,
        };
    });
}

function findProductionBibleItemForPreviewItem({ item, preview, productionBibleItems, projectId }: { item: AgentWorkflowMappingPreviewItem; preview: AgentWorkflowMappingPreview; productionBibleItems: ProductionBibleItem[]; projectId: string }) {
    return productionBibleItems.find((entry) => {
        if (entry.projectId !== projectId) return false;
        const source = entry.metadata?.source;
        if (source?.previewId === preview.previewId && source.previewItemId === item.itemId) return true;
        return entry.name === item.title;
    });
}

function episodeAssetTypeFromPreviewItem(item: AgentWorkflowMappingPreviewItem): EpisodeExtractedAsset["type"] {
    const text = `${item.title} ${mappedFieldText(item.mappedFields.kind)} ${mappedFieldText(item.mappedFields.tags)} ${item.sourceText}`.toLowerCase();
    if (text.includes("服装") || text.includes("服化") || text.includes("costume") || text.includes("makeup")) return "服装";
    if (text.includes("场景") || text.includes("scene") || text.includes("location")) return "场景";
    if (text.includes("道具") || text.includes("prop")) return "道具";
    return "角色";
}

function episodeExtractedAssetStatus({
    canGenerate,
    candidates,
    item,
    productionBibleItem,
}: {
    canGenerate: boolean;
    candidates: Asset[];
    item: AgentWorkflowMappingPreviewItem;
    productionBibleItem?: ProductionBibleItem;
}): EpisodeExtractedAsset["status"] {
    if (productionBibleItem?.assetRefs.length) return "已绑定";
    if (item.action === "skip" || item.warnings.length) return "待确认";
    if (candidates.length) return "待绑定";
    return canGenerate ? "待生成" : "缺素材";
}

function episodeExtractedAssetTone(status: EpisodeExtractedAsset["status"]): EpisodeStatusTone {
    if (status === "已绑定") return "green";
    if (status === "待绑定" || status === "待生成") return "cyan";
    if (status === "缺素材" || status === "待确认") return "amber";
    return "slate";
}

function matchProjectAssetCandidates(assetLibrary: Asset[], asset: Pick<EpisodeExtractedAsset, "description" | "name" | "type">) {
    const terms = uniqueTextList(`${asset.name} ${asset.description} ${asset.type}`.split(/[\s,，、/·:：。；;（）()]+/).filter((term) => term.length >= 2));
    return assetLibrary
        .map((candidate) => ({ asset: candidate, score: scoreAssetCandidate(candidate, terms, asset.type) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.asset.updatedAt.localeCompare(a.asset.updatedAt))
        .slice(0, 8)
        .map((item) => item.asset);
}

function scoreAssetCandidate(asset: Asset, terms: string[], type: EpisodeExtractedAsset["type"]) {
    const haystack = `${asset.title} ${(asset.tags || []).join(" ")} ${asset.note || ""} ${asset.source || ""}`.toLowerCase();
    let score = 0;
    terms.forEach((term) => {
        if (haystack.includes(term.toLowerCase())) score += term.length > 3 ? 3 : 2;
    });
    if (asset.kind === "image") score += 1;
    if (type === "场景" && (haystack.includes("场景") || haystack.includes("环境"))) score += 2;
    if (type === "角色" && (haystack.includes("角色") || haystack.includes("人物"))) score += 2;
    if (type === "道具" && haystack.includes("道具")) score += 2;
    if (type === "服装" && (haystack.includes("服装") || haystack.includes("服化"))) score += 2;
    return score;
}

function referencedShotLabelsForAsset(shots: StoryboardTableShot[], name: string, description: string) {
    const terms = uniqueTextList([name, ...description.split(/[，,、。\s]+/)].filter((term) => term.length >= 2));
    return shots
        .filter((shot) => {
            const text = `${shot.title} ${shot.sceneName} ${shot.scriptText} ${shot.visualDescription} ${shot.characters.join(" ")} ${shot.assetNeeds?.join(" ") || ""}`;
            return terms.some((term) => text.includes(term));
        })
        .slice(0, 6)
        .map((shot) => `P${padEpisodeOrder(shot.order)}`);
}

function makeAssetPromptDraft({ description, name, promptSnippets, type }: { description: string; name: string; promptSnippets?: unknown; type: EpisodeExtractedAsset["type"] }) {
    const existing = mappedFieldText(promptSnippets);
    if (existing) return existing;
    return `${name}，${type}参考图，${description}，电影级写实质感，低对比深色影像风格，保持本集视觉连续性，清晰可作为后续分镜和画布承接参考。`;
}

function assetKindDisplay(kind: Asset["kind"]) {
    const labels: Record<Asset["kind"], string> = {
        audio: "音频",
        image: "图片",
        text: "文本",
        video: "视频",
    };
    return labels[kind];
}

function productionBibleRoleForExtractedAsset(row: EpisodeExtractedAsset) {
    if (row.type === "角色") return "portrait";
    if (row.type === "场景") return "environment";
    return "reference";
}

function buildAssetsModuleConfig(input: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApproveStageReview: (stageId: string, note: string) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onRunStage: (stageId: string) => void;
    previews: AgentWorkflowMappingPreview[];
    runningStageIds: Record<string, boolean>;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const preview = latestPreview(input.previews, "production_bible");
    const counts = preview ? previewCounts(preview, input.appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const display = input.workflowRun ? summarizeWorkflowStageDisplayState(input.workflowRun, "art-design", []) : undefined;
    const needsReview = display?.displayStatus === "review";
    const rows: EpisodeModuleRow[] = preview?.items.length
        ? preview.items.map((item, index): EpisodeModuleRow => {
              const applied = input.appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId));
              const kind = productionBibleKindLabel(item.mappedFields.kind);
              const fullDescription = mappedFieldText(item.mappedFields.description) || item.sourceText || item.reason;
              const description = listSafeText(fullDescription, "待确认资产简述。");
              const status = applied ? "已完成" : item.action === "skip" ? "待确认" : item.warnings.length ? "缺素材" : "待确认";
              return {
                  actionLabel: "查看",
                  cells: [kind, item.title, description, `${referenceCount(item.mappedFields)} 图`],
                  detail: {
                      body: [fullDescription, item.mappedFields.promptSnippets ? `\n提示词片段：\n${mappedFieldText(item.mappedFields.promptSnippets)}` : "", item.warnings.length ? `\n提示：${item.warnings.join("；")}` : ""].filter(Boolean).join("\n"),
                      meta: [
                          { label: "类型", value: kind },
                          { label: "引用", value: `${referenceCount(item.mappedFields)} 图` },
                          { label: "状态", value: status },
                      ],
                      subtitle: item.reason,
                      title: item.title,
                  },
                  highlight: status === "缺素材" || index === 0,
                  id: item.itemId,
                  status,
                  tone: applied ? "green" : status === "缺素材" ? "amber" : "cyan",
              };
          })
        : assetPlaceholderRows();
    return {
        actions: [
            ...(needsReview
                ? [
                      {
                          label: "批准资产清单",
                          onClick: () => input.onApproveStageReview("art-design", "资产清单已确认。"),
                          primary: true,
                      },
                  ]
                : []),
            {
                label: input.stageOutputs["art-design"] ? "生成资产清单" : "运行资产分析",
                loading: Boolean(input.runningStageIds["art-design"]),
                onClick: () => (input.stageOutputs["art-design"] ? input.onGeneratePreview("art-design", "设定库预览") : input.onRunStage("art-design")),
                primary: !needsReview,
            },
            {
                disabled: !preview || counts.pending <= 0,
                label: "写入设定库",
                loading: Boolean(preview && input.applyingPreviewIds[preview.previewId]),
                onClick: () => preview && input.onApplyPreview(preview),
            },
        ],
        columns: "90px 140px minmax(260px,1fr) 80px 90px 80px",
        emptyText: "暂无资产与生图记录",
        filters: ["全部", "已完成", "待确认", "缺素材", "待生成"],
        headers: ["类型", "资产", "简述", "引用", "状态", "操作"],
        rows,
        subtitle: "从剧本和导演分析中提取角色、场景、道具、服装等资产；只展示清单，完整描述进入详情。",
        summary: [
            { label: "资产项", tone: preview ? "cyan" : "slate", value: String(counts.total || rows.length) },
            { label: "已写入", tone: counts.applied ? "green" : "slate", value: String(counts.applied) },
            { label: "待写入", tone: counts.pending ? "amber" : "slate", value: String(counts.pending) },
            { label: "缺口", tone: rows.some((row) => row.status === "缺素材") ? "amber" : "green", value: String(rows.filter((row) => row.status === "缺素材").length) },
        ],
        title: "资产与生图模块",
    };
}

function buildStoryboardModuleConfig(input: {
    appliedPreviewItemIds: string[];
    currentScene?: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    episodeTableShots: StoryboardTableShot[];
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onRunStoryboardScene: () => void;
    previews: AgentWorkflowMappingPreview[];
    sceneOptions: EpisodeSceneOption[];
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const preview = latestPreview(input.previews, "storyboard_table");
    const counts = preview ? previewCounts(preview, input.appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const rows = input.episodeTableShots.length
        ? input.episodeTableShots.map((shot): EpisodeModuleRow => {
              const refCount = (shot.assetRefs?.length || 0) + (shot.productionBibleRefs?.length || 0);
              return {
                  actionLabel: "查看",
                  cells: [
                      <div key="shot">
                          <div className="font-semibold text-slate-100">P{padEpisodeOrder(shot.order)}</div>
                          <div className="text-xs text-slate-500">{shot.sceneName}</div>
                      </div>,
                      <div key="content">
                          <div className="font-medium text-slate-100">{shot.title}</div>
                          <div className="mt-1 text-slate-400">{listSafeText(shot.visualDescription || shot.scriptText, "待补充镜头内容")}</div>
                      </div>,
                      shot.workflowSource ? "已生成" : shot.visualDescription ? "草案" : "待生成",
                      `${refCount} 项`,
                      "待承接",
                      <EpisodeProgress key="progress" label="62%" value={62} />,
                  ],
                  detail: {
                      body: [
                          `场次：${shot.sceneName}`,
                          `标题：${shot.title}`,
                          `剧本：${shot.scriptText || "未填写"}`,
                          `分镜描述：${shot.visualDescription || "未填写"}`,
                          `对白：${shot.dialogue || "未填写"}`,
                          `动作：${shot.action || "未填写"}`,
                          `情绪：${shot.emotion || "未填写"}`,
                          `镜头：${shot.shotSize || "未填写"} / ${shot.cameraMovement || "未填写"}`,
                          `参考素材：${refCount} 项`,
                      ].join("\n"),
                      meta: [
                          { label: "镜头编号", value: `P${padEpisodeOrder(shot.order)}` },
                          { label: "参考素材", value: `${refCount} 项` },
                      ],
                      title: shot.title,
                  },
                  highlight: !shot.workflowSource,
                  id: shot.id,
                  status: shot.workflowSource ? "待生成" : "待确认",
                  tone: shot.workflowSource ? "cyan" : "amber",
              };
          })
        : storyboardPlaceholderRows(input.sceneOptions, input.currentScene?.sceneKey);
    const display = input.workflowRun
        ? summarizeWorkflowStageDisplayState(
              input.workflowRun,
              "seedance-storyboard",
              input.sceneOptions.map((scene) => scene.sceneKey),
          )
        : undefined;
    return {
        actions: [
            {
                disabled: !input.currentScene,
                label: input.currentSceneState?.status === "review" ? "重新跑当前场次" : "运行当前场次",
                loading: input.currentSceneState?.status === "running",
                onClick: input.onRunStoryboardScene,
                primary: true,
            },
            { label: "生成分镜预览", onClick: () => input.onGeneratePreview("seedance-storyboard", "分镜表预览") },
            { disabled: !preview || counts.pending <= 0, label: "写入分镜表", onClick: () => preview && input.onApplyPreview(preview) },
        ],
        columns: "80px minmax(260px,1fr) 90px 90px 90px 120px 90px 80px",
        emptyText: "暂无分镜记录",
        filters: ["全部", "已完成", "待确认", "待生成", "缺素材"],
        headers: ["镜头", "内容", "提示词", "参考素材", "视频", "完成度", "状态", "操作"],
        rows,
        subtitle: "镜头长表只展示编号、内容摘要、提示词状态、参考素材、视频状态和完成度；镜头正文进入详情查看。",
        summary: [
            { label: "阶段状态", tone: episodeToneFromWorkflow(display, "cyan"), value: workflowDisplayText(display) },
            { label: "镜头", tone: input.episodeTableShots.length ? "cyan" : "slate", value: String(input.episodeTableShots.length) },
            { label: "预览待写入", tone: counts.pending ? "amber" : "slate", value: String(counts.pending) },
            { label: "当前场次", tone: input.currentScene ? "cyan" : "slate", value: input.currentScene ? input.currentScene.sceneLabel : "未选择" },
        ],
        title: "分镜模块",
    };
}

function buildCanvasModuleConfig(input: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    boundCanvas?: CanvasProject;
    episodeTableShots: StoryboardTableShot[];
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenCanvas: () => void;
    previews: AgentWorkflowMappingPreview[];
}): EpisodeModuleConfig {
    const preview = latestPreview(input.previews, "video_node");
    const counts = preview ? previewCounts(preview, input.appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const rows: EpisodeModuleRow[] = preview?.items.length
        ? preview.items.map((item): EpisodeModuleRow => {
              const applied = input.appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId));
              const configText = generationConfigText(item.mappedFields);
              return {
                  actionLabel: "查看",
                  cells: [item.title, applied ? "已承接到画布" : "待写入画布", configText, applied ? "待生成" : "待写入"],
                  detail: {
                      body: [item.sourceText, `\n生成配置：${configText}`, item.warnings.length ? `\n提示：${item.warnings.join("；")}` : ""].filter(Boolean).join("\n"),
                      meta: [
                          { label: "承接状态", value: applied ? "已承接" : "待写入" },
                          { label: "任务状态", value: applied ? "待生成" : "待写入" },
                      ],
                      subtitle: item.reason,
                      title: item.title,
                  },
                  highlight: !applied,
                  id: item.itemId,
                  status: applied ? "已完成" : "待生成",
                  tone: applied ? "green" : "cyan",
              };
          })
        : [
              {
                  actionLabel: input.boundCanvas ? "进入" : "创建",
                  cells: [
                      "承接画布",
                      input.boundCanvas ? input.boundCanvas.title : "未绑定画布",
                      input.boundCanvas ? `${input.boundCanvas.nodes.length} 节点` : "待创建",
                      input.episodeTableShots.length ? `${input.episodeTableShots.length} 镜头待承接` : "待分镜",
                  ],
                  detail: { body: input.boundCanvas ? `画布：${input.boundCanvas.title}\n节点：${input.boundCanvas.nodes.length}` : "当前集尚未绑定承接画布。", title: "承接画布" },
                  highlight: !input.boundCanvas,
                  id: "canvas-binding",
                  onAction: input.onOpenCanvas,
                  status: input.boundCanvas ? "已完成" : "待生成",
                  tone: input.boundCanvas ? "green" : "amber",
              },
          ];
    return {
        actions: [
            { label: input.boundCanvas ? "进入画布" : "创建承接画布", onClick: input.onOpenCanvas, primary: true },
            { label: "生成视频节点预览", onClick: () => input.onGeneratePreview("seedance-storyboard", "视频节点预览") },
            { disabled: !preview || counts.pending <= 0, label: "写入视频节点", loading: Boolean(preview && input.applyingPreviewIds[preview.previewId]), onClick: () => preview && input.onApplyPreview(preview) },
        ],
        columns: "140px minmax(220px,1fr) 160px 110px 90px 80px",
        emptyText: "暂无画布承接记录",
        filters: ["全部", "已完成", "待生成", "待确认"],
        headers: ["镜头组", "承接状态", "生成配置", "任务状态", "状态", "操作"],
        rows,
        subtitle: "展示可导入画布的镜头组、承接状态、生成配置和任务状态；生成仍需进入画布后人工触发。",
        summary: [
            { label: "画布", tone: input.boundCanvas ? "green" : "amber", value: input.boundCanvas ? "已绑定" : "未绑定" },
            { label: "视频节点", tone: counts.pending ? "cyan" : "slate", value: String(counts.total) },
            { label: "待写入", tone: counts.pending ? "amber" : "slate", value: String(counts.pending) },
            { label: "镜头", tone: input.episodeTableShots.length ? "cyan" : "slate", value: String(input.episodeTableShots.length) },
        ],
        title: "画布承接模块",
    };
}

function directorRow(id: string, label: string, content: string, status: string, tone: EpisodeStatusTone, body: string, onAction?: () => void, highlight?: boolean, actionLabel?: string, detailAction?: EpisodeDetailRecord["action"]): EpisodeModuleRow {
    return {
        actionLabel: actionLabel || (onAction ? "运行" : status === "待确认" ? "确认" : status === "待采用" ? "采用" : "查看"),
        cells: [label, content, "导演分析"],
        detail: { action: detailAction, body, subtitle: content, title: label },
        highlight,
        id,
        onAction,
        status,
        tone,
    };
}

function buildDirectorRiskSummary(text: string) {
    const keywordLine = findOutputKeywordLine(text, ["风险", "注意", "避免", "PASS", "合规", "安全", "审核"]);
    if (!keywordLine) return "已生成风险提示，点击查看完整导演分析后确认。";
    const normalized = keywordLine.replace(/\s+/g, " ").trim();
    if (/^PASS\b/i.test(normalized) || normalized.includes("PASS")) return `${normalized}。点击查看完整风险依据后确认。`;
    return listSafeText(normalized, "已生成风险提示，点击查看完整导演分析后确认。");
}

function assetPlaceholderRows(): EpisodeModuleRow[] {
    return [
        ["角色", "主要角色", "待从导演分析和美术设计中提取角色设定。"],
        ["场景", "关键场景", "待提取场景氛围、空间结构和参考素材。"],
        ["道具", "互动道具", "待确认剧情关键道具和连续性要求。"],
        ["服装", "服化道", "待提取服装、妆发和风格约束。"],
    ].map(([kind, title, description], index) => ({
        actionLabel: "查看",
        cells: [kind, title, description, "0 图"],
        detail: { body: description, meta: [{ label: "类型", value: kind }], title },
        highlight: index === 0,
        id: `asset-placeholder-${kind}`,
        status: "待生成",
        tone: "amber",
    }));
}

function storyboardPlaceholderRows(scenes: EpisodeSceneOption[], currentSceneKey?: string): EpisodeModuleRow[] {
    const source = scenes.length ? scenes : [{ sceneKey: "empty", sceneLabel: "暂无场次", scriptText: "请先导入剧本或生成分镜。", source: "script_text" as const }];
    return source.map((scene) => ({
        actionLabel: "查看",
        cells: [scene.sceneLabel, scene.scriptText ? "待生成分镜，点击查看场次文本。" : "暂无场次文本", "待生成", "0 项", "待生成", <EpisodeProgress key="progress" label="0%" value={0} />],
        detail: { body: scene.scriptText || "暂无场次文本", subtitle: sceneSourceLabel(scene.source), title: scene.sceneLabel },
        highlight: scene.sceneKey === currentSceneKey,
        id: scene.sceneKey,
        status: "待生成",
        tone: "amber",
    }));
}

function filterEpisodeRows(rows: EpisodeModuleRow[], filter: string) {
    if (filter === "全部") return rows;
    return rows.filter((row) => row.status === filter || row.status.includes(filter) || (filter === "已完成" && (row.status === "完整" || row.status.startsWith("已"))));
}

function latestPreview(previews: AgentWorkflowMappingPreview[], targetType: AgentWorkflowMappingPreview["targetType"]) {
    return previews
        .filter((preview) => preview.targetType === targetType)
        .slice()
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
}

function buildEpisodePhaseText({
    artDisplay,
    boundCanvas,
    directorDisplay,
    episodeTableShots,
    hasScript,
    productionBiblePreview,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    artDisplay?: WorkflowStageDisplaySummary;
    boundCanvas?: CanvasProject;
    directorDisplay?: WorkflowStageDisplaySummary;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    storyboardDisplay?: WorkflowStageDisplaySummary;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}) {
    if (!hasScript) return "待导入剧本";
    if (videoPreview || boundCanvas) return "画布承接准备";
    if (storyboardPreview || episodeTableShots.length) return "分镜提示词审核";
    if (productionBiblePreview || artDisplay?.displayStatus === "approved") return "资产与生图待补齐";
    if (directorDisplay?.displayStatus && directorDisplay.displayStatus !== "idle") return `导演分析${workflowStageStatusLabel(directorDisplay.displayStatus)}`;
    if (storyboardDisplay?.displayStatus === "running") return "分镜生成中";
    return "导演分析待启动";
}

function buildEpisodeNextActionText({
    appliedPreviewItemIds,
    artDisplay,
    boundCanvas,
    directorDisplay,
    episodeTableShots,
    hasScript,
    productionBiblePreview,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    appliedPreviewItemIds: string[];
    artDisplay?: WorkflowStageDisplaySummary;
    boundCanvas?: CanvasProject;
    directorDisplay?: WorkflowStageDisplaySummary;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    storyboardDisplay?: WorkflowStageDisplaySummary;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}) {
    if (!hasScript) return "先导入或粘贴本集剧本。";
    if (directorDisplay?.displayStatus === "error" || directorDisplay?.displayStatus === "rejected") return "处理导演分析异常，然后重新运行分析。";
    if (!directorDisplay || directorDisplay.displayStatus === "idle") return "运行导演分析。";
    if (directorDisplay.displayStatus === "running") return "等待导演分析完成。";
    if (directorDisplay.displayStatus === "review" || directorDisplay.displayStatus === "partial") return "查看并确认导演分析结果。";
    if (artDisplay?.displayStatus === "error" || artDisplay?.displayStatus === "rejected") return "处理资产与生图异常，然后重新运行资产分析。";
    if (!productionBiblePreview && artDisplay?.displayStatus !== "approved") return "进入资产与生图，运行资产分析。";
    const assetCounts = productionBiblePreview ? previewCounts(productionBiblePreview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    if (assetCounts.pending) return `写入 ${assetCounts.pending} 条资产清单。`;
    if (storyboardDisplay?.displayStatus === "error" || storyboardDisplay?.displayStatus === "rejected") return "处理分镜生成异常，再重新推进分镜。";
    if (!storyboardPreview && !episodeTableShots.length) return "进入分镜生产包，生成分镜。";
    if (!videoPreview && !boundCanvas) return "进入画布承接，把分镜放入画布。";
    return "进入画布继续生成或检查视频版本。";
}

function buildEpisodeModuleNavStatus({
    appliedPreviewItemIds,
    artDisplay,
    boundCanvas,
    directorDisplay,
    episodeTableShots,
    hasScript,
    key,
    productionBiblePreview,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    appliedPreviewItemIds: string[];
    artDisplay?: WorkflowStageDisplaySummary;
    boundCanvas?: CanvasProject;
    directorDisplay?: WorkflowStageDisplaySummary;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    key: EpisodeModuleKey;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    storyboardDisplay?: WorkflowStageDisplaySummary;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}): EpisodeModuleNavStatus {
    if (key === "script") return hasScript ? { text: "完成", tone: "green" } : { text: "开始", tone: "cyan" };
    if (key === "director") return compactWorkflowNavStatus(directorDisplay, hasScript ? "下一步" : "等待", hasScript ? "cyan" : "slate");
    if (key === "assets") {
        if (!hasScript) return { text: "等待", tone: "slate" };
        if (productionBiblePreview) {
            const counts = previewCounts(productionBiblePreview, appliedPreviewItemIds);
            if (counts.pending) return { detail: `${counts.pending} 条资产清单待写入`, text: "待写入", tone: "amber" };
            return { text: "完成", tone: "green" };
        }
        return compactWorkflowNavStatus(artDisplay, "待分析", "slate");
    }
    if (key === "storyboard") {
        if (episodeTableShots.length) return { detail: `${episodeTableShots.length} 个镜头`, text: "完成", tone: "green" };
        if (!hasScript) return { text: "等待", tone: "slate" };
        return compactWorkflowNavStatus(storyboardDisplay, "待生成", "slate");
    }
    if (boundCanvas || videoPreview) return { text: "完成", tone: "green" };
    if (storyboardPreview || episodeTableShots.length) return { text: "待承接", tone: "cyan" };
    return { text: "等待", tone: "slate" };
}

function compactWorkflowNavStatus(display: WorkflowStageDisplaySummary | undefined, idleText: string, idleTone: EpisodeStatusTone): EpisodeModuleNavStatus {
    if (!display || display.displayStatus === "idle") return { text: idleText, tone: idleTone };
    if (display.displayStatus === "approved") return { text: "完成", tone: "green" };
    if (display.displayStatus === "running") return { text: "运行中", tone: "cyan" };
    if (display.displayStatus === "review" || display.displayStatus === "partial") return { text: "待确认", tone: "amber" };
    if (display.displayStatus === "error" || display.displayStatus === "rejected" || display.displayStatus === "blocked") return { detail: display.summaryText, text: "需处理", tone: "red" };
    return { text: workflowStageStatusLabel(display.displayStatus), tone: "slate" };
}

function episodeModuleNavToneClass(tone: EpisodeStatusTone) {
    const toneClass: Record<EpisodeStatusTone, string> = {
        amber: "bg-amber-400/10 text-amber-200",
        cyan: "bg-cyan-400/10 text-cyan-100",
        green: "bg-emerald-400/10 text-emerald-200",
        red: "bg-rose-400/10 text-rose-200",
        slate: "bg-slate-800/80 text-slate-400",
    };
    return toneClass[tone];
}

function workflowDisplayText(display?: WorkflowStageDisplaySummary) {
    if (!display) return "未开始";
    if (display.hasSceneStates && display.summaryText) return display.summaryText;
    return workflowStageStatusLabel(display.displayStatus);
}

function buildAssetStageActionHint({ display, hasOutput, isRunning, previewPending, previewTotal }: { display?: WorkflowStageDisplaySummary; hasOutput: boolean; isRunning: boolean; previewPending: number; previewTotal: number }): {
    blocked?: boolean;
    text: string;
    tone: EpisodeStatusTone;
} {
    if (isRunning || display?.displayStatus === "running") return { text: "资产分析正在运行，等待 Agent 返回结果。", tone: "cyan" };
    if (display?.displayStatus === "blocked") return { blocked: true, text: `暂不可运行，${formatBlockedReason(display.blockedReason)}。`, tone: "amber" };
    if (display?.displayStatus === "error") return { text: "上次资产分析失败，请查看错误后重新运行。", tone: "red" };
    if (display?.displayStatus === "rejected") return { text: "资产清单已驳回，可重新运行生成新结果。", tone: "red" };
    if (previewPending > 0) return { text: `已有资产清单，${previewPending} 项待写入设定库。`, tone: "amber" };
    if (previewTotal > 0) return { text: `资产清单已处理完成，共 ${previewTotal} 项。`, tone: "green" };
    if (hasOutput) return { text: "资产分析已完成，可刷新资产清单或写入设定库。", tone: "cyan" };
    if (display?.displayStatus === "review") return { text: "资产清单待审核，可生成资产清单。", tone: "cyan" };
    if (display?.displayStatus === "approved") return { text: "资产与生图阶段已批准，可继续处理生图需求。", tone: "green" };
    return { text: "可运行，将从剧本和导演分析中提取角色、场景、道具和服装。", tone: "slate" };
}

function episodeToneFromWorkflow(display: WorkflowStageDisplaySummary | undefined, fallback: EpisodeStatusTone): EpisodeStatusTone {
    if (!display) return fallback;
    if (display.displayStatus === "approved") return "green";
    if (display.displayStatus === "review" || display.displayStatus === "running" || display.displayStatus === "partial") return "cyan";
    if (display.displayStatus === "blocked" || display.displayStatus === "idle") return "amber";
    if (display.displayStatus === "error" || display.displayStatus === "rejected") return "red";
    return fallback;
}

function productionBibleKindLabel(kind: unknown) {
    const value = String(kind || "").toLowerCase();
    if (value.includes("character") || value.includes("角色") || value.includes("人物")) return "角色";
    if (value.includes("scene") || value.includes("场景")) return "场景";
    if (value.includes("costume") || value.includes("服装") || value.includes("服化")) return "服装";
    if (value.includes("prop") || value.includes("道具")) return "道具";
    return "资产";
}

function mappedFieldText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map(mappedFieldText).filter(Boolean).join("、");
    if (typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, fieldValue]) => `${key}：${mappedFieldText(fieldValue)}`)
            .filter(Boolean)
            .join("\n");
    }
    return String(value).trim();
}

function referenceCount(fields: Record<string, unknown>) {
    const refs = [fields.referenceAssets, fields.assetRefs, fields.references, fields.referenceAssetIds].flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));
    return refs.length;
}

function generationConfigText(fields: Record<string, unknown>) {
    const model = mappedFieldText(fields.model || fields.videoModel || fields.seedanceModel) || "Seedance";
    const duration = mappedFieldText(fields.duration || fields.estimatedDuration) || "按镜头";
    const ratio = mappedFieldText(fields.aspectRatio || fields.ratio) || "沿用项目";
    return `${model} · ${duration} · ${ratio}`;
}

function extractEpisodeOverview(text: string) {
    const lines = text
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
    const picked = lines.find((line) => /^摘要[：:]/.test(line)) || lines.find((line) => line.length >= 12) || "";
    if (!picked) return "";
    return picked.length > 160 ? `已导入本集正文，完整内容 ${text.length} 字，点击查看。` : picked;
}

function listSafeText(text: string, fallback: string) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return fallback;
    return normalized.length > 150 ? `已提取内容，完整文本 ${normalized.length} 字，点击查看。` : normalized;
}

function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}

function uniqueTextList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stageCollapseItem({
    stage,
    workflowRun,
    output,
    previews,
    qualityResults,
    requiredReadings,
    sceneKeys,
    hasScript,
    hasCanvas,
    reviewNote,
    isRunning,
    sceneWorkbench,
    applyingPreviewIds,
    appliedPreviewItemIds,
    onReviewNoteChange,
    onRun,
    onApprove,
    onReject,
    onMarkReadingsRead,
    onGeneratePreview,
    onApplyPreview,
}: {
    stage: AgentWorkflowStage;
    workflowRun?: AgentWorkflowRunRecord;
    output?: AgentWorkflowStageOutput;
    previews: AgentWorkflowMappingPreview[];
    qualityResults: WorkflowGateCheckResult[];
    requiredReadings: WorkflowRequiredReading[];
    sceneKeys: string[];
    hasScript: boolean;
    hasCanvas: boolean;
    reviewNote: string;
    isRunning: boolean;
    sceneWorkbench?: React.ReactNode;
    applyingPreviewIds: Record<string, boolean>;
    appliedPreviewItemIds: string[];
    onReviewNoteChange: (value: string) => void;
    onRun: () => void;
    onApprove: (runnerRunId: string) => void;
    onReject: (runnerRunId: string) => void;
    onMarkReadingsRead: () => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
}) {
    const stageState = workflowRun?.stageStates.find((item) => item.stageId === stage.stageId);
    const displayState = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, stage.stageId, sceneKeys) : undefined;
    const copy = stageCopy[stage.stageId];
    const mappingStatus = workflowRun ? canGenerateWorkflowMappingPreview(workflowRun, stage.stageId, sceneKeys) : { allowed: false, reason: "尚未初始化 workflow run" };
    const gateErrorCount = qualityResults.filter((result) => result.status === "error").length;
    const readCount = stageState?.readingRecords.filter((record) => record.status === "read").length || 0;
    const requiredReadingCount = requiredReadings.length;
    const lockedReason = !hasScript ? "缺少本集剧本" : displayState?.displayStatus === "blocked" ? formatBlockedReason(displayState.blockedReason) : "";
    const isSceneStage = stage.stageId === "seedance-storyboard";
    return {
        key: stage.stageId,
        label: (
            <div className="flex flex-wrap items-center gap-2">
                <span>
                    {stage.order}. {copy.title}
                </span>
                <Tag className="m-0">{copy.agent}</Tag>
                <StatusTag status={displayState?.displayStatus || "idle"} />
                {displayState?.hasSceneStates ? <Tag className="m-0">{displayState.summaryText}</Tag> : null}
                {lockedReason ? (
                    <Tag className="m-0" color="orange">
                        阻塞
                    </Tag>
                ) : null}
                {lockedReason ? <span className="text-xs text-stone-500">原因：{lockedReason}</span> : null}
            </div>
        ),
        children: (
            <Card size="small" className="border-0 bg-transparent shadow-none">
                <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                        <InfoBlock label="输入来源" value={copy.input} />
                        <InfoBlock label="输出产物" value={copy.output} />
                    </div>
                    <div className="studio-panel-muted grid gap-2 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0">
                                规范读取 {readCount}/{requiredReadingCount}
                            </Tag>
                            <Tag className="m-0" color={gateErrorCount ? "red" : "green"}>
                                质检错误 {gateErrorCount}
                            </Tag>
                            {output ? <Tag className="m-0">最近产物 1</Tag> : <Tag className="m-0">暂无产物</Tag>}
                            {displayState?.hasSceneStates ? <Tag className="m-0">{displayState.summaryText}</Tag> : null}
                        </div>
                        <StageReadingList requiredReadings={requiredReadings} readingRecords={stageState?.readingRecords || []} />
                        {output ? <StageOutputDigest stageId={stage.stageId} output={output} /> : <div className="text-stone-600 dark:text-stone-300">暂无阶段产物</div>}
                        {lockedReason ? <div className="text-amber-600">阻塞原因：{lockedReason}</div> : null}
                        {stageState?.errorMessage ? <div className="text-rose-500">错误：{stageState.errorMessage}</div> : null}
                    </div>
                    {sceneWorkbench}
                    <Space size={[6, 6]} wrap>
                        {!isSceneStage ? (
                            <Button size="small" icon={<Play className="size-3.5" />} type="primary" disabled={Boolean(lockedReason)} loading={isRunning} onClick={onRun}>
                                运行草案
                            </Button>
                        ) : null}
                        <Button size="small" onClick={onMarkReadingsRead} disabled={!workflowRun}>
                            补记规范读取
                        </Button>
                        {copy.previewTargets.includes("production_bible") ? (
                            <Button size="small" disabled={!mappingStatus.allowed} onClick={() => onGeneratePreview(stage.stageId, "设定库预览")}>
                                生成设定库预览
                            </Button>
                        ) : null}
                        {copy.previewTargets.includes("storyboard_table") ? (
                            <Button size="small" disabled={!mappingStatus.allowed} onClick={() => onGeneratePreview(stage.stageId, "分镜表预览")}>
                                生成分镜表预览
                            </Button>
                        ) : null}
                        {copy.previewTargets.includes("video_node") ? (
                            <Button size="small" disabled={!mappingStatus.allowed} onClick={() => onGeneratePreview(stage.stageId, "视频节点预览")}>
                                生成视频节点预览
                            </Button>
                        ) : null}
                        {!mappingStatus.allowed && copy.previewTargets.length ? <span className="text-xs text-stone-500">{mappingStatus.reason}</span> : null}
                    </Space>
                    {!isSceneStage && stageState?.status === "review" ? (
                        <div className="studio-panel-muted grid gap-2 p-3">
                            <Input.TextArea rows={2} placeholder="审核备注" value={reviewNote} onChange={(event) => onReviewNoteChange(event.target.value)} />
                            <Space size={6} wrap>
                                <Button size="small" type="primary" icon={<CheckCircle2 className="size-3.5" />} disabled={!stageState.runnerRunId} onClick={() => stageState.runnerRunId && onApprove(stageState.runnerRunId)}>
                                    批准
                                </Button>
                                <Button size="small" danger icon={<XCircle className="size-3.5" />} disabled={!stageState.runnerRunId} onClick={() => stageState.runnerRunId && onReject(stageState.runnerRunId)}>
                                    驳回
                                </Button>
                            </Space>
                        </div>
                    ) : null}
                    {previews.length ? <PreviewList previews={previews} appliedPreviewItemIds={appliedPreviewItemIds} applyingPreviewIds={applyingPreviewIds} hasCanvas={hasCanvas} onApplyPreview={onApplyPreview} /> : null}
                    <details>
                        <summary className="cursor-pointer text-sm text-stone-500">详细信息</summary>
                        <div className="mt-3 grid gap-3 text-xs leading-5 text-stone-500">
                            <pre className="max-h-56 overflow-auto rounded-lg bg-stone-950 p-3 text-stone-50">
                                {JSON.stringify(
                                    { sourceFiles: output?.sourceFiles || [], qualityGateIds: output?.qualityGateIds || [], qualityResults, readingRecords: stageState?.readingRecords || [], workflowTrace: { workflowRunId: workflowRun?.id, stageState } },
                                    null,
                                    2,
                                )}
                            </pre>
                            {output ? <pre className="max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-stone-50 whitespace-pre-wrap">{output.rawText}</pre> : null}
                            {output?.structuredOutput !== undefined ? <pre className="max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-stone-50">{JSON.stringify(output.structuredOutput, null, 2)}</pre> : null}
                        </div>
                    </details>
                </div>
            </Card>
        ),
    };
}

function StoryboardSceneWorkbench({
    scenes,
    selectedSceneKey,
    subSceneKey,
    workflowRun,
    currentScene,
    currentSceneState,
    reviewNote,
    isRunning,
    onSceneChange,
    onSubSceneKeyChange,
    onReviewNoteChange,
    onRun,
    onApprove,
    onReject,
    onSummarize,
}: {
    scenes: EpisodeSceneOption[];
    selectedSceneKey: string;
    subSceneKey: string;
    workflowRun?: AgentWorkflowRunRecord;
    currentScene?: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    reviewNote: string;
    isRunning: boolean;
    onSceneChange: (value: string) => void;
    onSubSceneKeyChange: (value: string) => void;
    onReviewNoteChange: (value: string) => void;
    onRun: () => void;
    onApprove: (runnerRunId: string) => void;
    onReject: (runnerRunId: string) => void;
    onSummarize: () => void;
}) {
    const sceneStates = workflowRun?.sceneStates?.filter((scene) => scene.stageId === "seedance-storyboard") || [];
    const progress = workflowRun
        ? getWorkflowStageSceneProgress(
              workflowRun,
              "seedance-storyboard",
              scenes.map((scene) => scene.sceneKey),
          )
        : undefined;
    const approvedCount = progress?.approvedCount || 0;
    const pendingCount = progress ? Math.max(progress.totalCount - progress.approvedCount, 0) : scenes.length;
    const currentWarnings = currentSceneState?.warnings?.length ? currentSceneState.warnings.join("；") : "";
    return (
        <div className="studio-panel-muted grid gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">场次推进</div>
                <Space size={6} wrap>
                    <Tag className="m-0">已批准 {approvedCount}</Tag>
                    <Tag className="m-0" color={pendingCount ? "orange" : "green"}>
                        未完成 {pendingCount}
                    </Tag>
                    {progress?.rejectedCount ? (
                        <Tag className="m-0" color="red">
                            驳回 {progress.rejectedCount}
                        </Tag>
                    ) : null}
                    {progress?.errorCount ? (
                        <Tag className="m-0" color="red">
                            失败 {progress.errorCount}
                        </Tag>
                    ) : null}
                    <Button size="small" onClick={onSummarize} disabled={!approvedCount}>
                        汇总已批准场次
                    </Button>
                </Space>
            </div>
            {scenes.length ? (
                <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="grid content-start gap-2">
                        {scenes.map((scene) => {
                            const state = sceneStates.find((item) => item.sceneKey === scene.sceneKey);
                            const selected = scene.sceneKey === selectedSceneKey;
                            return (
                                <button
                                    key={scene.sceneKey}
                                    type="button"
                                    className={`rounded-md border px-3 py-2 text-left text-sm transition ${selected ? "border-teal-600 bg-teal-700/10 dark:border-teal-200 dark:bg-teal-200/10" : "border-stone-950/10 bg-white/45 hover:bg-stone-950/5 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/10"}`}
                                    onClick={() => onSceneChange(scene.sceneKey)}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{scene.sceneLabel}</span>
                                        <StatusTag status={(state?.status || "idle") as AgentWorkflowStageState["status"]} />
                                    </div>
                                    <div className="mt-1 text-xs text-stone-500">{sceneSourceLabel(scene.source)}</div>
                                    {state?.blockedReason || state?.errorMessage ? <div className="mt-1 text-xs text-amber-600">{state.blockedReason || state.errorMessage}</div> : null}
                                </button>
                            );
                        })}
                    </div>
                    <div className="studio-panel-muted grid gap-3 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">当前：{currentScene?.sceneLabel || "未选择场次"}</span>
                            <StatusTag status={(currentSceneState?.status || "idle") as AgentWorkflowStageState["status"]} />
                            {currentSceneState?.evidenceIds.length ? <Tag className="m-0">审核证据 {currentSceneState.evidenceIds.length}</Tag> : null}
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                            <InfoBlock label="场次视觉 DNA" value={currentSceneState?.visualDnaSummary || "尚未产出"} />
                            <InfoBlock label="生成 P / 镜头 P 拆分表" value={currentSceneState?.promptPlanSummary || "尚未产出"} />
                            <InfoBlock label="单 P 任务卡 / Seedance 提示词" value={currentSceneState?.promptTextSummary || "尚未产出"} />
                            <InfoBlock label="工业化预检记录" value={currentSceneState?.industrialPrecheckSummary || "尚未产出"} />
                        </div>
                        {currentWarnings ? <Alert type="warning" showIcon title={currentWarnings} /> : null}
                        {currentSceneState?.blockedReason ? <Alert type="warning" showIcon title={currentSceneState.blockedReason} /> : null}
                        {currentSceneState?.errorMessage ? <Alert type="error" showIcon title={currentSceneState.errorMessage} /> : null}
                        <div className="grid gap-2">
                            <Input placeholder="可选子场次编号，例如 scene-1-a" value={subSceneKey} onChange={(event) => onSubSceneKeyChange(event.target.value)} />
                            <div className="thin-scrollbar max-h-28 overflow-auto rounded-md bg-white/70 p-2 text-xs leading-5 text-stone-500 dark:bg-black/20">{currentScene?.scriptText || "暂无当前场次剧本片段"}</div>
                        </div>
                        <Space size={6} wrap>
                            <Button size="small" type="primary" icon={<Play className="size-3.5" />} disabled={!currentScene} loading={isRunning} onClick={onRun}>
                                运行当前场次草案
                            </Button>
                            {currentSceneState?.status === "review" ? (
                                <>
                                    <Input.TextArea className="min-w-80" rows={2} placeholder="当前场次审核备注" value={reviewNote} onChange={(event) => onReviewNoteChange(event.target.value)} />
                                    <Button size="small" type="primary" icon={<CheckCircle2 className="size-3.5" />} disabled={!currentSceneState.runnerRunId} onClick={() => currentSceneState.runnerRunId && onApprove(currentSceneState.runnerRunId)}>
                                        批准当前场次
                                    </Button>
                                    <Button size="small" danger icon={<XCircle className="size-3.5" />} disabled={!currentSceneState.runnerRunId} onClick={() => currentSceneState.runnerRunId && onReject(currentSceneState.runnerRunId)}>
                                        驳回当前场次
                                    </Button>
                                </>
                            ) : null}
                        </Space>
                    </div>
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可推进场次。请先导入剧本或生成分镜头表。" />
            )}
        </div>
    );
}

function PreviewList({
    previews,
    appliedPreviewItemIds,
    applyingPreviewIds,
    hasCanvas,
    onApplyPreview,
}: {
    previews: AgentWorkflowMappingPreview[];
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    hasCanvas: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
}) {
    return (
        <div className="grid gap-2 rounded-lg border border-dashed border-teal-500/35 bg-teal-700/5 p-3 dark:border-teal-200/25 dark:bg-teal-200/5">
            {previews.map((preview) => {
                const counts = previewCounts(preview, appliedPreviewItemIds);
                const disabledReason = previewApplyDisabledReason(preview, counts.pending, hasCanvas);
                return (
                    <div key={preview.previewId} className="studio-panel-muted p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0">{previewTypeName(preview.targetType)}</Tag>
                            <span className="font-medium">{preview.title}</span>
                            <Tag className="m-0">待写入 {counts.pending}</Tag>
                            <Tag className="m-0" color={counts.applied ? "green" : undefined}>
                                已写入 {counts.applied}
                            </Tag>
                            <Button size="small" type="primary" disabled={Boolean(disabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyPreview(preview)}>
                                {previewActionLabel(preview.targetType)}
                            </Button>
                        </div>
                        <div className="mt-1 text-stone-600 dark:text-stone-300">{preview.summary}</div>
                        {preview.warnings.length ? <div className="mt-1 text-amber-600">提示：{preview.warnings.join("；")}</div> : null}
                        {disabledReason ? <div className="mt-1 text-stone-500">{disabledReason}</div> : null}
                        <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-stone-500">映射字段 / 流程追溯</summary>
                            <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-50">{JSON.stringify(preview, null, 2)}</pre>
                        </details>
                    </div>
                );
            })}
        </div>
    );
}

function PreviewSummaryRow({
    targetType,
    previews,
    appliedPreviewItemIds,
    hasCanvas,
    applyingPreviewIds,
    onApplyPreview,
}: {
    targetType: AgentWorkflowMappingPreview["targetType"];
    previews: AgentWorkflowMappingPreview[];
    appliedPreviewItemIds: string[];
    hasCanvas: boolean;
    applyingPreviewIds: Record<string, boolean>;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
}) {
    const latest = previews[0];
    const counts = latest ? previewCounts(latest, appliedPreviewItemIds) : { total: 0, applied: 0, pending: 0 };
    const disabledReason = latest ? previewApplyDisabledReason(latest, counts.pending, hasCanvas) : "尚未生成预览";
    return (
        <div className="studio-panel-muted flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <Tag className="m-0">预览</Tag>
                    <span className="font-medium">{previewTypeName(targetType)}</span>
                    <Tag className="m-0">总计 {counts.total}</Tag>
                    <Tag className="m-0" color={counts.applied ? "green" : undefined}>
                        已写入 {counts.applied}
                    </Tag>
                    <Tag className="m-0" color={counts.pending ? "orange" : undefined}>
                        待写入 {counts.pending}
                    </Tag>
                </div>
                {disabledReason ? <div className="mt-1 text-xs text-stone-500">{disabledReason}</div> : null}
            </div>
            {latest ? (
                <Button size="small" type="primary" disabled={Boolean(disabledReason)} loading={Boolean(applyingPreviewIds[latest.previewId])} onClick={() => onApplyPreview(latest)}>
                    {previewActionLabel(targetType)}
                </Button>
            ) : null}
        </div>
    );
}

function TitleWithIcon({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <span className="inline-flex items-center gap-2">
            {icon}
            {title}
        </span>
    );
}

function StageReadingList({ requiredReadings, readingRecords }: { requiredReadings: WorkflowRequiredReading[]; readingRecords: AgentWorkflowStageState["readingRecords"] }) {
    if (!requiredReadings.length) return null;
    return (
        <div className="studio-panel-muted p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-stone-500">规范读取清单</div>
                <div className="text-xs text-stone-500">这些文件 / 规范需要在运行或审核本阶段前确认读过。</div>
            </div>
            <div className="grid gap-1.5">
                {requiredReadings.map((reading) => {
                    const record = readingRecords.find((item) => (item.readingId ? item.readingId === reading.readingId : item.sourceFile === reading.sourceFile));
                    const isRead = record?.status === "read";
                    return (
                        <div key={reading.readingId} className="grid gap-2 rounded-md border border-stone-950/10 bg-white/45 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.035] md:grid-cols-[auto_auto_minmax(0,1fr)] md:items-start">
                            <Tag className="m-0 w-fit" color={isRead ? "green" : "red"}>
                                {isRead ? "已读" : "未读"}
                            </Tag>
                            <Tag className="m-0 w-fit">{readingSourceTypeLabel(reading.sourceType)}</Tag>
                            <div className="min-w-0">
                                <div className="font-medium text-stone-800 dark:text-stone-100">{reading.label}</div>
                                <div className="mt-1 break-all font-mono text-[11px] leading-5 text-stone-500">{reading.sourceFile}</div>
                                {reading.note ? <div className="mt-1 text-stone-500">{reading.note}</div> : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function readingSourceTypeLabel(type: WorkflowRequiredReading["sourceType"]) {
    const labels: Record<WorkflowRequiredReading["sourceType"], string> = {
        agent: "Agent",
        skill: "Skill",
        template: "模板",
        example: "示例",
        tool: "工具",
        rule: "规则",
    };
    return labels[type];
}

function InfoBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="studio-panel-muted p-3 text-sm">
            <div className="mb-1 text-xs text-stone-500">{label}</div>
            <div className="leading-6">{value}</div>
        </div>
    );
}

function StatusTag({ status }: { status: AgentWorkflowDisplayStatus }) {
    const color = status === "approved" ? "green" : status === "review" ? "blue" : status === "running" ? "processing" : status === "rejected" || status === "error" ? "red" : status === "blocked" || status === "partial" ? "orange" : undefined;
    return (
        <Tag className="m-0" color={color}>
            {workflowStageStatusLabel(status)}
        </Tag>
    );
}

function previewCounts(preview: AgentWorkflowMappingPreview, appliedPreviewItemIds: string[]) {
    const creatable = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
    const applied = creatable.filter((item) => appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
    return { total: creatable.length, applied, pending: creatable.length - applied };
}

function findVideoPreviewItemIdsForPackage(preview: AgentWorkflowMappingPreview, pkg: CanvasHandoffImportTarget) {
    const exactId = `video_node-${pkg.order}`;
    const videoItems = preview.items.filter((item) => item.targetType === "video_node" && item.action !== "skip");
    const exactItem = videoItems.find((item) => item.itemId === exactId);
    if (exactItem) return [exactItem.itemId];
    const orderLabel = `P${padEpisodeOrder(pkg.order)}`.toLowerCase();
    const title = pkg.title.trim().toLowerCase();
    const matched = videoItems.filter((item) => {
        const text = [item.itemId, item.title, item.reason, item.sourceText, JSON.stringify(item.mappedFields || {})].join(" ").toLowerCase();
        return text.includes(pkg.id.toLowerCase()) || text.includes(orderLabel) || Boolean(title && text.includes(title));
    });
    if (matched.length) return matched.map((item) => item.itemId);
    return videoItems[pkg.order - 1] ? [videoItems[pkg.order - 1].itemId] : [];
}

function previewApplyDisabledReason(preview: AgentWorkflowMappingPreview, pendingCount: number, hasCanvas: boolean) {
    if (preview.targetType === "storyboard_table" && !hasCanvas) return "缺少 canvasId，不能写入分镜头表";
    if (preview.targetType === "video_node" && !hasCanvas) return "缺少 canvasId，不能创建视频配置节点";
    if (!pendingCount) return preview.targetType === "production_bible" ? "已写入设定库或没有可写入条目" : preview.targetType === "storyboard_table" ? "已写入分镜头表或没有可写入条目" : "已创建视频配置节点或没有可创建条目";
    return "";
}

function previewActionLabel(targetType: AgentWorkflowMappingPreview["targetType"]) {
    if (targetType === "production_bible") return "写入设定库";
    if (targetType === "storyboard_table") return "写入分镜头表";
    return "创建视频配置节点";
}

function previewTypeName(targetType: AgentWorkflowMappingPreview["targetType"]) {
    if (targetType === "production_bible") return "设定库预览";
    if (targetType === "storyboard_table") return "分镜头表预览";
    return "视频节点预览";
}

function withSubScene(scene: EpisodeSceneOption, subSceneKey: string): EpisodeSceneOption {
    const suffix = subSceneKey.trim();
    if (!suffix) return scene;
    return {
        ...scene,
        sceneKey: `${scene.sceneKey}:${suffix}`,
        sceneLabel: `${scene.sceneLabel} · ${suffix}`,
    };
}

function sceneSourceLabel(source: EpisodeSceneOption["source"]) {
    if (source === "storyboard_table") return "来源：分镜头表";
    if (source === "script_scene") return "来源：剧本场次";
    return "来源：剧本文本标题";
}

function formatBlockedReason(reason?: string) {
    const value = reason?.trim();
    if (!value) return "前置阶段未批准";
    return value.replace("director-analysis", "导演分析").replace("art-design", "服化道美术设计").replace("seedance-storyboard", "Seedance 分镜");
}
