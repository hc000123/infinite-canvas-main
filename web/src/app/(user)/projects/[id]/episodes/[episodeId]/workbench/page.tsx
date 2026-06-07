"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, App, Button, Card, Collapse, Drawer, Empty, Input, Space, Tag } from "antd";
import { CheckCircle2, Clapperboard, FileText, Library, Maximize2, Play, ScrollText, Video, Workflow, XCircle } from "lucide-react";

import { requestImageQuestion } from "@/services/api/image";
import { completeLocalTextTask, failLocalTextTask, startLocalTextTask, summarizeLocalTaskText } from "@/services/local-ai-task-log";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { buildAssetVersionReference } from "../../../../../assets/asset-version-references";
import { CanvasCreateProjectModal } from "../../../../../canvas/components/canvas-create-project-modal";
import { useCanvasStore, type CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import { useProductionBibleStore } from "../../../../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../../../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../../../../canvas/stores/use-storyboard-store";
import { orderedScriptScenes, type ScriptEpisode, type ScriptScene } from "../../../../../canvas/utils/script-management";
import { buildEpisodeScriptSnapshot, canvasEpisodeContextFromEpisode } from "../../../../../canvas/utils/canvas-episode-context";
import type { CanvasProjectPreset } from "../../../../../canvas/utils/canvas-project-preset";
import type { ProductionBibleItem } from "../../../../../canvas/utils/production-bible";
import { orderedStoryboardTableShots, type StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import { buildSeedanceWorkflowPreset, sortedWorkflowStages, workflowStageDetail, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import { useAgentRunnerStore } from "../../../../use-agent-runner-store";
import { getSeedanceWorkflowAgentCore } from "../../../../workflow-agents/seedance-workflow-agents";
import { buildSeedanceQualityGateManifest, evaluateWorkflowQualityGates, getWorkflowStageRequiredReadings, type WorkflowGateCheckResult, type WorkflowRequiredReading } from "../../../../workflow-quality-gates";
import {
    buildWorkflowStageSourceFiles,
    canGenerateWorkflowMappingPreview,
    getWorkflowStageSceneProgress,
    summarizeWorkflowStageDisplayState,
    workflowMappingPreviewItemKey,
    workflowStageStatusLabel,
    type AgentRunInput,
    type AgentWorkflowDisplayStatus,
    type AgentWorkflowMappingPreview,
    type AgentWorkflowMappingPreviewItem,
    type AgentWorkflowRunRecord,
    type AgentWorkflowSceneRunState,
    type AgentWorkflowStageOutput,
    type AgentWorkflowStageState,
} from "../../../../agent-runner";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";

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

type EpisodeDetailRecord = {
    body: string;
    meta?: Array<{ label: string; value: string }>;
    subtitle?: string;
    title: string;
};

type EpisodeStatusTone = "cyan" | "green" | "amber" | "red" | "slate";

type EpisodeModuleAction = {
    disabled?: boolean;
    label: string;
    loading?: boolean;
    onClick: () => void;
    primary?: boolean;
};

type EpisodeModuleRow = {
    actionLabel: string;
    cells: ReactNode[];
    detail: EpisodeDetailRecord;
    highlight?: boolean;
    id: string;
    onAction?: () => void;
    status: string;
    tone?: EpisodeStatusTone;
};

type EpisodeModuleConfig = {
    actions: EpisodeModuleAction[];
    columns: string;
    emptyText: string;
    filters: string[];
    headers: string[];
    rows: EpisodeModuleRow[];
    subtitle: string;
    summary: Array<{ label: string; tone?: EpisodeStatusTone; value: string }>;
    title: string;
};

type WorkflowStageDisplaySummary = ReturnType<typeof summarizeWorkflowStageDisplayState>;
type EpisodeAssetProcessMode = "bind" | "generate";
type EpisodeAssetFilter = "全部" | "缺素材" | "已绑定" | "待生成" | "角色" | "场景" | "道具" | "服装";
type StoryboardPackageDrawerTab = "shots" | "script" | "prompt" | "assets";
type StoryboardPackageStatus = "已确认" | "待编辑" | "待审核" | "缺资产" | "超时" | "待承接";
type StoryboardPackageFilter = "全部" | StoryboardPackageStatus;
type CanvasHandoffStatus = "未导入" | "待导入" | "已导入" | "缺资产" | "已进入画布" | "已生成" | "已回流";
type CanvasHandoffFilter = "全部" | CanvasHandoffStatus;

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

type StoryboardPackageShot = {
    action: string;
    camera: string;
    duration: number;
    id: string;
    order: number;
    prompt: string;
    title: string;
};

type StoryboardProductionPackage = {
    assetLabels: string[];
    duration: number;
    id: string;
    order: number;
    promptSummary: string;
    scriptText: string;
    segmentId: string;
    shots: StoryboardPackageShot[];
    status: StoryboardPackageStatus;
    summary: string;
    title: string;
    tone: EpisodeStatusTone;
};

type StoryboardStorySegment = {
    duration: number;
    id: string;
    order: number;
    packages: StoryboardProductionPackage[];
    scriptRange: string;
    scriptText: string;
    status: string;
    title: string;
    tone: EpisodeStatusTone;
};

type CanvasHandoffPackageRow = {
    assetState: string;
    canImport: boolean;
    importedNodeCount: number;
    pkg: StoryboardProductionPackage;
    segment: StoryboardStorySegment;
    status: CanvasHandoffStatus;
    tone: EpisodeStatusTone;
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
    const [createCanvasOpen, setCreateCanvasOpen] = useState(false);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [sceneReviewNotes, setSceneReviewNotes] = useState<Record<string, string>>({});
    const [selectedSceneKey, setSelectedSceneKey] = useState("");
    const [subSceneKey, setSubSceneKey] = useState("");
    const [runningStageIds, setRunningStageIds] = useState<Record<string, boolean>>({});
    const [runningSceneKeys, setRunningSceneKeys] = useState<Record<string, boolean>>({});
    const [applyingPreviewIds, setApplyingPreviewIds] = useState<Record<string, boolean>>({});
    const [activeStageIds, setActiveStageIds] = useState<string[]>([]);
    const [activeModule, setActiveModule] = useState<EpisodeModuleKey>("director");
    const [detailRecord, setDetailRecord] = useState<EpisodeDetailRecord | null>(null);
    const [initialModuleSynced, setInitialModuleSynced] = useState(false);
    const preset = useMemo(() => buildSeedanceWorkflowPreset(), []);
    const stages = useMemo(() => sortedWorkflowStages(preset), [preset]);
    const stageSceneRows = useMemo(() => orderedScriptScenes(scenes, episodeId), [episodeId, scenes]);
    const scriptSnapshot = useMemo(() => (episode ? buildEpisodeScriptSnapshot(episode, stageSceneRows) : ""), [episode, stageSceneRows]);
    const boundCanvas = useMemo(() => canvases.find((canvas) => canvas.projectId === projectId && canvas.episodeId === episodeId), [canvases, episodeId, projectId]);
    const episodeTableShots = useMemo(() => (boundCanvas ? orderedStoryboardTableShots(storyboardTableShots, boundCanvas.id, episodeId) : []), [boundCanvas, episodeId, storyboardTableShots]);
    const sceneOptions = useMemo(() => buildEpisodeSceneOptions({ tableShots: episodeTableShots, scriptScenes: stageSceneRows, scriptSnapshot }), [episodeTableShots, scriptSnapshot, stageSceneRows]);
    const workflowRun = useMemo(
        () => workflowRuns.find((run) => run.projectId === projectId && run.canvasId === boundCanvas?.id && run.episodeId === episodeId && run.workflowId === preset.workflowId),
        [boundCanvas?.id, episodeId, preset.workflowId, projectId, workflowRuns],
    );
    const qualityGateManifest = useMemo(() => buildSeedanceQualityGateManifest({ workflowId: preset.workflowId, version: preset.version }), [preset.version, preset.workflowId]);
    const previews = useMemo(() => (workflowRun ? workflowMappingPreviews.filter((preview) => preview.workflowRunId === workflowRun.id) : []), [workflowMappingPreviews, workflowRun]);
    const stageOutputs = useMemo(() => Object.fromEntries(stages.map((stage) => [stage.stageId, stageOutput(workflowRun, workflowOutputs, stage.stageId)])), [stages, workflowOutputs, workflowRun]);
    const hasScript = Boolean(scriptSnapshot.trim());

    useEffect(() => {
        if (episode) setScriptDraft(scriptSnapshot);
    }, [episode, scriptSnapshot]);

    useEffect(() => {
        setInitialModuleSynced(false);
    }, [episodeId]);

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

    const createBoundCanvas = (title: string, preset: CanvasProjectPreset) => {
        const canvasId = createCanvas(title, preset, { projectId: project.id, episodeContext: canvasEpisodeContextFromEpisode(project.id, episode, stageSceneRows) });
        attachCanvas(project.id, canvasId);
        setCreateCanvasOpen(false);
        message.success("已创建承接画布");
        router.push(`/canvas/${canvasId}`);
    };

    const runStage = async (stage: AgentWorkflowStage) => {
        if (!hasScript) {
            message.warning("请先导入本集剧本");
            return;
        }
        const workflowRunId = ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
        const currentRun = workflowRuns.find((run) => run.id === workflowRunId) || workflowRun;
        const stageState = currentRun?.stageStates.find((item) => item.stageId === stage.stageId);
        if (stageState?.status === "blocked") {
            message.warning(stageState.blockedReason || "前置阶段未批准");
            return;
        }
        const core = getSeedanceWorkflowAgentCore(stage.stageId);
        if (!core) return message.error("缺少当前阶段 Agent Core");
        const textModel = (effectiveConfig.textModel || effectiveConfig.model || "").trim();
        const requestConfig = { ...effectiveConfig, model: textModel || effectiveConfig.model };
        const directorSummary = stageOutputs["director-analysis"]?.summary || "";
        const artSummary = stageOutputs["art-design"]?.summary || "";
        const coreInput = core.buildInput({
            preset,
            inputSnapshot: {
                projectId,
                projectTitle: project.title,
                canvasId: boundCanvas?.id,
                episodeId,
                episodeTitle: episode.title,
                scriptSnapshot,
                stageSummary: `${stage.inputSummary}；输出目标：${stage.outputSummary}`,
                directorOutputSummary: directorSummary,
                artDesignOutputSummary: artSummary,
                storyboardRequirement:
                    stage.qualityGateIds
                        .map((gateId) => preset.qualityGates.find((gate) => gate.gateId === gateId)?.purpose)
                        .filter(Boolean)
                        .join("；") || stage.outputSummary,
                assetNeedSummary: artSummary,
            },
        });
        const sourceFiles = buildWorkflowStageSourceFiles(coreInput.skills, coreInput.qualityGates);
        const promptMessages = core.buildPromptMessages(coreInput, preset);
        const runInput: AgentRunInput = {
            projectId,
            canvasId: boundCanvas?.id,
            episodeId,
            episodeTitle: episode.title,
            scriptId: projectId,
            scriptSnapshot,
            sourceType: "episode_production_workbench",
            sourceId: stage.stageId,
            variables: { stageId: stage.stageId },
            workflowRunId,
            workflowId: preset.workflowId,
            workflowVersion: preset.version,
            stageId: core.stageId,
            agentId: core.agentId,
            agentName: coreInput.agent.name,
            sourcePresetId: preset.workflowId,
            presetId: preset.workflowId,
            inputSnapshot: { stageName: stage.name, stageSummary: stage.inputSummary },
            promptMessages,
            model: textModel,
            provider: `openai-${effectiveConfig.channelMode}`,
            configSummary: JSON.stringify({ model: textModel, baseUrl: effectiveConfig.baseUrl, channelMode: effectiveConfig.channelMode, textModelList: effectiveConfig.textModels }, null, 2),
            sourceFiles,
            qualityGateIds: coreInput.qualityGates.map((gate) => gate.gateId),
        };
        const runId = startWorkflowTextRun(runInput);
        setRunningStageIds((current) => ({ ...current, [stage.stageId]: true }));
        if (!textModel || !checkAiConfigReady(effectiveConfig, textModel)) {
            const reason = textModel ? "当前 API 配置或文本模型不可用" : "未配置文本模型";
            failWorkflowTextRun(runId, reason);
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
            return message.warning(reason);
        }
        let localTaskId: string | undefined;
        try {
            localTaskId = startLocalTextTask(requestConfig, {
                ...runInput,
                sourceType: "workflow_text_stage",
                inputSummary: summarizeLocalTaskText(`${stage.name}：${stage.inputSummary}\n${scriptSnapshot}`),
            });
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            completeLocalTextTask(localTaskId, response || "没有返回内容");
            message.success(`${stage.name} 草案已生成，待审核`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            failLocalTextTask(localTaskId, reason);
            message.warning(reason);
        } finally {
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
        }
    };

    const selectedBaseScene = sceneOptions.find((scene) => scene.sceneKey === selectedSceneKey);
    const currentScene = selectedBaseScene ? withSubScene(selectedBaseScene, subSceneKey) : undefined;
    const currentSceneState = currentScene ? workflowRun?.sceneStates?.find((scene) => scene.stageId === "seedance-storyboard" && scene.sceneKey === currentScene.sceneKey) : undefined;

    const runStoryboardScene = async () => {
        const stage = stages.find((item) => item.stageId === "seedance-storyboard");
        if (!stage) return;
        if (!hasScript) return message.warning("请先导入本集剧本");
        if (!currentScene) return message.warning("请先选择当前场次 / 子场次");
        const workflowRunId = ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
        const currentRun = workflowRuns.find((run) => run.id === workflowRunId) || workflowRun;
        const stageState = currentRun?.stageStates.find((item) => item.stageId === stage.stageId);
        if (stageState?.status === "blocked") return message.warning(stageState.blockedReason || "前置阶段未批准");
        const unfinishedScene = currentRun?.sceneStates?.find((scene) => scene.stageId === "seedance-storyboard" && scene.sceneKey !== currentScene.sceneKey && ["running", "review"].includes(scene.status));
        if (unfinishedScene) return message.warning(`请先完成当前场次审核：${unfinishedScene.sceneLabel}`);
        const core = getSeedanceWorkflowAgentCore(stage.stageId);
        if (!core) return message.error("缺少分镜师 Agent Core");
        const textModel = (effectiveConfig.textModel || effectiveConfig.model || "").trim();
        const requestConfig = { ...effectiveConfig, model: textModel || effectiveConfig.model };
        const directorSummary = stageOutputs["director-analysis"]?.summary || "";
        const artSummary = stageOutputs["art-design"]?.summary || "";
        const sourceFiles = buildWorkflowStageSourceFiles(workflowStageDetail(preset, stage).skills, workflowStageDetail(preset, stage).qualityGates);
        const coreInput = core.buildInput({
            preset,
            inputSnapshot: {
                projectId,
                projectTitle: project.title,
                canvasId: boundCanvas?.id,
                episodeId,
                episodeTitle: episode.title,
                scriptSnapshot,
                stageSummary: "阶段三按场次 / 子场次推进；本次只处理当前选中场次。",
                sceneKey: currentScene.sceneKey,
                sceneLabel: currentScene.sceneLabel,
                sceneScriptText: currentScene.scriptText,
                sceneVisualDnaSummary: currentSceneState?.visualDnaSummary,
                previousSceneSummary: previousApprovedSceneSummary(workflowRun?.sceneStates || [], currentScene.sceneKey),
                directorOutputSummary: directorSummary,
                artDesignOutputSummary: artSummary,
                storyboardRequirement: "先输出场次视觉 DNA，再输出生成 P / 镜头 P 拆分表、单 P 任务卡、Seedance 提示词正文和工业化预检记录摘要。",
                assetNeedSummary: artSummary,
            },
        });
        const promptMessages = core.buildPromptMessages(coreInput, preset);
        const runInput: AgentRunInput = {
            projectId,
            canvasId: boundCanvas?.id,
            episodeId,
            episodeTitle: episode.title,
            scriptId: projectId,
            scriptSnapshot: currentScene.scriptText || scriptSnapshot,
            sourceType: "episode_production_workbench_scene",
            sourceId: currentScene.sceneKey,
            variables: { stageId: stage.stageId, sceneKey: currentScene.sceneKey, sceneLabel: currentScene.sceneLabel },
            workflowRunId,
            workflowId: preset.workflowId,
            workflowVersion: preset.version,
            stageId: core.stageId,
            agentId: core.agentId,
            agentName: coreInput.agent.name,
            sourcePresetId: preset.workflowId,
            presetId: preset.workflowId,
            inputSnapshot: { stageName: stage.name, sceneKey: currentScene.sceneKey, sceneLabel: currentScene.sceneLabel },
            promptMessages,
            model: textModel,
            provider: `openai-${effectiveConfig.channelMode}`,
            configSummary: JSON.stringify({ model: textModel, baseUrl: effectiveConfig.baseUrl, channelMode: effectiveConfig.channelMode, textModelList: effectiveConfig.textModels }, null, 2),
            sourceFiles,
            qualityGateIds: coreInput.qualityGates.map((gate) => gate.gateId),
        };
        const runId = startWorkflowTextRun(runInput);
        setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: true }));
        if (!textModel || !checkAiConfigReady(effectiveConfig, textModel)) {
            const reason = textModel ? "当前 API 配置或文本模型不可用" : "未配置文本模型";
            failWorkflowTextRun(runId, reason);
            setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: false }));
            return message.warning(reason);
        }
        let localTaskId: string | undefined;
        try {
            localTaskId = startLocalTextTask(requestConfig, {
                ...runInput,
                sourceType: "workflow_text_stage",
                inputSummary: summarizeLocalTaskText(`${stage.name}：${currentScene.sceneLabel}\n${currentScene.scriptText || scriptSnapshot}`),
            });
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            completeLocalTextTask(localTaskId, response || "没有返回内容");
            message.success(`${currentScene.sceneLabel} 草案已生成，待审核`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            failLocalTextTask(localTaskId, reason);
            message.warning(reason);
        } finally {
            setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: false }));
        }
    };

    const summarizeStoryboardScenes = () => {
        if (!workflowRun) return;
        const result = summarizeApprovedStoryboardScenes(workflowRun.id);
        if (!result.ok) message.warning(result.reason || "无法汇总已批准场次");
        else message.success(`已汇总 ${result.sceneCount || 0} 个已批准场次，可生成第三阶段预览`);
    };

    const generatePreview = (stageId: string, targetLabel: string) => {
        if (!workflowRun) return;
        const result = generateWorkflowMappingPreview(workflowRun.id, stageId);
        if (!result.ok) message.warning(result.reason || "当前阶段不能生成映射预览");
        else message.success(`已生成 ${targetLabel}`);
    };

    const confirmApplyPreview = (preview: AgentWorkflowMappingPreview) => {
        const creatableCount = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create" && !workflowAppliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
        const labels = previewTargetLabels(preview.targetType);
        modal.confirm({
            title: labels.confirmTitle,
            content: `${labels.confirmContentPrefix}${creatableCount} 条。不会自动生成图片，不会自动生成视频，不会触发扣费。`,
            okText: labels.okText,
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
                    message.success(`${labels.doneText}${result.appliedCount || 0} 条`);
                    if (result.warnings.length) message.info(result.warnings.join("；"));
                } finally {
                    setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: false }));
                }
            },
        });
    };

    const openCanvasOrCreate = () => (boundCanvas ? router.push(`/canvas/${boundCanvas.id}`) : setCreateCanvasOpen(true));

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
                onApplyPreview={confirmApplyPreview}
                onBackProject={() => router.push(`/projects/${project.id}`)}
                onCreateCanvas={() => setCreateCanvasOpen(true)}
                onGeneratePreview={generatePreview}
                onModuleChange={setActiveModule}
                onOpenCanvas={openCanvasOrCreate}
                onOpenDetail={setDetailRecord}
                onRunStage={(stageId) => {
                    const stage = stages.find((item) => item.stageId === stageId);
                    if (stage) void runStage(stage);
                }}
                onRunStoryboardScene={() => void runStoryboardScene()}
                onSaveScript={saveScript}
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
            <CanvasCreateProjectModal
                open={createCanvasOpen}
                defaultTitle={`${episode.title} 承接画布`}
                initialPreset={project.preset}
                config={effectiveConfig}
                modalTitle="创建承接画布"
                helperText="这一步会把当前集绑定到新画布，用于承接分镜头表、Seedance 提示词和视频配置节点；不会自动生成图片或视频。"
                onCancel={() => setCreateCanvasOpen(false)}
                onCreate={createBoundCanvas}
            />
        </main>
    );

}

const episodeModules: Array<{ key: EpisodeModuleKey; label: string }> = [
    { key: "script", label: "剧本" },
    { key: "director", label: "导演分析" },
    { key: "assets", label: "资产提取" },
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
    episode,
    episodeTableShots,
    hasScript,
    onApplyPreview,
    onBackProject,
    onCreateCanvas,
    onGeneratePreview,
    onModuleChange,
    onOpenCanvas,
    onOpenDetail,
    onRunStage,
    onRunStoryboardScene,
    onSaveScript,
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
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onBackProject: () => void;
    onCreateCanvas: () => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onModuleChange: (module: EpisodeModuleKey) => void;
    onOpenCanvas: () => void;
    onOpenDetail: (record: EpisodeDetailRecord) => void;
    onRunStage: (stageId: string) => void;
    onRunStoryboardScene: () => void;
    onSaveScript: () => void;
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
    const storyboardPreview = latestPreview(previews, "storyboard_table");
    const videoPreview = latestPreview(previews, "video_node");
    const currentPhase = buildEpisodePhaseText({ artDisplay, boundCanvas, directorDisplay, episodeTableShots, hasScript, productionBiblePreview, storyboardDisplay, storyboardPreview, videoPreview });
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
    const tabs = episodeModules.map((module) => ({
        ...module,
        badge:
            module.key === "script"
                ? hasScript
                    ? "已导入"
                    : "待导入"
                : module.key === "director"
                  ? workflowDisplayText(directorDisplay)
                  : module.key === "assets"
                    ? productionBiblePreview
                        ? `${previewCounts(productionBiblePreview, appliedPreviewItemIds).pending} 待写入`
                        : workflowDisplayText(artDisplay)
                    : module.key === "storyboard"
                      ? episodeTableShots.length
                          ? `${episodeTableShots.length} 镜头`
                          : workflowDisplayText(storyboardDisplay)
                      : boundCanvas
                        ? "已绑定"
                        : "未绑定",
    }));
    const moduleConfig = buildEpisodeModuleConfig({
        activeModule,
        appliedPreviewItemIds,
        applyingPreviewIds,
        boundCanvas,
        currentScene,
        currentSceneState,
        episode,
        episodeTableShots,
        hasScript,
        onApplyPreview,
        onGeneratePreview,
        onOpenCanvas,
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
                    <Button className="w-fit" type="primary" disabled={!scriptDraft.trim()} onClick={onSaveScript}>
                        保存本集剧本
                    </Button>
                </div>
            </details>
        ) : undefined;
    const bindExtractedAsset = (row: EpisodeExtractedAsset, asset: Asset) => {
        if (!row.productionBibleItem) {
            message.warning("请先将资产提取结果写入设定库，再绑定项目资产库素材。");
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
        message.info("已准备生成参数；请在生图工作台确认后生成，结果会回流项目资产库并绑定。");
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
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">
                            当前阶段：{currentPhase} · 导演分析 {workflowDisplayText(directorDisplay)} · 资产提取 {productionBiblePreview ? `${productionBiblePreview.items.length} 项预览` : workflowDisplayText(artDisplay)} · 分镜{" "}
                            {episodeTableShots.length ? `${episodeTableShots.length} 镜头` : workflowDisplayText(storyboardDisplay)}
                        </p>
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
                <EpisodeModuleTabs activeModule={activeModule} onChange={onModuleChange} tabs={tabs} />
            </header>
            <div className="px-6 py-5 xl:px-8">
                {activeModule === "assets" ? (
                    <EpisodeAssetsModulePage
                        appliedPreviewItemIds={appliedPreviewItemIds}
                        applyingPreviewIds={applyingPreviewIds}
                        assets={assetRows}
                        episode={episode}
                        onApplyPreview={onApplyPreview}
                        onBindAsset={bindExtractedAsset}
                        onGeneratePreview={onGeneratePreview}
                        onOpenImageWorkbench={() => {
                            window.location.href = "/image";
                        }}
                        onPrepareGenerate={prepareReferenceGeneration}
                        onRunStage={onRunStage}
                        preview={productionBiblePreview}
                        projectTitle={project.title}
                        runningStageIds={runningStageIds}
                        stageOutputs={stageOutputs}
                    />
                ) : activeModule === "storyboard" ? (
                    <EpisodeStoryboardPackagePage
                        episode={episode}
                        onGeneratePreview={onGeneratePreview}
                        onOpenAssets={() => onModuleChange("assets")}
                        onOpenCanvas={onOpenCanvas}
                        onRunStoryboardScene={onRunStoryboardScene}
                        projectTitle={project.title}
                        runningStoryboard={currentSceneState?.status === "running"}
                        segments={packageSegments}
                    />
                ) : activeModule === "canvas" ? (
                    <EpisodeCanvasHandoffPage
                        boundCanvas={boundCanvas}
                        episode={episode}
                        onCreateCanvas={onCreateCanvas}
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
    );
}

function EpisodeModuleTabs({ activeModule, onChange, tabs }: { activeModule: EpisodeModuleKey; onChange: (module: EpisodeModuleKey) => void; tabs: Array<{ badge: string; key: EpisodeModuleKey; label: string }> }) {
    return (
        <div className="mt-5 flex flex-wrap gap-2">
            {tabs.map((tab) => {
                const active = tab.key === activeModule;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        className={`rounded-lg border px-4 py-2 text-left transition ${active ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]" : "border-slate-800 bg-slate-950/35 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`}
                        onClick={() => onChange(tab.key)}
                    >
                        <span className="font-semibold">{tab.label}</span>
                        <span className="ml-2 text-xs opacity-70">{tab.badge}</span>
                    </button>
                );
            })}
        </div>
    );
}

function EpisodeAssetsModulePage({
    appliedPreviewItemIds,
    applyingPreviewIds,
    assets,
    episode,
    onApplyPreview,
    onBindAsset,
    onGeneratePreview,
    onOpenImageWorkbench,
    onPrepareGenerate,
    onRunStage,
    preview,
    projectTitle,
    runningStageIds,
    stageOutputs,
}: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    assets: EpisodeExtractedAsset[];
    episode: ScriptEpisode;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onBindAsset: (row: EpisodeExtractedAsset, asset: Asset) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenImageWorkbench: () => void;
    onPrepareGenerate: () => void;
    onRunStage: (stageId: string) => void;
    preview?: AgentWorkflowMappingPreview;
    projectTitle: string;
    runningStageIds: Record<string, boolean>;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
}) {
    const [filter, setFilter] = useState<EpisodeAssetFilter>("全部");
    const [selectedAssetId, setSelectedAssetId] = useState("");
    const [processMode, setProcessMode] = useState<EpisodeAssetProcessMode>("bind");
    const filteredAssets = assets.filter((asset) => filterEpisodeExtractedAssets(asset, filter));
    const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || filteredAssets[0] || assets[0];
    const summary = summarizeEpisodeExtractedAssets(assets);
    const previewCountsResult = preview ? previewCounts(preview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };

    useEffect(() => {
        if (!assets.length) {
            setSelectedAssetId("");
            return;
        }
        if (!selectedAsset || !filteredAssets.some((asset) => asset.id === selectedAsset.id)) setSelectedAssetId(filteredAssets[0]?.id || assets[0].id);
    }, [assets, filteredAssets, selectedAsset]);

    const openAssetProcess = (asset: EpisodeExtractedAsset, mode: EpisodeAssetProcessMode) => {
        setSelectedAssetId(asset.id);
        setProcessMode(mode);
    };

    return (
        <section className="grid gap-5">
            <div className="grid gap-4 border-b border-slate-800 pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">资产提取</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title} · 资产提取</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">从剧本和导演分析中提取角色、场景、道具、服装，可优先绑定项目资产库已有素材，缺素材时再按提示词生成参考图。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" onClick={() => (stageOutputs["art-design"] ? onGeneratePreview("art-design", "设定库预览") : onRunStage("art-design"))} loading={Boolean(runningStageIds["art-design"])}>
                        {stageOutputs["art-design"] ? "刷新资产预览" : "运行资产提取"}
                    </Button>
                    <Button type="primary" disabled={!preview || previewCountsResult.pending <= 0} loading={Boolean(preview && applyingPreviewIds[preview.previewId])} onClick={() => preview && onApplyPreview(preview)}>
                        写入设定库 {previewCountsResult.pending ? previewCountsResult.pending : ""}
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "角色", value: summary.characters },
                    { label: "场景", value: summary.scenes },
                    { label: "道具", value: summary.props },
                    { label: "服装", value: summary.costumes },
                    { label: "缺素材", tone: summary.missing ? "amber" : "green", value: summary.missing },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass((item.tone as EpisodeStatusTone | undefined) || "slate")}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/88">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                            {(["全部", "缺素材", "已绑定", "待生成", "角色", "场景", "道具", "服装"] as EpisodeAssetFilter[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={`rounded-md border px-3 py-1.5 text-sm transition ${filter === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`}
                                    onClick={() => setFilter(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="text-sm text-slate-500">当前显示 {filteredAssets.length} 条</div>
                    </div>
                    <EpisodeAssetTable assets={filteredAssets} selectedAssetId={selectedAsset?.id || ""} onOpenProcess={openAssetProcess} />
                </div>
                <EpisodeAssetProcessDrawer asset={selectedAsset} mode={processMode} onBindAsset={onBindAsset} onModeChange={setProcessMode} onOpenImageWorkbench={onOpenImageWorkbench} onPrepareGenerate={onPrepareGenerate} />
            </div>
        </section>
    );
}

function EpisodeAssetTable({ assets, onOpenProcess, selectedAssetId }: { assets: EpisodeExtractedAsset[]; onOpenProcess: (asset: EpisodeExtractedAsset, mode: EpisodeAssetProcessMode) => void; selectedAssetId: string }) {
    if (!assets.length) {
        return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的资产。</div>;
    }
    return (
        <div className="overflow-x-auto">
            <div className="min-w-[920px]">
                <div className="grid grid-cols-[90px_minmax(240px,1fr)_110px_90px_100px_150px] gap-4 border-b border-slate-800 px-5 py-3 text-sm font-medium text-slate-500">
                    <div>类型</div>
                    <div>资产</div>
                    <div>项目库</div>
                    <div>生成</div>
                    <div>状态</div>
                    <div>操作</div>
                </div>
                <div className="divide-y divide-slate-800/90">
                    {assets.map((asset) => {
                        const selected = asset.id === selectedAssetId;
                        return (
                            <div
                                key={asset.id}
                                role="button"
                                tabIndex={0}
                                className={`grid w-full grid-cols-[90px_minmax(240px,1fr)_110px_90px_100px_150px] gap-4 border-l-4 px-5 py-4 text-left text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : "border-transparent hover:bg-white/[0.025]"}`}
                                onClick={() => onOpenProcess(asset, asset.status === "已绑定" ? "bind" : asset.libraryMatchCount ? "bind" : "generate")}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") onOpenProcess(asset, asset.status === "已绑定" ? "bind" : asset.libraryMatchCount ? "bind" : "generate");
                                }}
                            >
                                <div className="self-center font-semibold text-slate-200">{asset.type}</div>
                                <div className="min-w-0 self-center">
                                    <div className="break-words font-semibold text-slate-100">{asset.name}</div>
                                    <div className="mt-1 break-words text-slate-500">{asset.description}</div>
                                </div>
                                <div className="self-center font-semibold text-slate-200">{asset.libraryMatchCount ? `匹配 ${asset.libraryMatchCount}` : "无匹配"}</div>
                                <div className="self-center text-slate-300">{asset.canGenerate ? "可生成" : "-"}</div>
                                <div className="self-center">
                                    <EpisodeStatusPill status={asset.status} tone={asset.tone} />
                                </div>
                                <div className="flex self-center" onClick={(event) => event.stopPropagation()}>
                                    <button type="button" className="rounded-l-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100" onClick={() => onOpenProcess(asset, "bind")}>
                                        绑定
                                    </button>
                                    <button type="button" className="rounded-r-md border border-l-0 border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100" onClick={() => onOpenProcess(asset, "generate")}>
                                        生成
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function EpisodeAssetProcessDrawer({
    asset,
    mode,
    onBindAsset,
    onModeChange,
    onOpenImageWorkbench,
    onPrepareGenerate,
}: {
    asset?: EpisodeExtractedAsset;
    mode: EpisodeAssetProcessMode;
    onBindAsset: (row: EpisodeExtractedAsset, asset: Asset) => void;
    onModeChange: (mode: EpisodeAssetProcessMode) => void;
    onOpenImageWorkbench: () => void;
    onPrepareGenerate: () => void;
}) {
    const [assetSearch, setAssetSearch] = useState("");
    const [kindFilter, setKindFilter] = useState<"全部" | "图片" | "文本" | "视频">("全部");
    const [selectedCandidateId, setSelectedCandidateId] = useState("");
    const [promptDraft, setPromptDraft] = useState("");
    const [model, setModel] = useState("gpt-image-1");
    const [size, setSize] = useState("1024x1024");
    const [count, setCount] = useState("2");
    const candidates = asset ? filterAssetCandidates(asset.candidates, assetSearch, kindFilter) : [];
    const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) || candidates[0];

    useEffect(() => {
        setAssetSearch("");
        setKindFilter("全部");
        setSelectedCandidateId(asset?.candidates[0]?.id || "");
        setPromptDraft(asset?.promptDraft || "");
    }, [asset?.id]);

    if (!asset) {
        return <aside className="rounded-2xl border border-slate-800 bg-[#091018]/88 p-5 text-sm text-slate-500">请选择一条资产进行处理。</aside>;
    }

    return (
        <aside className="rounded-2xl border border-slate-800 bg-[#091018]/92 shadow-[0_18px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="break-words text-2xl font-semibold leading-tight text-slate-50">{asset.name}</h3>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">
                            {asset.type}资产 · {asset.episodeLabel} · {asset.referencedShotLabels.length || 0} 个镜头引用
                        </p>
                    </div>
                    <EpisodeStatusPill status={asset.status} tone={asset.tone} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "bind" ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`} onClick={() => onModeChange("bind")}>
                        绑定已有资产
                    </button>
                    <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "generate" ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`} onClick={() => onModeChange("generate")}>
                        生成参考图
                    </button>
                </div>
            </div>
            <div className="grid gap-4 p-5">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-xs font-semibold text-slate-500">提取描述</div>
                    <div className="mt-2 break-words text-sm leading-6 text-slate-200">{asset.description}</div>
                </div>
                {mode === "bind" ? (
                    <div className="grid gap-4">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                            <Input className="!bg-slate-950/70 !text-slate-100" placeholder="搜索候选素材" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} />
                            <div className="grid grid-cols-4 overflow-hidden rounded-md border border-slate-800">
                                {(["全部", "图片", "文本", "视频"] as const).map((item) => (
                                    <button key={item} type="button" className={`px-2 py-1.5 text-xs ${kindFilter === item ? "bg-cyan-400/15 text-cyan-100" : "bg-slate-950/50 text-slate-500"}`} onClick={() => setKindFilter(item)}>
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid max-h-[340px] gap-2 overflow-auto pr-1">
                            {candidates.length ? (
                                candidates.map((candidate) => (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        className={`grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg border p-2 text-left transition ${selectedCandidate?.id === candidate.id ? "border-cyan-400/70 bg-cyan-400/[0.08]" : "border-slate-800 bg-slate-950/45 hover:border-slate-600"}`}
                                        onClick={() => setSelectedCandidateId(candidate.id)}
                                    >
                                        <AssetCandidateThumb asset={candidate} />
                                        <div className="min-w-0">
                                            <div className="break-words text-sm font-semibold text-slate-100">{candidate.title}</div>
                                            <div className="mt-1 text-xs text-slate-500">{assetKindDisplay(candidate.kind)} · {assetVersionSummary(candidate)}</div>
                                            {candidate.tags.length ? <div className="mt-1 break-words text-xs text-slate-500">{candidate.tags.slice(0, 4).join(" / ")}</div> : null}
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-500">项目资产库暂无匹配候选。</div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" disabled={!selectedCandidate || !asset.productionBibleItem} onClick={() => selectedCandidate && onBindAsset(asset, selectedCandidate)}>
                                绑定选中素材
                            </Button>
                            {!asset.productionBibleItem ? <span className="self-center text-xs text-amber-300">先写入设定库后可确认绑定。</span> : null}
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <div className="text-xs font-semibold text-slate-500">生成提示词草案</div>
                            <Input.TextArea className="!bg-slate-950/70 !text-slate-100" rows={8} value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <label className="grid gap-1 text-xs text-slate-500">
                                模型
                                <Input className="!bg-slate-950/70 !text-slate-100" value={model} onChange={(event) => setModel(event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-500">
                                尺寸
                                <Input className="!bg-slate-950/70 !text-slate-100" value={size} onChange={(event) => setSize(event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-500">
                                数量
                                <Input className="!bg-slate-950/70 !text-slate-100" value={count} onChange={(event) => setCount(event.target.value)} />
                            </label>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm leading-6 text-slate-400">生成结果会先进入项目资产库，再绑定到当前提取资产；后续分镜和画布承接都引用资产库版本。</div>
                        <div className="flex flex-wrap gap-2">
                            <Button type="primary" onClick={onPrepareGenerate}>
                                用提示词生成
                            </Button>
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onOpenImageWorkbench}>
                                打开生图工作台
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}

function EpisodeStoryboardPackagePage({
    episode,
    onGeneratePreview,
    onOpenAssets,
    onOpenCanvas,
    onRunStoryboardScene,
    projectTitle,
    runningStoryboard,
    segments,
}: {
    episode: ScriptEpisode;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    onRunStoryboardScene: () => void;
    projectTitle: string;
    runningStoryboard: boolean;
    segments: StoryboardStorySegment[];
}) {
    const { message } = App.useApp();
    const [filter, setFilter] = useState<StoryboardPackageFilter>("全部");
    const [selectedPackageId, setSelectedPackageId] = useState("");
    const [drawerTab, setDrawerTab] = useState<StoryboardPackageDrawerTab>("shots");
    const allPackages = useMemo(() => segments.flatMap((segment) => segment.packages), [segments]);
    const filteredSegments = useMemo(
        () =>
            segments
                .map((segment) => ({
                    ...segment,
                    packages: segment.packages.filter((pkg) => filterStoryboardPackage(pkg, filter)),
                }))
                .filter((segment) => filter === "全部" || segment.packages.length),
        [filter, segments],
    );
    const selectedPackage = allPackages.find((pkg) => pkg.id === selectedPackageId) || filteredSegments.flatMap((segment) => segment.packages)[0] || allPackages[0];
    const selectedSegment = selectedPackage ? segments.find((segment) => segment.id === selectedPackage.segmentId) : undefined;
    const summary = summarizeStoryboardProductionSegments(segments);

    useEffect(() => {
        if (!allPackages.length) {
            setSelectedPackageId("");
            return;
        }
        if (!selectedPackage || !filterStoryboardPackage(selectedPackage, filter)) {
            setSelectedPackageId(filteredSegments.flatMap((segment) => segment.packages)[0]?.id || allPackages[0].id);
        }
    }, [allPackages, filter, filteredSegments, selectedPackage]);

    const openPackage = (pkg: StoryboardProductionPackage, tab: StoryboardPackageDrawerTab = "shots") => {
        setSelectedPackageId(pkg.id);
        setDrawerTab(tab);
    };
    const notifyAction = (label: string) => message.info(`${label} 已进入交互占位，后续接入生产包编辑能力。`);

    return (
        <section className="grid gap-5">
            <div className="grid gap-4 border-b border-slate-800 pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">分镜生产包</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title} · 分镜生产包</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">分镜 Agent 先拆剧情段落，再生成 15 秒以内生产包；确认后按包导入画布承接。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" loading={runningStoryboard} onClick={onRunStoryboardScene}>
                        重跑段落拆解
                    </Button>
                    <Button type="primary" onClick={() => notifyAction("新增生产包")}>
                        新增生产包
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "剧情段落数", value: summary.segments },
                    { label: "生产包数", value: summary.packages, tone: "cyan" },
                    { label: "包内镜头数", value: summary.shots },
                    { label: "超时包数量", value: summary.timeout, tone: summary.timeout ? "red" : "green" },
                    { label: "缺资产包数量", value: summary.missingAssets, tone: summary.missingAssets ? "amber" : "green" },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass((item.tone as EpisodeStatusTone | undefined) || "slate")}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_450px]">
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/88">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                        <h3 className="text-lg font-semibold text-slate-50">剧情段落与生产包</h3>
                        <div className="flex flex-wrap gap-2">
                            {(["全部", "待编辑", "待审核", "缺资产", "超时", "已确认", "待承接"] as StoryboardPackageFilter[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={`rounded-md border px-3 py-1.5 text-sm transition ${filter === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`}
                                    onClick={() => setFilter(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>
                    <StoryboardPackageList segments={filteredSegments} selectedPackageId={selectedPackage?.id || ""} onAction={notifyAction} onOpenPackage={openPackage} />
                </div>
                <StoryboardPackageProcessDrawer
                    activeTab={drawerTab}
                    pkg={selectedPackage}
                    segment={selectedSegment}
                    onAction={notifyAction}
                    onChangeTab={setDrawerTab}
                    onGeneratePreview={() => onGeneratePreview("seedance-storyboard", "分镜生产包预览")}
                    onOpenAssets={onOpenAssets}
                    onOpenCanvas={onOpenCanvas}
                />
            </div>
        </section>
    );
}

function StoryboardPackageList({
    onAction,
    onOpenPackage,
    segments,
    selectedPackageId,
}: {
    onAction: (label: string) => void;
    onOpenPackage: (pkg: StoryboardProductionPackage, tab?: StoryboardPackageDrawerTab) => void;
    segments: StoryboardStorySegment[];
    selectedPackageId: string;
}) {
    if (!segments.length) {
        return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的生产包。</div>;
    }
    return (
        <div className="max-h-[calc(100vh-360px)] min-h-[520px] overflow-auto">
            <div className="min-w-[800px]">
                {segments.map((segment) => (
                    <div key={segment.id} className="border-b border-slate-800/90 last:border-b-0">
                        <div className="grid grid-cols-[64px_minmax(160px,1fr)_78px_58px_58px_62px_72px_84px] gap-2 bg-slate-950/35 px-5 py-4 text-sm">
                            <div className="self-center text-lg font-semibold text-slate-100">S{padEpisodeOrder(segment.order)}</div>
                            <div className="min-w-0">
                                <div className="break-words font-semibold text-slate-100">{segment.title}</div>
                                <div className="mt-1 break-words text-xs text-slate-500">{segment.scriptRange}</div>
                            </div>
                            <div className="self-center text-slate-300">{segment.duration} 秒</div>
                            <div className="self-center text-slate-300">{segment.packages.length} 包</div>
                            <div className="self-center text-slate-300">{segment.packages.reduce((total, pkg) => total + pkg.shots.length, 0)} 镜</div>
                            <div className="self-center text-slate-300">{segment.packages.reduce((total, pkg) => total + pkg.assetLabels.length, 0)} 项</div>
                            <div className="self-center">
                                <EpisodeStatusPill status={segment.status} tone={segment.tone} />
                            </div>
                            <button type="button" className="self-center rounded-md border border-slate-700 bg-slate-900/80 px-2 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100" onClick={() => segment.packages[0] && onOpenPackage(segment.packages[0], "script")}>
                                查看原文
                            </button>
                        </div>
                        <div className="grid grid-cols-[64px_minmax(170px,1fr)_54px_54px_66px_72px_150px] gap-2 border-y border-slate-800/70 px-5 py-2 text-xs font-medium text-slate-500">
                            <div>生产包</div>
                            <div>包内容</div>
                            <div>时长</div>
                            <div>镜头</div>
                            <div>引用资产</div>
                            <div>状态</div>
                            <div>操作</div>
                        </div>
                        <div className="divide-y divide-slate-800/80">
                            {segment.packages.map((pkg) => {
                                const selected = pkg.id === selectedPackageId;
                                const timeout = pkg.duration > 15 || pkg.status === "超时";
                                return (
                                    <div key={pkg.id}>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            className={`grid grid-cols-[64px_minmax(170px,1fr)_54px_54px_66px_72px_150px] gap-2 border-l-4 px-5 py-4 text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : timeout ? "border-red-400/70 bg-red-500/[0.04] hover:bg-red-500/[0.07]" : "border-transparent hover:bg-white/[0.025]"}`}
                                            onClick={() => onOpenPackage(pkg)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") onOpenPackage(pkg);
                                            }}
                                        >
                                            <div className="self-center text-lg font-semibold text-slate-100">P{padEpisodeOrder(pkg.order)}</div>
                                            <div className="min-w-0 self-center">
                                                <div className="break-words font-semibold text-slate-100">{pkg.title}</div>
                                                <div className="mt-1 break-words text-slate-500">{pkg.summary}</div>
                                                {timeout ? <div className="mt-2 text-xs font-semibold text-red-300">预计超过 15 秒，需要拆分生产包。</div> : null}
                                            </div>
                                            <div className={`self-center font-semibold ${timeout ? "text-red-300" : "text-slate-200"}`}>{pkg.duration}s</div>
                                            <div className="self-center text-slate-300">{pkg.shots.length} 镜</div>
                                            <div className="self-center text-slate-300">{pkg.assetLabels.length ? `${pkg.assetLabels.length} 项` : "缺 1"}</div>
                                            <div className="self-center">
                                                <EpisodeStatusPill status={pkg.status} tone={pkg.tone} />
                                            </div>
                                            <div className="flex flex-wrap gap-2 self-center" onClick={(event) => event.stopPropagation()}>
                                                <StoryboardPackageActionButton label="查看" onClick={() => onOpenPackage(pkg)} />
                                                <StoryboardPackageActionButton label="编辑" onClick={() => onOpenPackage(pkg, "shots")} />
                                                <StoryboardPackageActionButton label="插入后" onClick={() => onAction(`在 P${padEpisodeOrder(pkg.order)} 后插入生产包`)} />
                                                <StoryboardPackageActionButton label={timeout ? "拆分" : "确认"} primary={timeout || pkg.status === "待审核"} onClick={() => onAction(timeout ? "拆分生产包" : "确认本包")} />
                                                <StoryboardPackageActionButton label="合并" onClick={() => onAction("合并到相邻生产包")} />
                                                <StoryboardPackageActionButton label="移动" onClick={() => onAction("移动顺序")} />
                                                <StoryboardPackageActionButton label="重提取" onClick={() => onAction("重提取本包")} />
                                                <StoryboardPackageActionButton label="导入画布" onClick={() => onAction("导入画布承接")} />
                                            </div>
                                        </div>
                                        <button type="button" className="mx-5 my-2 rounded-md border border-dashed border-cyan-500/40 bg-cyan-400/[0.04] px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/[0.08]" onClick={() => onAction(`在 P${padEpisodeOrder(pkg.order)} 后插入生产包`)}>
                                            + 在 P{padEpisodeOrder(pkg.order)} 后插入生产包
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StoryboardPackageActionButton({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
    return (
        <button
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${primary ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/20" : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function StoryboardPackageProcessDrawer({
    activeTab,
    onAction,
    onChangeTab,
    onGeneratePreview,
    onOpenAssets,
    onOpenCanvas,
    pkg,
    segment,
}: {
    activeTab: StoryboardPackageDrawerTab;
    onAction: (label: string) => void;
    onChangeTab: (tab: StoryboardPackageDrawerTab) => void;
    onGeneratePreview: () => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    pkg?: StoryboardProductionPackage;
    segment?: StoryboardStorySegment;
}) {
    const [promptDraft, setPromptDraft] = useState("");
    useEffect(() => {
        setPromptDraft(pkg?.promptSummary || "");
    }, [pkg?.id, pkg?.promptSummary]);

    if (!pkg) return <aside className="rounded-2xl border border-slate-800 bg-[#091018]/88 p-5 text-sm text-slate-500">请选择一个生产包。</aside>;

    return (
        <aside className="rounded-2xl border border-slate-800 bg-[#091018]/92 shadow-[0_18px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="break-words text-2xl font-semibold leading-tight text-slate-50">
                            P{padEpisodeOrder(pkg.order)} · {pkg.title}
                        </h3>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">
                            属于 S{padEpisodeOrder(segment?.order || 1)} · {pkg.duration} 秒 · {pkg.shots.length} 个镜头
                        </p>
                    </div>
                    <EpisodeStatusPill status={pkg.status} tone={pkg.tone} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                    {([
                        ["shots", "包内镜头"],
                        ["script", "原剧本"],
                        ["prompt", "提示词"],
                        ["assets", "资产"],
                    ] as Array<[StoryboardPackageDrawerTab, string]>).map(([key, label]) => (
                        <button key={key} type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${activeTab === key ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`} onClick={() => onChangeTab(key)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid max-h-[calc(100vh-260px)] gap-4 overflow-auto p-5">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-xs font-semibold text-slate-500">生产包约束</div>
                    <div className="mt-2 break-words text-sm leading-6 text-slate-200">
                        当前包预计 {pkg.duration} 秒，{pkg.duration > 15 ? "已超过 15 秒，建议拆分为新生产包。" : "符合 15 秒以内规则，可继续新增镜头；超过后需要拆分。"}
                    </div>
                </div>
                {activeTab === "shots" ? (
                    <div className="grid gap-4">
                        <div className="overflow-hidden rounded-lg border border-slate-800">
                            <div className="grid grid-cols-[48px_minmax(0,1fr)_96px_48px_70px] gap-2 border-b border-slate-800 bg-slate-950/45 px-3 py-2 text-xs font-medium text-slate-500">
                                <div>镜头</div>
                                <div>内容</div>
                                <div>景别 / 运动</div>
                                <div>时长</div>
                                <div>操作</div>
                            </div>
                            <div className="divide-y divide-slate-800/80">
                                {pkg.shots.map((shot) => (
                                    <div key={shot.id} className="grid grid-cols-[48px_minmax(0,1fr)_96px_48px_70px] gap-2 px-3 py-3 text-sm">
                                        <div className="font-semibold text-slate-100">{padEpisodeOrder(shot.order)}</div>
                                        <div className="min-w-0">
                                            <div className="break-words font-semibold text-slate-100">{shot.title}</div>
                                            <div className="mt-1 break-words text-slate-500">{shot.action}</div>
                                        </div>
                                        <div className="break-words text-slate-400">{shot.camera}</div>
                                        <div className="font-semibold text-slate-200">{shot.duration}s</div>
                                        <div className="flex flex-wrap gap-1">
                                            <button type="button" className="text-xs text-cyan-200" onClick={() => onAction("编辑镜头")}>
                                                编辑
                                            </button>
                                            <button type="button" className="text-xs text-slate-400" onClick={() => onAction("调整顺序")}>
                                                顺序
                                            </button>
                                            <button type="button" className="text-xs text-red-300" onClick={() => onAction("删除镜头")}>
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("包内新增镜头")}>
                                + 包内新增镜头
                            </Button>
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("拆分生产包")}>
                                拆分生产包
                            </Button>
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("移动到下一包")}>
                                移到下一包
                            </Button>
                        </div>
                    </div>
                ) : null}
                {activeTab === "script" ? (
                    <div className="grid gap-4">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                            <div className="text-xs font-semibold text-slate-500">对应原剧本内容</div>
                            <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-cyan-500/25 bg-cyan-400/[0.05] p-4 text-sm leading-7 text-slate-100">{pkg.scriptText || segment?.scriptText || "暂无原剧本片段。"}</div>
                        </div>
                        <div className="text-sm leading-6 text-slate-500">原剧本只用于查看和定位，不在生产包抽屉内直接修改。</div>
                    </div>
                ) : null}
                {activeTab === "prompt" ? (
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <div className="text-xs font-semibold text-slate-500">生产包提示词摘要</div>
                            <Input.TextArea className="!bg-slate-950/70 !text-slate-100" rows={5} value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-800">
                            <div className="border-b border-slate-800 bg-slate-950/45 px-3 py-2 text-xs font-medium text-slate-500">包内镜头动态提示词</div>
                            <div className="divide-y divide-slate-800/80">
                                {pkg.shots.map((shot) => (
                                    <div key={shot.id} className="px-3 py-3">
                                        <div className="text-sm font-semibold text-slate-100">{padEpisodeOrder(shot.order)} · {shot.title}</div>
                                        <div className="mt-2 break-words text-sm leading-6 text-slate-400">{shot.prompt}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onGeneratePreview}>
                                重提取提示词
                            </Button>
                            <Button type="primary" onClick={() => onAction("确认提示词")}>
                                确认提示词
                            </Button>
                        </div>
                    </div>
                ) : null}
                {activeTab === "assets" ? (
                    <div className="grid gap-4">
                        <div className="overflow-hidden rounded-lg border border-slate-800">
                            <div className="grid grid-cols-[88px_minmax(0,1fr)_90px] gap-3 border-b border-slate-800 bg-slate-950/45 px-3 py-2 text-xs font-medium text-slate-500">
                                <div>类型</div>
                                <div>资产</div>
                                <div>状态</div>
                            </div>
                            <div className="divide-y divide-slate-800/80">
                                {(pkg.assetLabels.length ? pkg.assetLabels : ["待补齐场景参考"]).map((asset, index) => (
                                    <div key={`${asset}-${index}`} className="grid grid-cols-[88px_minmax(0,1fr)_90px] gap-3 px-3 py-3 text-sm">
                                        <div className="font-semibold text-slate-100">{index === 0 ? "场景" : "引用"}</div>
                                        <div className="break-words text-slate-300">{asset}</div>
                                        <div>
                                            <EpisodeStatusPill status={pkg.status === "缺资产" && index === 0 ? "缺资产" : "已绑定"} tone={pkg.status === "缺资产" && index === 0 ? "amber" : "green"} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {pkg.status === "缺资产" ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3 text-sm leading-6 text-amber-100">当前包存在缺资产项，可跳转到资产提取模块补齐绑定，或直接打开资产处理抽屉。</div> : null}
                        <div className="flex flex-wrap gap-2">
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onOpenAssets}>
                                跳到资产提取
                            </Button>
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("打开资产处理抽屉")}>
                                打开资产处理抽屉
                            </Button>
                            <Button type="primary" onClick={onOpenCanvas}>
                                导入画布承接
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="border-t border-slate-800 p-5">
                <div className="flex flex-wrap gap-2">
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("重提取本包")}>
                        重提取本包
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("编辑包信息")}>
                        编辑包信息
                    </Button>
                    <Button type="primary" onClick={() => onAction("保存并确认")}>
                        保存并确认
                    </Button>
                </div>
            </div>
        </aside>
    );
}

function EpisodeCanvasHandoffPage({
    boundCanvas,
    episode,
    onCreateCanvas,
    onOpenAssets,
    onOpenCanvas,
    onOpenStoryboard,
    projectTitle,
    segments,
}: {
    boundCanvas?: CanvasProject;
    episode: ScriptEpisode;
    onCreateCanvas: () => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    projectTitle: string;
    segments: StoryboardStorySegment[];
}) {
    const { message } = App.useApp();
    const [filter, setFilter] = useState<CanvasHandoffFilter>("全部");
    const rows = useMemo(() => buildCanvasHandoffRows({ boundCanvas, segments }), [boundCanvas, segments]);
    const [selectedPackageId, setSelectedPackageId] = useState("");
    const filteredRows = useMemo(() => rows.filter((row) => filterCanvasHandoffRow(row, filter)), [filter, rows]);
    const preferredFilteredRow = filteredRows.find((row) => row.canImport) || filteredRows[0];
    const selectedRow = rows.find((row) => row.pkg.id === selectedPackageId) || preferredFilteredRow || rows.find((row) => row.canImport) || rows[0];
    const summary = summarizeCanvasHandoffRows(rows, boundCanvas);

    useEffect(() => {
        if (!rows.length) {
            setSelectedPackageId("");
            return;
        }
        if (!selectedRow || !filterCanvasHandoffRow(selectedRow, filter)) setSelectedPackageId(preferredFilteredRow?.pkg.id || rows[0].pkg.id);
    }, [filter, filteredRows, preferredFilteredRow, rows, selectedRow]);

    const importPackage = (row?: CanvasHandoffPackageRow) => {
        if (!row) return;
        if (!boundCanvas) {
            message.info("请先创建承接画布，再导入生产包节点组。");
            return;
        }
        if (!row.canImport) {
            message.warning(row.status === "缺资产" ? "当前生产包缺资产，请先补齐资产后再导入。" : "只有已确认且资产完整的生产包可以导入。");
            return;
        }
        message.success(`已准备导入 P${padEpisodeOrder(row.pkg.order)}；实际节点创建将在承接写入流程中完成，不会触发任何视频任务。`);
    };

    return (
        <section className="grid gap-5">
            <div className="grid gap-4 border-b border-slate-800 pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">画布承接</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title} · 画布承接</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">将已确认的 15 秒生产包导入画布节点组，进入完整画布后再逐一检查节点、资产、提示词和配置。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" onClick={onCreateCanvas}>
                        创建新承接画布
                    </Button>
                    <Button type="primary" disabled={!selectedRow?.canImport} onClick={() => importPackage(selectedRow)}>
                        导入选中生产包
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
                {[
                    { label: "1. 确认生产包", text: "分镜生产包页面完成审核", tone: "green" },
                    { active: true, label: "2. 导入到画布", text: "当前页面只做承接导入", tone: "cyan" },
                    { label: "3. 进入完整画布", text: "逐包检查节点链路", tone: "slate" },
                    { label: "4. 在画布生成", text: "确认后手动触发视频任务", tone: "slate" },
                    { label: "5. 结果回流", text: "写入项目资产库并追踪来源", tone: "slate" },
                ].map((step) => (
                    <div key={step.label} className={`rounded-lg border px-4 py-3 transition ${step.active ? "border-cyan-400/70 bg-cyan-400/12 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]" : step.tone === "green" ? "border-emerald-500/35 bg-emerald-500/[0.06]" : "border-slate-800 bg-slate-950/45"}`}>
                        <div className={`text-sm font-semibold ${episodeToneTextClass(step.tone as EpisodeStatusTone)}`}>{step.label}</div>
                        <div className="mt-2 break-words text-xs leading-5 text-slate-500">{step.text}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "已确认生产包", value: summary.confirmed, tone: "green" },
                    { label: "已导入", value: summary.imported, tone: summary.imported ? "green" : "slate" },
                    { label: "待导入", value: summary.pending, tone: summary.pending ? "cyan" : "slate" },
                    { label: "缺资产", value: summary.missingAssets, tone: summary.missingAssets ? "amber" : "green" },
                    { label: "承接画布", value: summary.canvasCount, tone: summary.canvasCount ? "green" : "amber" },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass(item.tone as EpisodeStatusTone)}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_450px]">
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/88">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                        <h3 className="text-lg font-semibold text-slate-50">生产包导入状态</h3>
                        <div className="flex flex-wrap gap-2">
                            {(["全部", "待导入", "已导入", "缺资产", "已进入画布", "已生成", "已回流"] as CanvasHandoffFilter[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={`rounded-md border px-3 py-1.5 text-sm transition ${filter === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`}
                                    onClick={() => setFilter(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>
                    <CanvasHandoffTable
                        rows={filteredRows}
                        selectedPackageId={selectedRow?.pkg.id || ""}
                        onImport={importPackage}
                        onOpenAssets={onOpenAssets}
                        onOpenCanvas={onOpenCanvas}
                        onOpenStoryboard={onOpenStoryboard}
                        onPreview={(row) => setSelectedPackageId(row.pkg.id)}
                    />
                </div>
                <CanvasHandoffPreviewPanel
                    boundCanvas={boundCanvas}
                    row={selectedRow}
                    onCreateCanvas={onCreateCanvas}
                    onImport={importPackage}
                    onOpenCanvas={onOpenCanvas}
                    onOpenStoryboard={onOpenStoryboard}
                />
            </div>
        </section>
    );
}

function CanvasHandoffTable({
    onImport,
    onOpenAssets,
    onOpenCanvas,
    onOpenStoryboard,
    onPreview,
    rows,
    selectedPackageId,
}: {
    onImport: (row: CanvasHandoffPackageRow) => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    onPreview: (row: CanvasHandoffPackageRow) => void;
    rows: CanvasHandoffPackageRow[];
    selectedPackageId: string;
}) {
    if (!rows.length) return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的生产包。</div>;
    return (
        <div className="max-h-[calc(100vh-430px)] min-h-[520px] overflow-auto">
            <div className="min-w-[800px]">
                <div className="grid grid-cols-[56px_minmax(150px,1fr)_112px_50px_50px_72px_76px_126px] gap-2 border-b border-slate-800/70 px-5 py-3 text-xs font-medium text-slate-500">
                    <div>生产包</div>
                    <div>内容</div>
                    <div>所属剧情段落</div>
                    <div>时长</div>
                    <div>镜头</div>
                    <div>资产</div>
                    <div>承接状态</div>
                    <div>操作</div>
                </div>
                <div className="divide-y divide-slate-800/80">
                    {rows.map((row) => {
                        const selected = row.pkg.id === selectedPackageId;
                        return (
                            <div
                                key={row.pkg.id}
                                role="button"
                                tabIndex={0}
                                className={`grid grid-cols-[56px_minmax(150px,1fr)_112px_50px_50px_72px_76px_126px] gap-2 border-l-4 px-5 py-4 text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : row.status === "缺资产" ? "border-amber-400/70 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]" : "border-transparent hover:bg-white/[0.025]"}`}
                                onClick={() => onPreview(row)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") onPreview(row);
                                }}
                            >
                                <div className="self-center text-lg font-semibold text-slate-100">P{padEpisodeOrder(row.pkg.order)}</div>
                                <div className="min-w-0 self-center">
                                    <div className="break-words font-semibold text-slate-100">{row.pkg.title}</div>
                                    <div className="mt-1 break-words text-slate-500">{row.status === "已导入" ? `已创建 ${row.importedNodeCount} 个画布节点` : row.pkg.summary}</div>
                                </div>
                                <div className="self-center break-words text-slate-300">S{padEpisodeOrder(row.segment.order)} · {row.segment.title}</div>
                                <div className="self-center font-semibold text-slate-200">{row.pkg.duration}s</div>
                                <div className="self-center text-slate-300">{row.pkg.shots.length} 镜</div>
                                <div className={`self-center font-semibold ${row.status === "缺资产" ? "text-amber-300" : "text-slate-200"}`}>{row.assetState}</div>
                                <div className="self-center">
                                    <EpisodeStatusPill status={row.status} tone={row.tone} />
                                </div>
                                <div className="flex flex-wrap gap-2 self-center" onClick={(event) => event.stopPropagation()}>
                                    <CanvasHandoffActionButton disabled={!row.canImport} label="导入" primary={row.canImport} onClick={() => onImport(row)} />
                                    <CanvasHandoffActionButton label="预览" onClick={() => onPreview(row)} />
                                    <CanvasHandoffActionButton label="查看画布" onClick={onOpenCanvas} />
                                    {row.status === "缺资产" ? <CanvasHandoffActionButton label="补资产" onClick={onOpenAssets} /> : null}
                                    <CanvasHandoffActionButton label="返回分镜" onClick={onOpenStoryboard} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function CanvasHandoffActionButton({ disabled, label, onClick, primary }: { disabled?: boolean; label: string; onClick: () => void; primary?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${primary ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/20" : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function CanvasHandoffPreviewPanel({
    boundCanvas,
    onCreateCanvas,
    onImport,
    onOpenCanvas,
    onOpenStoryboard,
    row,
}: {
    boundCanvas?: CanvasProject;
    onCreateCanvas: () => void;
    onImport: (row: CanvasHandoffPackageRow) => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    row?: CanvasHandoffPackageRow;
}) {
    if (!row) return <aside className="rounded-2xl border border-slate-800 bg-[#091018]/88 p-5 text-sm text-slate-500">请选择一个生产包查看导入预览。</aside>;
    const allAssetsBound = row.status !== "缺资产" && row.pkg.assetLabels.length > 0;
    return (
        <aside className="rounded-2xl border border-slate-800 bg-[#091018]/92 shadow-[0_18px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-2xl font-semibold text-slate-50">导入预览</h3>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">P{padEpisodeOrder(row.pkg.order)} · {row.pkg.title}</p>
                    </div>
                    <EpisodeStatusPill status={row.status} tone={row.tone} />
                </div>
            </div>
            <div className="grid max-h-[calc(100vh-260px)] gap-5 overflow-auto p-5">
                <CanvasHandoffNodePreview row={row} />
                <div className="rounded-lg border border-slate-800 bg-slate-950/45">
                    {[
                        ["所属段落", `S${padEpisodeOrder(row.segment.order)} · ${row.segment.title}`],
                        ["预计时长", `${row.pkg.duration} 秒`],
                        ["包内镜头", `${row.pkg.shots.length} 个`],
                        ["引用资产", `${row.pkg.assetLabels.length} 项，${allAssetsBound ? "全部已绑定" : "存在缺口"}`],
                        ["承接画布", boundCanvas ? boundCanvas.title : "未创建"],
                        ["导入后", "创建剧本、资产、提示词、配置和结果占位节点"],
                    ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-slate-800 px-4 py-3 text-sm last:border-b-0">
                            <div className="text-slate-500">{label}</div>
                            <div className="break-words font-semibold text-slate-100">{value}</div>
                        </div>
                    ))}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                    <div className="text-sm font-semibold text-slate-100">重要限制</div>
                    <div className="mt-2 break-words text-sm leading-6 text-slate-500">当前页面只负责导入画布节点组和查看承接状态；最终节点检查和视频生成必须进入完整画布后手动完成。</div>
                </div>
            </div>
            <div className="border-t border-slate-800 p-5">
                <div className="grid gap-2">
                    <Button type="primary" disabled={!row.canImport} onClick={() => onImport(row)}>
                        导入 P{padEpisodeOrder(row.pkg.order)} 到画布
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={boundCanvas ? onOpenCanvas : onCreateCanvas}>
                        {boundCanvas ? "导入后进入完整画布" : "先创建承接画布"}
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onOpenStoryboard}>
                        返回分镜生产包
                    </Button>
                </div>
            </div>
        </aside>
    );
}

function CanvasHandoffNodePreview({ row }: { row: CanvasHandoffPackageRow }) {
    const nodes = [
        { className: "left-[6%] top-[12%] border-cyan-400/45 bg-cyan-400/[0.08]", label: "原剧本", sub: "片段节点" },
        { className: "left-[38%] top-[38%] border-amber-400/45 bg-amber-400/[0.07]", label: "引用资产", sub: `${row.pkg.assetLabels.length || 1} 项` },
        { className: "right-[7%] top-[62%] border-emerald-400/45 bg-emerald-400/[0.07]", label: "提示词 + 配置", sub: "待画布检查" },
        { className: "left-[10%] bottom-[12%] border-slate-500/45 bg-slate-400/[0.04]", label: "结果占位", sub: "生成后回流" },
    ];
    return (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#050a0f]">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">导入后会创建的画布节点</div>
            <div className="relative h-64 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:28px_28px]">
                <div className="absolute left-[27%] top-[26%] h-px w-[29%] rotate-[20deg] bg-cyan-400/30" />
                <div className="absolute left-[58%] top-[52%] h-px w-[26%] rotate-[24deg] bg-cyan-400/30" />
                <div className="absolute left-[20%] top-[58%] h-px w-[28%] -rotate-[28deg] bg-cyan-400/20" />
                {nodes.map((node) => (
                    <div key={node.label} className={`absolute w-32 rounded-lg border px-3 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.24)] ${node.className}`}>
                        <div className="text-sm font-semibold text-slate-100">{node.label}</div>
                        <div className="mt-1 text-xs text-slate-400">{node.sub}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AssetCandidateThumb({ asset }: { asset: Asset }) {
    const imageUrl = asset.kind === "image" ? asset.coverUrl || asset.data.dataUrl : "";
    if (imageUrl) return <div className="h-16 overflow-hidden rounded-md border border-slate-800 bg-slate-900"><img className="h-full w-full object-cover" src={imageUrl} alt={asset.title} /></div>;
    return <div className="grid h-16 place-items-center rounded-md border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-500">{assetKindDisplay(asset.kind)}</div>;
}

function EpisodeModulePanel({
    activeFilter,
    config,
    editorSlot,
    filteredRows,
    onFilterChange,
    onOpenDetail,
}: {
    activeFilter: string;
    config: EpisodeModuleConfig;
    editorSlot?: ReactNode;
    filteredRows: EpisodeModuleRow[];
    onFilterChange: (filter: string) => void;
    onOpenDetail: (record: EpisodeDetailRecord) => void;
}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/82 shadow-[0_18px_80px_rgba(0,0,0,0.28)]">
            <div className="grid gap-4 border-b border-slate-800 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-slate-50">{config.title}</h2>
                    <p className="mt-1 break-words text-sm leading-6 text-slate-500">{config.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {config.actions.map((action) => (
                        <Button
                            key={action.label}
                            className={action.primary ? "" : "!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100"}
                            type={action.primary ? "primary" : "default"}
                            disabled={action.disabled}
                            loading={action.loading}
                            onClick={action.onClick}
                        >
                            {action.label}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="grid gap-4 p-5">
                <div className="grid gap-3 md:grid-cols-4">
                    {config.summary.map((item) => (
                        <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                            <div className="text-xs text-slate-500">{item.label}</div>
                            <div className={`mt-1 break-words text-2xl font-semibold ${episodeToneTextClass(item.tone || "slate")}`}>{item.value}</div>
                        </div>
                    ))}
                </div>
                {editorSlot}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                        {config.filters.map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                className={`rounded-md border px-3 py-1.5 text-sm transition ${activeFilter === filter ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/35 text-slate-500 hover:text-slate-200"}`}
                                onClick={() => onFilterChange(filter)}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                    <div className="text-sm text-slate-500">当前显示 {filteredRows.length} 条</div>
                </div>
                <EpisodeDenseTable columns={config.columns} emptyText={config.emptyText} headers={config.headers} onOpenDetail={onOpenDetail} rows={filteredRows} />
            </div>
        </section>
    );
}

function EpisodeDenseTable({ columns, emptyText, headers, onOpenDetail, rows }: { columns: string; emptyText: string; headers: string[]; onOpenDetail: (record: EpisodeDetailRecord) => void; rows: EpisodeModuleRow[] }) {
    if (!rows.length) {
        return (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-5 py-10 text-center text-sm text-slate-500">
                {emptyText}
            </div>
        );
    }
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#070d13]/90">
            <div className="min-w-[860px]">
                <div className="grid gap-4 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-500" style={{ gridTemplateColumns: columns }}>
                    {headers.map((header) => (
                        <div key={header}>{header}</div>
                    ))}
                </div>
                <div className="divide-y divide-slate-800/90">
                    {rows.map((row) => (
                        <div key={row.id} className={`grid gap-4 px-4 py-3 text-sm ${row.highlight ? "border-l-4 border-cyan-300 bg-cyan-400/[0.08]" : "border-l-4 border-transparent hover:bg-white/[0.025]"}`} style={{ gridTemplateColumns: columns }}>
                            {row.cells.map((cell, index) => (
                                <div key={index} className="min-w-0 self-center break-words leading-6 text-slate-200">
                                    {cell}
                                </div>
                            ))}
                            <div className="self-center">
                                <EpisodeStatusPill status={row.status} tone={row.tone || "slate"} />
                            </div>
                            <button
                                type="button"
                                className="self-center rounded-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100"
                                onClick={row.onAction || (() => onOpenDetail(row.detail))}
                            >
                                {row.actionLabel}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function EpisodeStatusPill({ status, tone = "slate" }: { status: string; tone?: EpisodeStatusTone }) {
    const toneClass: Record<EpisodeStatusTone, string> = {
        amber: "border-amber-400/45 bg-amber-400/10 text-amber-200",
        cyan: "border-cyan-400/55 bg-cyan-400/12 text-cyan-100",
        green: "border-emerald-400/45 bg-emerald-400/10 text-emerald-200",
        red: "border-rose-400/45 bg-rose-400/10 text-rose-200",
        slate: "border-slate-700 bg-slate-900/70 text-slate-300",
    };
    return <span className={`inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}>{status}</span>;
}

function EpisodeDetailDrawer({ onClose, record }: { onClose: () => void; record: EpisodeDetailRecord | null }) {
    return (
        <Drawer
            className="[&_.ant-drawer-close]:!text-slate-300"
            open={Boolean(record)}
            title={<span className="text-slate-100">{record?.title || "详情"}</span>}
            width={620}
            onClose={onClose}
            styles={{
                body: { background: "#061018", color: "#cbd5e1" },
                content: { background: "#061018" },
                header: { background: "#061018", borderBottom: "1px solid rgba(148,163,184,0.2)" },
            }}
        >
            {record ? (
                <div className="grid gap-4 text-slate-200">
                    {record.subtitle ? <div className="break-words text-sm leading-6 text-slate-500">{record.subtitle}</div> : null}
                    {record.meta?.length ? (
                        <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                            {record.meta.map((item) => (
                                <div key={item.label} className="grid gap-2 text-sm sm:grid-cols-[110px_minmax(0,1fr)]">
                                    <div className="text-slate-500">{item.label}</div>
                                    <div className="break-words text-slate-200">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div className="thin-scrollbar max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm leading-7">{record.body || "暂无详情"}</div>
                </div>
            ) : null}
        </Drawer>
    );
}

function buildEpisodeModuleConfig(input: {
    activeModule: EpisodeModuleKey;
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    boundCanvas?: CanvasProject;
    currentScene?: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenCanvas: () => void;
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
    onSaveScript: () => void;
    scriptDraft: string;
    scriptSnapshot: string;
    stageSceneRows: ScriptScene[];
}): EpisodeModuleConfig {
    const characters = uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).join("、") || "待导演分析确认";
    const sceneList = input.stageSceneRows.map((scene) => `第 ${padEpisodeOrder(scene.order)} 场 ${scene.location || "未标注地点"}：${scene.beat || scene.dialogue || "待补充"}`).join("\n") || "暂无结构化场次；可在详情查看剧本文本。";
    const scriptBody = input.scriptSnapshot || input.scriptDraft || "暂无本集剧本。";
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
        actions: [{ disabled: !input.scriptDraft.trim(), label: input.hasScript ? "保存剧本" : "导入剧本", onClick: input.onSaveScript, primary: true }],
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
    hasScript: boolean;
    onRunStage: (stageId: string) => void;
    runningStageIds: Record<string, boolean>;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const output = input.stageOutputs["director-analysis"];
    const digest = output ? buildStageOutputDigest("director-analysis", output) : undefined;
    const display = input.workflowRun ? summarizeWorkflowStageDisplayState(input.workflowRun, "director-analysis", []) : undefined;
    const status = output ? "已完成" : input.hasScript ? workflowDisplayText(display) : "待生成";
    const tone = episodeToneFromWorkflow(display, output ? "green" : input.hasScript ? "cyan" : "amber");
    const fullBody = output ? output.rawText : "尚未生成导演分析。";
    const rows: EpisodeModuleRow[] = [
        directorRow("director-target", "本集目标", digest?.summary || "待确认本集叙事目标。", status, tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis")),
        directorRow("director-rhythm", "情绪节奏", findDigestSection(digest, ["导演讲戏", "导演分析"]) || "待输出情绪节奏。", status, tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis")),
        directorRow("director-risk", "风险提示", findOutputKeywordLine(fullBody, ["风险", "注意", "避免"]) || "待识别风险提示。", output ? "待确认" : status, output ? "amber" : tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis"), Boolean(output)),
        directorRow("director-storyboard", "分镜建议", findDigestSection(digest, ["场景清单", "场景", "导演讲戏"]) || "待形成分镜建议。", output ? "待采用" : status, output ? "cyan" : tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis")),
    ];
    return {
        actions: [{ disabled: !input.hasScript, label: output ? "重新分析" : "运行分析", loading: Boolean(input.runningStageIds["director-analysis"]), onClick: () => input.onRunStage("director-analysis"), primary: true }],
        columns: "120px minmax(300px,1fr) 90px 90px 80px",
        emptyText: "暂无导演分析记录",
        filters: ["全部", "已完成", "待确认", "待采用", "待生成"],
        headers: ["项目", "分析内容", "来源", "状态", "操作"],
        rows,
        subtitle: "确认这一集的戏剧方向、情绪节奏、风险提示和分镜建议；完整分析进入详情抽屉查看。",
        summary: [
            { label: "阶段状态", tone, value: status },
            { label: "输出", value: output ? "1" : "0" },
            { label: "风险提示", tone: output ? "amber" : "slate", value: output ? "待确认" : "未生成" },
            { label: "操作", tone: input.hasScript ? "cyan" : "amber", value: input.hasScript ? "可运行" : "缺剧本" },
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
    if (!preview?.items.length) return fallbackEpisodeExtractedAssets({ assetLibrary, episode, episodeTableShots });
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

function fallbackEpisodeExtractedAssets({ assetLibrary, episode, episodeTableShots }: { assetLibrary: Asset[]; episode: ScriptEpisode; episodeTableShots: StoryboardTableShot[] }): EpisodeExtractedAsset[] {
    const fallbackRows: Array<Pick<EpisodeExtractedAsset, "description" | "name" | "type">> = [
        { description: "女主，旧楼交易线索相关，需保持表情和服装连续性。", name: "林秀妹", type: "角色" },
        { description: "海边柴油仓库，半开铁门、强逆光、潮湿地面和旧油桶。", name: "海边柴油仓库", type: "场景" },
        { description: "关键威胁道具，金属反光，需要与动作镜头一致。", name: "弹簧刀", type: "道具" },
        { description: "旧油桶、残液、柴油味，是本集冲突升级的视觉锚点。", name: "旧油桶", type: "道具" },
        { description: "雨夜追查用深色短款外套，湿润反光，适合低机位跟拍。", name: "女主雨衣", type: "服装" },
    ];
    return fallbackRows.map((row, index) => {
        const candidates = matchProjectAssetCandidates(assetLibrary, row);
        const status: EpisodeExtractedAsset["status"] = candidates.length ? "待绑定" : index === 0 ? "待确认" : "待生成";
        return {
            ...row,
            canGenerate: true,
            candidates,
            episodeLabel: `第 ${padEpisodeOrder(episode.order)} 集`,
            id: `asset-fallback-${index}`,
            libraryMatchCount: candidates.length,
            promptDraft: makeAssetPromptDraft(row),
            referencedShotLabels: referencedShotLabelsForAsset(episodeTableShots, row.name, row.description),
            sourceReason: "等待资产提取 Agent 输出真实条目。",
            status,
            tone: episodeExtractedAssetTone(status),
        };
    });
}

function findProductionBibleItemForPreviewItem({
    item,
    preview,
    productionBibleItems,
    projectId,
}: {
    item: AgentWorkflowMappingPreviewItem;
    preview: AgentWorkflowMappingPreview;
    productionBibleItems: ProductionBibleItem[];
    projectId: string;
}) {
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

function summarizeEpisodeExtractedAssets(assets: EpisodeExtractedAsset[]) {
    return {
        characters: assets.filter((asset) => asset.type === "角色").length,
        costumes: assets.filter((asset) => asset.type === "服装").length,
        missing: assets.filter((asset) => asset.status === "缺素材" || asset.status === "待生成").length,
        props: assets.filter((asset) => asset.type === "道具").length,
        scenes: assets.filter((asset) => asset.type === "场景").length,
    };
}

function filterEpisodeExtractedAssets(asset: EpisodeExtractedAsset, filter: EpisodeAssetFilter) {
    if (filter === "全部") return true;
    if (filter === "缺素材") return asset.status === "缺素材" || asset.status === "待生成";
    if (filter === "已绑定") return asset.status === "已绑定";
    if (filter === "待生成") return asset.status === "待生成";
    return asset.type === filter;
}

function filterAssetCandidates(candidates: Asset[], search: string, kindFilter: "全部" | "图片" | "文本" | "视频") {
    const keyword = search.trim().toLowerCase();
    return candidates.filter((asset) => {
        const kindMatched = kindFilter === "全部" || assetKindDisplay(asset.kind) === kindFilter;
        if (!kindMatched) return false;
        if (!keyword) return true;
        return `${asset.title} ${asset.tags.join(" ")} ${asset.note || ""}`.toLowerCase().includes(keyword);
    });
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

function assetVersionSummary(asset: Asset) {
    const versions = Array.isArray(asset.metadata?.assetVersions) ? asset.metadata.assetVersions : [];
    return versions.length ? `版本 ${versions.length}` : "版本 1";
}

function productionBibleRoleForExtractedAsset(row: EpisodeExtractedAsset) {
    if (row.type === "角色") return "portrait";
    if (row.type === "场景") return "environment";
    return "reference";
}

function buildStoryboardProductionSegments({
    episode,
    episodeTableShots,
    sceneOptions,
    scriptSnapshot,
}: {
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    sceneOptions: EpisodeSceneOption[];
    scriptSnapshot: string;
}): StoryboardStorySegment[] {
    if (!episodeTableShots.length) return fallbackStoryboardProductionSegments(episode, scriptSnapshot);
    const sortedShots = [...episodeTableShots].sort((a, b) => a.order - b.order);
    const groups: Array<{ key: string; name: string; shots: StoryboardTableShot[] }> = [];
    sortedShots.forEach((shot) => {
        const key = shot.sceneId || shot.sceneName || `scene-${shot.order}`;
        const group = groups.find((item) => item.key === key);
        if (group) group.shots.push(shot);
        else groups.push({ key, name: shot.sceneName || sceneOptions.find((scene) => scene.sceneKey === key)?.sceneLabel || `剧情段落 ${groups.length + 1}`, shots: [shot] });
    });

    let packageOrder = 1;
    return groups.map((group, index) => {
        const segmentId = `segment-${group.key || index + 1}`;
        const shotGroups = splitShotsIntoProductionPackages(group.shots);
        const packages = shotGroups.map((shots) => {
            const pkg = buildStoryboardPackageFromShots({ packageOrder, segmentId, shots });
            packageOrder += 1;
            return pkg;
        });
        const duration = packages.reduce((total, pkg) => total + pkg.duration, 0);
        const firstShot = group.shots[0];
        const lastShot = group.shots[group.shots.length - 1];
        const status = segmentStatusFromPackages(packages);
        return {
            duration,
            id: segmentId,
            order: index + 1,
            packages,
            scriptRange: `原剧本 P${padEpisodeOrder(firstShot.order)} - P${padEpisodeOrder(lastShot.order)}`,
            scriptText: group.shots.map((shot) => shot.scriptText).filter(Boolean).join("\n\n"),
            status,
            title: group.name,
            tone: segmentToneFromStatus(status),
        };
    });
}

function splitShotsIntoProductionPackages(shots: StoryboardTableShot[]) {
    const groups: StoryboardTableShot[][] = [];
    let current: StoryboardTableShot[] = [];
    let currentDuration = 0;
    shots.forEach((shot) => {
        const duration = shot.estimatedDuration || 3;
        if (current.length && currentDuration + duration > 15) {
            groups.push(current);
            current = [];
            currentDuration = 0;
        }
        current.push(shot);
        currentDuration += duration;
    });
    if (current.length) groups.push(current);
    return groups;
}

function buildStoryboardPackageFromShots({ packageOrder, segmentId, shots }: { packageOrder: number; segmentId: string; shots: StoryboardTableShot[] }): StoryboardProductionPackage {
    const duration = shots.reduce((total, shot) => total + (shot.estimatedDuration || 3), 0);
    const assetLabels = storyboardPackageAssetLabels(shots);
    const title = shots[0]?.title || `生产包 ${packageOrder}`;
    const summary = listSafeText(shots.map((shot) => shot.visualDescription || shot.action || shot.scriptText).filter(Boolean).join("；"), "待补充生产包内容。");
    const status = storyboardPackageStatusFromShots({ assetLabels, duration, shots });
    return {
        assetLabels,
        duration,
        id: `package-${segmentId}-${packageOrder}`,
        order: packageOrder,
        promptSummary: `${shots[0]?.sceneName || "本段"}，${summary}，镜头保持电影级写实、低对比深色影像质感，动作与视线方向连续。`,
        scriptText: shots.map((shot) => shot.scriptText).filter(Boolean).join("\n\n"),
        segmentId,
        shots: shots.map((shot, index) => ({
            action: shot.visualDescription || shot.action || shot.scriptText || "待补充镜头内容。",
            camera: `${shot.shotSize || "景别待定"} / ${shot.cameraMovement || "运动待定"}`,
            duration: shot.estimatedDuration || 3,
            id: shot.id,
            order: index + 1,
            prompt: shot.workflowSource?.createdFromText || `${shot.visualDescription || shot.action || shot.scriptText}，${shot.shotSize || "中景"}，${shot.cameraMovement || "稳定推进"}，${shot.emotion || "保持当前情绪"}。`,
            title: shot.title || `镜头 ${shot.order}`,
        })),
        status,
        summary,
        title,
        tone: storyboardPackageTone(status),
    };
}

function storyboardPackageAssetLabels(shots: StoryboardTableShot[]) {
    return uniqueTextList(
        shots.flatMap((shot) => [
            ...shot.characters,
            ...(shot.assetNeeds || []),
            ...(shot.assetRefs || []).map((ref) => ref.sourceLabel || ref.role),
            ...(shot.productionBibleRefs || []).map((ref) => ref.kind),
        ]),
    )
        .filter(Boolean)
        .slice(0, 8);
}

function storyboardPackageStatusFromShots({ assetLabels, duration, shots }: { assetLabels: string[]; duration: number; shots: StoryboardTableShot[] }): StoryboardPackageStatus {
    if (duration > 15) return "超时";
    if (!assetLabels.length) return "缺资产";
    if (shots.some((shot) => !shot.visualDescription && !shot.action)) return "待编辑";
    if (shots.some((shot) => !shot.workflowSource)) return "待审核";
    return "待承接";
}

function summarizeStoryboardProductionSegments(segments: StoryboardStorySegment[]) {
    const packages = segments.flatMap((segment) => segment.packages);
    return {
        missingAssets: packages.filter((pkg) => pkg.status === "缺资产").length,
        packages: packages.length,
        segments: segments.length,
        shots: packages.reduce((total, pkg) => total + pkg.shots.length, 0),
        timeout: packages.filter((pkg) => pkg.status === "超时" || pkg.duration > 15).length,
    };
}

function filterStoryboardPackage(pkg: StoryboardProductionPackage, filter: StoryboardPackageFilter) {
    if (filter === "全部") return true;
    return pkg.status === filter;
}

function segmentStatusFromPackages(packages: StoryboardProductionPackage[]) {
    if (packages.some((pkg) => pkg.status === "超时")) return "含超时";
    if (packages.some((pkg) => pkg.status === "缺资产")) return "缺资产";
    if (packages.some((pkg) => pkg.status === "待编辑" || pkg.status === "待审核")) return "待处理";
    if (packages.every((pkg) => pkg.status === "已确认")) return "已确认";
    return "已拆解";
}

function segmentToneFromStatus(status: string): EpisodeStatusTone {
    if (status === "含超时") return "red";
    if (status === "缺资产" || status === "待处理") return "amber";
    if (status === "已确认" || status === "已拆解") return "green";
    return "slate";
}

function storyboardPackageTone(status: StoryboardPackageStatus): EpisodeStatusTone {
    if (status === "已确认") return "green";
    if (status === "待编辑" || status === "待承接") return "cyan";
    if (status === "超时") return "red";
    if (status === "缺资产" || status === "待审核") return "amber";
    return "slate";
}

function fallbackStoryboardProductionSegments(episode: ScriptEpisode, scriptSnapshot: string): StoryboardStorySegment[] {
    const scriptBody = scriptSnapshot || episode.summary || "女主刚走到旧楼后门，身后忽然传来急刹车声。她停住脚步，手机屏幕亮了一下。路灯闪烁，巷口车灯把她的影子拉得很长。";
    const packages: Array<Omit<StoryboardProductionPackage, "id" | "segmentId" | "tone"> & { segmentOrder: number }> = [
        fallbackStoryboardPackage(1, 1, "建立环境与女主入场", "雨夜街口、旧楼后门，女主停步。", 12, "已确认", ["暗巷街景", "女主雨衣", "车灯背光", "旧楼后门", "潮湿地面"], scriptBody, [
            ["女主停在旧楼后门", "全景 / 缓慢推进", 4],
            ["雨水从门牌滴落", "特写 / 静止", 3],
            ["车灯从巷口扫过", "中景 / 横移", 5],
        ]),
        fallbackStoryboardPackage(1, 2, "女主察觉危险", "急刹车声、回头、路灯闪烁。", 10, "待编辑", ["林澈", "暗巷街景", "车灯背光", "手机屏幕"], scriptBody, [
            ["女主停下脚步，听见车声", "中近景 / 跟拍", 5],
            ["她缓慢回头，表情紧张", "近景 / 稳定推进", 5],
        ]),
        fallbackStoryboardPackage(2, 3, "暗巷追击", "跟拍、转弯、车辆逼近。", 14, "缺资产", ["林澈", "暗巷街景"], scriptBody, [
            ["女主沿暗巷奔跑", "全景 / 手持跟拍", 5],
            ["脚步踩过积水", "特写 / 低机位", 3],
            ["车辆灯光逼近", "中景 / 快速推近", 4],
            ["她贴墙躲避", "近景 / 急停", 2],
        ]),
        fallbackStoryboardPackage(2, 4, "车灯扫出证据", "墙面、袖扣、女主拍照。", 11, "待审核", ["墙面反光", "带血袖扣", "手机屏幕"], scriptBody, [
            ["车灯扫过墙面", "全景 / 横移", 4],
            ["袖扣在水边反光", "特写 / 微距", 3],
            ["女主迅速拍照留证", "近景 / 下压", 4],
        ]),
        fallbackStoryboardPackage(2, 5, "反派声音逼近", "脚步声、阴影、台词压迫。", 9, "已确认", ["反派阴影", "暗巷街景"], scriptBody, [["阴影越过墙面", "中景 / 缓慢推近", 9]]),
        fallbackStoryboardPackage(3, 6, "仓库火把对峙", "女主进入柴油仓库，火把照亮油桶和刀光。", 18, "超时", ["海边柴油仓库", "旧油桶", "弹簧刀", "女主雨衣"], scriptBody, [
            ["女主推开仓库铁门", "全景 / 前推", 5],
            ["火把映亮旧油桶", "中景 / 环绕", 5],
            ["反派亮出弹簧刀", "特写 / 急推", 4],
            ["女主握紧手机后退", "近景 / 手持跟拍", 4],
        ]),
    ];
    return [
        fallbackStoryboardSegment(1, "雨夜追到旧楼后门", "原剧本 1-7 段", packages, scriptBody),
        fallbackStoryboardSegment(2, "暗巷追击与证物发现", "原剧本 8-18 段", packages, scriptBody),
        fallbackStoryboardSegment(3, "仓库对峙前的危险升级", "原剧本 19-26 段", packages, scriptBody),
    ];
}

function fallbackStoryboardSegment(order: number, title: string, scriptRange: string, packages: Array<Omit<StoryboardProductionPackage, "id" | "segmentId" | "tone"> & { segmentOrder: number }>, scriptText: string): StoryboardStorySegment {
    const segmentId = `fallback-segment-${order}`;
    const segmentPackages = packages
        .filter((pkg) => pkg.segmentOrder === order)
        .map((pkg) => ({
            ...pkg,
            id: `fallback-package-${pkg.order}`,
            segmentId,
            tone: storyboardPackageTone(pkg.status),
        }));
    const status = segmentStatusFromPackages(segmentPackages);
    return {
        duration: segmentPackages.reduce((total, pkg) => total + pkg.duration, 0),
        id: segmentId,
        order,
        packages: segmentPackages,
        scriptRange,
        scriptText,
        status,
        title,
        tone: segmentToneFromStatus(status),
    };
}

function fallbackStoryboardPackage(segmentOrder: number, order: number, title: string, summary: string, duration: number, status: StoryboardPackageStatus, assetLabels: string[], scriptText: string, shots: Array<[string, string, number]>) {
    return {
        assetLabels,
        duration,
        order,
        promptSummary: `${summary} 电影级写实，低对比雨夜光影，镜头从半身逐渐推进到近景，保持动作连续和情绪压迫。`,
        scriptText,
        segmentOrder,
        shots: shots.map(([shotTitle, camera, shotDuration], index) => ({
            action: shotTitle,
            camera,
            duration: shotDuration,
            id: `fallback-shot-${order}-${index}`,
            order: index + 1,
            prompt: `${shotTitle}，${camera}，${shotDuration} 秒，雨夜暗青色调，写实短剧影像质感。`,
            title: shotTitle,
        })),
        status,
        summary,
        title,
    };
}

function buildCanvasHandoffRows({ boundCanvas, segments }: { boundCanvas?: CanvasProject; segments: StoryboardStorySegment[] }): CanvasHandoffPackageRow[] {
    let eligibleIndex = 0;
    return segments.flatMap((segment) =>
        segment.packages.map((pkg) => {
            const assetMissing = pkg.status === "缺资产" || !pkg.assetLabels.length;
            const confirmed = pkg.status === "已确认" || pkg.status === "待承接";
            let status: CanvasHandoffStatus = "未导入";
            if (assetMissing) status = "缺资产";
            else if (confirmed) {
                eligibleIndex += 1;
                status = boundCanvas && eligibleIndex === 1 ? "已导入" : "待导入";
            }
            const importedNodeCount = status === "已导入" ? Math.max(5, Math.min(boundCanvas?.nodes.length || 5, 12)) : 0;
            return {
                assetState: assetMissing ? "缺 1" : `${pkg.assetLabels.length} 项已绑定`,
                canImport: Boolean(boundCanvas) && status === "待导入",
                importedNodeCount,
                pkg,
                segment,
                status,
                tone: canvasHandoffTone(status),
            };
        }),
    );
}

function summarizeCanvasHandoffRows(rows: CanvasHandoffPackageRow[], boundCanvas?: CanvasProject) {
    return {
        canvasCount: boundCanvas ? 1 : 0,
        confirmed: rows.filter((row) => row.pkg.status === "已确认" || row.pkg.status === "待承接").length,
        imported: rows.filter((row) => ["已导入", "已进入画布", "已生成", "已回流"].includes(row.status)).length,
        missingAssets: rows.filter((row) => row.status === "缺资产").length,
        pending: rows.filter((row) => row.status === "待导入").length,
    };
}

function filterCanvasHandoffRow(row: CanvasHandoffPackageRow, filter: CanvasHandoffFilter) {
    if (filter === "全部") return true;
    return row.status === filter;
}

function canvasHandoffTone(status: CanvasHandoffStatus): EpisodeStatusTone {
    if (status === "已回流" || status === "已生成" || status === "已进入画布" || status === "已导入") return "green";
    if (status === "待导入") return "cyan";
    if (status === "缺资产") return "amber";
    return "slate";
}

function buildAssetsModuleConfig(input: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onRunStage: (stageId: string) => void;
    previews: AgentWorkflowMappingPreview[];
    runningStageIds: Record<string, boolean>;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const preview = latestPreview(input.previews, "production_bible");
    const counts = preview ? previewCounts(preview, input.appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
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
            {
                label: input.stageOutputs["art-design"] ? "生成资产预览" : "运行资产提取",
                loading: Boolean(input.runningStageIds["art-design"]),
                onClick: () => (input.stageOutputs["art-design"] ? input.onGeneratePreview("art-design", "设定库预览") : input.onRunStage("art-design")),
                primary: true,
            },
            {
                disabled: !preview || counts.pending <= 0,
                label: "写入设定库",
                loading: Boolean(preview && input.applyingPreviewIds[preview.previewId]),
                onClick: () => preview && input.onApplyPreview(preview),
            },
        ],
        columns: "90px 140px minmax(260px,1fr) 80px 90px 80px",
        emptyText: "暂无资产提取记录",
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
        title: "资产提取模块",
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
                  cells: ["承接画布", input.boundCanvas ? input.boundCanvas.title : "未绑定画布", input.boundCanvas ? `${input.boundCanvas.nodes.length} 节点` : "待创建", input.episodeTableShots.length ? `${input.episodeTableShots.length} 镜头待承接` : "待分镜"],
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

function directorRow(id: string, label: string, content: string, status: string, tone: EpisodeStatusTone, body: string, onAction?: () => void, highlight?: boolean): EpisodeModuleRow {
    return {
        actionLabel: onAction ? "运行" : "查看",
        cells: [label, content, "导演分析"],
        detail: { body, subtitle: content, title: label },
        highlight,
        id,
        onAction,
        status,
        tone,
    };
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

function EpisodeProgress({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
            </div>
            <span className="text-xs text-slate-400">{label}</span>
        </div>
    );
}

function filterEpisodeRows(rows: EpisodeModuleRow[], filter: string) {
    if (filter === "全部") return rows;
    return rows.filter((row) => row.status === filter || row.status.includes(filter) || (filter === "已完成" && row.status === "完整"));
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
    if (productionBiblePreview || artDisplay?.displayStatus === "approved") return "资产提取待补齐";
    if (directorDisplay?.displayStatus && directorDisplay.displayStatus !== "idle") return `导演分析${workflowStageStatusLabel(directorDisplay.displayStatus)}`;
    if (storyboardDisplay?.displayStatus === "running") return "分镜生成中";
    return "导演分析待启动";
}

function workflowDisplayText(display?: WorkflowStageDisplaySummary) {
    if (!display) return "未开始";
    if (display.hasSceneStates && display.summaryText) return display.summaryText;
    return workflowStageStatusLabel(display.displayStatus);
}

function episodeToneFromWorkflow(display: WorkflowStageDisplaySummary | undefined, fallback: EpisodeStatusTone): EpisodeStatusTone {
    if (!display) return fallback;
    if (display.displayStatus === "approved") return "green";
    if (display.displayStatus === "review" || display.displayStatus === "running" || display.displayStatus === "partial") return "cyan";
    if (display.displayStatus === "blocked" || display.displayStatus === "idle") return "amber";
    if (display.displayStatus === "error" || display.displayStatus === "rejected") return "red";
    return fallback;
}

function episodeToneTextClass(tone: EpisodeStatusTone) {
    const classes: Record<EpisodeStatusTone, string> = {
        amber: "text-amber-200",
        cyan: "text-cyan-100",
        green: "text-emerald-200",
        red: "text-rose-200",
        slate: "text-slate-100",
    };
    return classes[tone];
}

function findDigestSection(digest: ReturnType<typeof buildStageOutputDigest> | undefined, labels: string[]) {
    return digest?.sections.find((section) => labels.some((label) => section.label.includes(label)))?.value || "";
}

function findOutputKeywordLine(text: string, keywords: string[]) {
    return text
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .find((line) => keywords.some((keyword) => line.includes(keyword))) || "";
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

type EpisodeSceneOption = {
    sceneKey: string;
    sceneLabel: string;
    scriptText: string;
    source: "storyboard_table" | "script_scene" | "script_text";
};

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

function stageOutput(workflowRun: AgentWorkflowRunRecord | undefined, outputs: AgentWorkflowStageOutput[], stageId: string) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    return stageState?.outputId ? outputs.find((output) => output.outputId === stageState.outputId) : outputs.find((output) => output.workflowRunId === workflowRun?.id && output.stageId === stageId);
}

function StageOutputDigest({ stageId, output }: { stageId: string; output: AgentWorkflowStageOutput }) {
    const digest = useMemo(() => buildStageOutputDigest(stageId, output), [output, stageId]);
    return (
        <div className="grid gap-3">
            <div className="studio-panel-muted p-3">
                <div className="mb-1 text-xs font-medium text-stone-500">核心摘要</div>
                <div className="text-sm leading-6 whitespace-pre-line text-stone-800 dark:text-stone-100">{digest.summary}</div>
            </div>
            {digest.sections.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                    {digest.sections.map((section) => (
                        <div key={section.label} className="studio-panel-muted p-3">
                            <div className="mb-1 text-xs font-medium text-stone-500">{section.label}</div>
                            <div className="text-sm leading-6 whitespace-pre-line text-stone-700 dark:text-stone-200">{section.value}</div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function buildStageOutputDigest(stageId: string, output: AgentWorkflowStageOutput) {
    const record = parseStageOutputRecord(stageId, output);
    const rawText = stripCodeFence(output.rawText);
    const hasRecord = Object.keys(record).length > 0;
    const sections = stageOutputSectionSpecs(stageId)
        .map((section) => ({
            label: section.label,
            value: cleanOutputText(readFirstText(record, section.keys) || (hasRecord ? "" : readMarkedSection(rawText, section.markers))),
        }))
        .filter((section) => section.value);
    const summary = cleanOutputText(readDirectText(record, ["summary", "title", "overview", "摘要", "核心摘要"]) || (looksLikeStructuredText(output.summary) ? "" : output.summary) || summarizePlainText(rawText) || "已按下方分区展示完整阶段产物");
    return { summary, sections };
}

function stageOutputSectionSpecs(stageId: string) {
    if (stageId === "director-analysis") {
        return [
            { label: "导演讲戏", keys: ["directorScript", "directorNotes", "directingNotes", "storytellingScript", "讲戏本", "导演讲戏", "导演分析"], markers: ["导演讲戏", "讲戏本", "导演分析"] },
            { label: "人物清单", keys: ["characters", "characterList", "人物清单", "人物"], markers: ["人物清单", "人物"] },
            { label: "场景清单", keys: ["scenes", "sceneList", "场景清单", "场景"], markers: ["场景清单", "场景"] },
            { label: "互动道具", keys: ["props", "interactiveProps", "propList", "道具清单", "互动道具清单", "互动道具"], markers: ["互动道具", "道具清单"] },
        ];
    }
    if (stageId === "art-design") {
        return [
            { label: "人物设定", keys: ["characters", "characterPrompts", "人物设定提示词", "人物设定"], markers: ["人物设定", "角色设定"] },
            { label: "场景规划", keys: ["scenePlans", "scene2x2Plans", "scenes", "scenePrompts", "locations", "场景规划提示词", "场景 2x2"], markers: ["场景 2x2", "场景规划", "场景设定"] },
            { label: "道具提示词", keys: ["props", "interactiveProps", "propDesigns", "propPrompts", "道具提示词", "道具"], markers: ["道具提示词", "道具"] },
            { label: "服化道提示词", keys: ["costumeMakeupProps", "costumePrompts", "makeupPrompts", "artDirectionPrompts", "服化道提示词", "服化道"], markers: ["服化道", "美术设计"] },
        ];
    }
    return [
        { label: "场次视觉 DNA", keys: ["sceneVisualDna", "visualDna", "visualDnaSummary", "场次视觉DNA", "场次视觉 DNA"], markers: ["场次视觉 DNA", "视觉 DNA"] },
        { label: "拆分计划", keys: ["promptPlanSummary", "promptPlan", "shotPlan", "splitPlan", "生成P拆分表", "生成 P / 镜头 P 拆分表"], markers: ["生成 P / 镜头 P 拆分表", "生成 P 拆分", "镜头 P 拆分"] },
        { label: "Seedance 提示词", keys: ["seedancePrompt", "seedancePrompts", "singlePTaskCards", "taskCards", "items"], markers: ["Seedance 提示词", "单 P 任务卡", "一键复制"] },
        { label: "工业化预检", keys: ["industrialPrecheckSummary", "industrialPrecheck", "precheckSummary", "工业化预检记录"], markers: ["工业化预检", "预检记录"] },
    ];
}

function parseStageOutputRecord(stageId: string, output: AgentWorkflowStageOutput): Record<string, unknown> {
    const source = output.structuredOutput !== undefined ? output.structuredOutput : parseStageOutputJson(output.rawText);
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    const record = source as Record<string, unknown>;
    const business = findStageBusinessRecord(stageId, record);
    return business || record;
}

function findStageBusinessRecord(stageId: string, record: Record<string, unknown>): Record<string, unknown> | undefined {
    const keys =
        stageId === "director-analysis"
            ? ["directorOutput", "directorAnalysisOutput", "directorAnalysis", "analysisOutput", "stageOutput"]
            : stageId === "art-design"
              ? ["artDesignOutput", "artDirectionOutput", "visualDesignOutput", "stageOutput"]
              : ["storyboardOutput", "seedanceOutput", "sceneOutput", "stageOutput"];
    for (const key of keys) {
        const value = record[key];
        if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    }
    for (const value of Object.values(record)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const nested = findStageBusinessRecord(stageId, value as Record<string, unknown>);
        if (nested) return nested;
    }
    return undefined;
}

function parseStageOutputJson(rawText: string) {
    const direct = safeJsonParse(rawText.trim());
    if (direct !== undefined) return direct;
    const plain = stripCodeFence(rawText);
    const plainJson = safeJsonParse(plain);
    if (plainJson !== undefined) return plainJson;
    const objectText = extractFirstJsonObjectText(plain);
    if (objectText) {
        const parsedObject = safeJsonParse(objectText);
        if (parsedObject !== undefined) return parsedObject;
    }
    const blockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(rawText))) {
        const parsed = safeJsonParse(match[1].trim());
        if (parsed !== undefined) return parsed;
    }
    return undefined;
}

function extractFirstJsonObjectText(text: string) {
    const start = text.indexOf("{");
    if (start < 0) return "";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = inString;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === "{") depth += 1;
        if (char === "}") depth -= 1;
        if (depth === 0) return text.slice(start, index + 1);
    }
    return text.slice(start);
}

function safeJsonParse(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function readFirstText(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const text = summarizeOutputValue(record[key]);
        if (text) return text;
    }
    const nested = summarizeOutputValue(findNestedOutputValue(record, keys));
    if (nested) return nested;
    const businessEntries = Object.entries(record).filter(([key]) => !isOutputMetaKey(key));
    if (businessEntries.length === 1) return summarizeOutputValue(businessEntries[0][1]);
    return "";
}

function readDirectText(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const text = summarizeOutputValue(record[key]);
        if (text) return text;
    }
    return "";
}

function findNestedOutputValue(value: unknown, keys: string[], depth = 0): unknown {
    if (!value || depth > 4) return undefined;
    if (Array.isArray(value)) {
        for (const item of value) {
            const nested = findNestedOutputValue(item, keys, depth + 1);
            if (nested !== undefined) return nested;
        }
        return undefined;
    }
    if (typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
        if (record[key] !== undefined) return record[key];
    }
    for (const [key, item] of Object.entries(record)) {
        if (isOutputMetaKey(key)) continue;
        const nested = findNestedOutputValue(item, keys, depth + 1);
        if (nested !== undefined) return nested;
    }
    return undefined;
}

function summarizeOutputValue(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
        return value
            .map((item, index) => summarizeOutputItem(item, index))
            .filter(Boolean)
            .join("\n");
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const direct =
            Object.keys(record).length <= 2
                ? readStringValue(record, ["summary", "description", "text", "content", "appearance", "costume", "makeup", "function", "usage", "note", "visualPrompt", "imagePrompt", "designPrompt", "prompt", "promptText"])
                : "";
        if (direct) return direct;
        return Object.entries(record)
            .filter(([key]) => !isOutputMetaKey(key))
            .map(([key, item]) => `${humanizeOutputKey(key)}：${summarizeOutputValue(item)}`)
            .filter((line) => !line.endsWith("："))
            .join("\n");
    }
    return "";
}

function summarizeOutputItem(value: unknown, index: number) {
    if (typeof value === "string") return `- ${value.trim()}`;
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const title = readStringValue(record, ["characterName", "sceneName", "propName", "name", "title", "location", "role", "角色", "名称"]) || `条目 ${index + 1}`;
    const titleKeys = new Set(["characterName", "sceneName", "propName", "name", "title", "location", "role", "角色", "名称"]);
    const details = Object.entries(record)
        .filter(([key]) => !isOutputMetaKey(key) && !titleKeys.has(key))
        .map(([key, item]) => {
            const text = summarizeOutputValue(item);
            return text ? `  ${humanizeOutputKey(key)}：${text}` : "";
        })
        .filter(Boolean);
    return [`- ${title}`, ...details].join("\n");
}

function readStringValue(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function readMarkedSection(rawText: string, markers: string[]) {
    const lines = stripCodeFence(rawText)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const start = lines.findIndex((line) => markers.some((marker) => line.includes(marker)));
    if (start < 0) return "";
    const next = lines.findIndex((line, index) => index > start && /^#{1,4}\s+|^[一二三四五六七八九十]+[、.．]|^\d+[.、]/.test(line));
    return lines.slice(start, next > start ? next : lines.length).join("\n");
}

function summarizePlainText(text: string) {
    const plain = stripCodeFence(text);
    if (plain.startsWith("{") || plain.startsWith("[")) return "";
    return plain
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && !looksLikeStructuredText(line))
        .join("\n");
}

function stripCodeFence(text: string) {
    return text
        .replace(/^```(?:json|markdown)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function cleanOutputText(text: string) {
    return text
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function looksLikeStructuredText(text: string) {
    const value = text.trim();
    return value.startsWith("{") || value.startsWith("[") || value.startsWith("```");
}

function isOutputMetaKey(key: string) {
    return [
        "workflowId",
        "workflowVersion",
        "workflowRunId",
        "stageId",
        "stageName",
        "agentId",
        "agentName",
        "metadata",
        "sourceFiles",
        "qualityGateIds",
        "qualityGates",
        "specReadingRecord",
        "readPaths",
        "verification",
        "complianceNotes",
        "createdAt",
        "updatedAt",
        "warnings",
        "notes",
        "rawText",
    ].includes(key);
}

function humanizeOutputKey(key: string) {
    const labels: Record<string, string> = {
        items: "条目",
        characters: "人物",
        scenes: "场景",
        scenePlans: "场景",
        sceneId: "场景编号",
        time: "时间",
        environment: "环境",
        props: "道具",
        interactiveProps: "道具",
        shots: "镜头",
        appearance: "外观",
        status: "状态",
        description: "描述",
        costume: "服装",
        makeup: "妆容",
        function: "功能",
        usage: "用途",
        action: "动作",
        visualDescription: "视觉描述",
        visualPrompt: "视觉提示词",
        imagePrompt: "图片提示词",
        designPrompt: "设计提示词",
        prompt: "提示词",
        promptText: "提示词",
    };
    return labels[key] || key;
}

function previewCounts(preview: AgentWorkflowMappingPreview, appliedPreviewItemIds: string[]) {
    const creatable = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
    const applied = creatable.filter((item) => appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
    return { total: creatable.length, applied, pending: creatable.length - applied };
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

function previewTargetLabels(targetType: AgentWorkflowMappingPreview["targetType"]) {
    if (targetType === "production_bible") return { confirmTitle: "确认写入设定库", confirmContentPrefix: "将把设定草案写入设定库：", okText: "确认写入", doneText: "已写入设定库 " };
    if (targetType === "storyboard_table") return { confirmTitle: "确认写入分镜头表", confirmContentPrefix: "将把分镜草案追加到当前本集分镜头表：", okText: "确认写入", doneText: "已写入分镜头表 " };
    return { confirmTitle: "确认创建视频配置节点", confirmContentPrefix: "将在绑定画布创建或更新视频配置节点：", okText: "确认创建", doneText: "已创建视频配置节点 " };
}

function buildEpisodeSceneOptions({
    tableShots,
    scriptScenes,
    scriptSnapshot,
}: {
    tableShots: Array<{ sceneId?: string; sceneName: string; scriptText: string }>;
    scriptScenes: Array<{ id: string; order: number; location: string; beat: string; dialogue: string; emotion: string }>;
    scriptSnapshot: string;
}): EpisodeSceneOption[] {
    if (tableShots.length) {
        const sceneMap = new Map<string, EpisodeSceneOption>();
        tableShots.forEach((shot, index) => {
            const label = shot.sceneName || `场次 ${index + 1}`;
            const key = shot.sceneId || slugSceneKey(label, index);
            const existing = sceneMap.get(key);
            const scriptText = [existing?.scriptText, shot.scriptText].filter(Boolean).join("\n");
            sceneMap.set(key, { sceneKey: key, sceneLabel: label, scriptText, source: "storyboard_table" });
        });
        return Array.from(sceneMap.values());
    }
    if (scriptScenes.length) {
        return scriptScenes.map((scene) => ({
            sceneKey: scene.id,
            sceneLabel: `${scene.order}. ${scene.location || "未命名场次"}`,
            scriptText: [scene.beat, scene.dialogue, scene.emotion].filter(Boolean).join("\n"),
            source: "script_scene",
        }));
    }
    return extractSceneOptionsFromScriptText(scriptSnapshot);
}

function extractSceneOptionsFromScriptText(scriptSnapshot: string): EpisodeSceneOption[] {
    const lines = scriptSnapshot
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const titleIndexes = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^#{0,3}\s*\d+[-.、]\d+|^#{0,3}\s*第?\d+\s*[场幕]/.test(line));
    if (!titleIndexes.length && scriptSnapshot.trim()) return [{ sceneKey: "scene-1", sceneLabel: "scene-1", scriptText: scriptSnapshot.trim(), source: "script_text" }];
    return titleIndexes.map(({ line, index }, sceneIndex) => {
        const nextIndex = titleIndexes[sceneIndex + 1]?.index ?? lines.length;
        const label = line.replace(/^#+\s*/, "").slice(0, 48);
        return {
            sceneKey: slugSceneKey(label, sceneIndex),
            sceneLabel: label || `scene-${sceneIndex + 1}`,
            scriptText: lines.slice(index, nextIndex).join("\n"),
            source: "script_text",
        };
    });
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

function previousApprovedSceneSummary(sceneStates: AgentWorkflowSceneRunState[], sceneKey: string) {
    const index = sceneStates.findIndex((scene) => scene.sceneKey === sceneKey);
    const previous =
        index > 0
            ? sceneStates
                  .slice(0, index)
                  .reverse()
                  .find((scene) => scene.status === "approved")
            : undefined;
    return previous ? `${previous.sceneLabel}：${previous.promptTextSummary || previous.promptPlanSummary || "已批准"}` : "";
}

function sceneSourceLabel(source: EpisodeSceneOption["source"]) {
    if (source === "storyboard_table") return "来源：分镜头表";
    if (source === "script_scene") return "来源：剧本场次";
    return "来源：剧本文本标题";
}

function slugSceneKey(label: string, index: number) {
    return (
        label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || `scene-${index + 1}`
    );
}

function formatBlockedReason(reason?: string) {
    const value = reason?.trim();
    if (!value) return "前置阶段未批准";
    return value.replace("director-analysis", "导演分析").replace("art-design", "服化道美术设计").replace("seedance-storyboard", "Seedance 分镜");
}
