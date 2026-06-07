"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, App, Button, Card, Collapse, Empty, Input, Space, Tag } from "antd";
import { CheckCircle2, Clapperboard, FileText, Library, Maximize2, Play, ScrollText, Video, Workflow, XCircle } from "lucide-react";

import { requestImageQuestion } from "@/services/api/image";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useCanvasStore } from "../../../../../canvas/stores/use-canvas-store";
import { useScriptStore } from "../../../../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../../../../canvas/stores/use-storyboard-store";
import { orderedScriptScenes } from "../../../../../canvas/utils/script-management";
import { buildEpisodeScriptSnapshot } from "../../../../../canvas/utils/canvas-episode-context";
import { orderedStoryboardTableShots } from "../../../../../canvas/utils/storyboard-management";
import { buildSeedanceWorkflowPreset, sortedWorkflowStages, workflowStageDetail, type AgentWorkflowStage } from "../../../../agent-workflow-presets";
import { useAgentRunnerStore } from "../../../../use-agent-runner-store";
import { getSeedanceWorkflowAgentCore } from "../../../../workflow-agents/seedance-workflow-agents";
import { buildSeedanceQualityGateManifest, evaluateWorkflowQualityGates, getWorkflowStageRequiredReadings, type WorkflowGateCheckResult } from "../../../../workflow-quality-gates";
import {
    buildWorkflowStageSourceFiles,
    canGenerateWorkflowMappingPreview,
    workflowMappingPreviewItemKey,
    workflowStageStatusLabel,
    type AgentRunInput,
    type AgentWorkflowMappingPreview,
    type AgentWorkflowRunRecord,
    type AgentWorkflowSceneRunState,
    type AgentWorkflowStageOutput,
    type AgentWorkflowStageState,
} from "../../../../agent-runner";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";

const stageCopy: Record<string, { title: string; agent: string; input: string; output: string; previewTargets: Array<AgentWorkflowMappingPreview["targetType"]> }> = {
    "director-analysis": {
        title: "导演分析",
        agent: "director",
        input: "本集剧本",
        output: "导演分析、讲戏本、人物清单、场景清单、互动道具清单",
        previewTargets: [],
    },
    "art-design": {
        title: "服化道美术设计",
        agent: "art-designer",
        input: "导演分析产物、人物 / 场景 / 道具清单、art-design skill / template / examples",
        output: "人物设定提示词、场景 2x2 规划提示词、道具提示词、服化道提示词",
        previewTargets: ["production_bible"],
    },
    "seedance-storyboard": {
        title: "Seedance 分镜",
        agent: "storyboard-artist",
        input: "本集剧本、导演讲戏本、美术设定、参考资产、Seedance 方法论、industrial-quality-rules",
        output: "场次视觉 DNA、生成 P / 镜头 P 拆分表、单 P 任务卡、Seedance 2.0 一键复制提示词",
        previewTargets: ["storyboard_table", "video_node"],
    },
};

export default function EpisodeProductionWorkbenchPage() {
    const params = useParams<{ id: string; episodeId: string }>();
    const router = useRouter();
    const { message, modal } = App.useApp();
    const projectId = params.id;
    const episodeId = params.episodeId;
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const episode = useScriptStore((state) => state.episodes.find((item) => item.id === episodeId && item.projectId === projectId));
    const scenes = useScriptStore((state) => state.scenes);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const canvases = useCanvasStore((state) => state.projects);
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
    const [runningStageIds, setRunningStageIds] = useState<Record<string, boolean>>({});
    const [runningSceneKeys, setRunningSceneKeys] = useState<Record<string, boolean>>({});
    const [applyingPreviewIds, setApplyingPreviewIds] = useState<Record<string, boolean>>({});
    const [activeStageIds, setActiveStageIds] = useState<string[]>([]);
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
                    const status = workflowRun?.stageStates.find((item) => item.stageId === stage.stageId)?.status;
                    if (status === "approved") return false;
                    return workflowRun?.currentStageId === stage.stageId || !status || status === "idle" || status === "review" || status === "running" || status === "rejected" || status === "error" || status === "blocked";
                })
                .map((stage) => stage.stageId),
        );
    }, [stages, workflowRun?.currentStageId, workflowRun?.id]);

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
        try {
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(`${stage.name} 草案已生成，待审核`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
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
        try {
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(`${currentScene.sceneLabel} 草案已生成，待审核`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            message.warning(reason);
        } finally {
            setRunningSceneKeys((current) => ({ ...current, [currentScene.sceneKey]: false }));
        }
    };

    const summarizeStoryboardScenes = () => {
        if (!workflowRun) return;
        const result = summarizeApprovedStoryboardScenes(workflowRun.id);
        if (!result.ok) message.warning(result.reason || "无法汇总已批准场次");
        else message.success(`已汇总 ${result.sceneCount || 0} 个已批准场次，可生成 stage3 preview`);
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

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
                <header className="border-b border-stone-200 pb-5 dark:border-stone-800">
                    <Link href={`/projects/${project.id}`} className="text-xs text-stone-500 hover:text-stone-950 dark:hover:text-stone-100">
                        {project.title}
                    </Link>
                    <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-semibold">本集生产流程</h1>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Tag className="m-0">项目：{project.title}</Tag>
                                <Tag className="m-0">
                                    集数：{episode.order}. {episode.title}
                                </Tag>
                                <Tag className="m-0" color={hasScript ? "green" : "orange"}>
                                    {hasScript ? "已有剧本" : "缺少剧本"}
                                </Tag>
                                <Tag className="m-0" color={boundCanvas ? "blue" : undefined}>
                                    {boundCanvas ? `画布：${boundCanvas.title}` : "未绑定画布"}
                                </Tag>
                            </div>
                        </div>
                        <Space wrap>
                            <Button href={`/projects/${project.id}/agents`}>Agent 工作台</Button>
                            <Button type="primary" icon={<Maximize2 className="size-4" />} disabled={!boundCanvas} onClick={() => boundCanvas && router.push(`/canvas/${boundCanvas.id}`)}>
                                进入画布
                            </Button>
                        </Space>
                    </div>
                </header>

                <Card size="small" title={<TitleWithIcon icon={<FileText className="size-4" />} title="步骤 0：剧本" />}>
                    {hasScript ? (
                        <div className="grid gap-3">
                            <div className="grid gap-2 rounded-lg bg-stone-50 p-3 text-sm leading-6 dark:bg-white/5">
                                <div className="font-medium">当前本集剧本预览</div>
                                <div className="line-clamp-5 whitespace-pre-wrap text-stone-600 dark:text-stone-300">{scriptSnapshot}</div>
                            </div>
                            <details>
                                <summary className="cursor-pointer text-sm text-stone-500">编辑全文 / 导入覆盖</summary>
                                <div className="mt-3 grid gap-2">
                                    <Input.TextArea rows={10} value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} />
                                    <Button className="justify-self-start" type="primary" onClick={saveScript}>
                                        保存本集剧本
                                    </Button>
                                </div>
                            </details>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            <Alert type="warning" showIcon title="当前集缺少剧本，阶段 1 暂不可运行。" />
                            <Input.TextArea rows={8} placeholder="粘贴或导入本集剧本" value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} />
                            <Button className="justify-self-start" type="primary" disabled={!scriptDraft.trim()} onClick={saveScript}>
                                导入本集剧本
                            </Button>
                        </div>
                    )}
                </Card>

                <Collapse
                    activeKey={activeStageIds}
                    onChange={(keys) => setActiveStageIds(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
                    items={stages.map((stage) =>
                        stageCollapseItem({
                            stage,
                            workflowRun,
                            output: stageOutputs[stage.stageId],
                            previews: previews.filter((preview) => preview.sourceStageId === stage.stageId),
                            qualityResults: workflowRun ? evaluateWorkflowQualityGates({ manifest: qualityGateManifest, workflowRun, stageId: stage.stageId, outputs: workflowOutputs, evidences: workflowEvidences }) : [],
                            requiredReadingCount: getWorkflowStageRequiredReadings(qualityGateManifest, stage.stageId).length,
                            hasScript,
                            hasCanvas: Boolean(boundCanvas),
                            reviewNote: reviewNotes[stage.stageId] || "",
                            isRunning: Boolean(runningStageIds[stage.stageId]),
                            sceneWorkbench:
                                stage.stageId === "seedance-storyboard" ? (
                                    <StoryboardSceneWorkbench
                                        scenes={sceneOptions}
                                        selectedSceneKey={selectedSceneKey}
                                        subSceneKey={subSceneKey}
                                        workflowRun={workflowRun}
                                        currentScene={currentScene}
                                        currentSceneState={currentSceneState}
                                        reviewNote={currentScene ? sceneReviewNotes[currentScene.sceneKey] || "" : ""}
                                        isRunning={Boolean(currentScene && runningSceneKeys[currentScene.sceneKey])}
                                        onSceneChange={setSelectedSceneKey}
                                        onSubSceneKeyChange={setSubSceneKey}
                                        onReviewNoteChange={(value) => currentScene && setSceneReviewNotes((notes) => ({ ...notes, [currentScene.sceneKey]: value }))}
                                        onRun={runStoryboardScene}
                                        onApprove={(runnerRunId) => currentScene && approveRun(runnerRunId, sceneReviewNotes[currentScene.sceneKey])}
                                        onReject={(runnerRunId) => currentScene && rejectRun(runnerRunId, sceneReviewNotes[currentScene.sceneKey])}
                                        onSummarize={summarizeStoryboardScenes}
                                    />
                                ) : undefined,
                            applyingPreviewIds,
                            appliedPreviewItemIds: workflowAppliedPreviewItemIds,
                            onReviewNoteChange: (value) => setReviewNotes((current) => ({ ...current, [stage.stageId]: value })),
                            onRun: () => void runStage(stage),
                            onApprove: (runnerRunId) => approveRun(runnerRunId, reviewNotes[stage.stageId]),
                            onReject: (runnerRunId) => rejectRun(runnerRunId, reviewNotes[stage.stageId]),
                            onMarkReadingsRead: () => {
                                if (!workflowRun) return;
                                const result = markWorkflowStageReadingsRead(workflowRun.id, stage.stageId);
                                if (!result.ok) message.warning(result.reason || "无法标记规范读取记录");
                                else message.success(`已记录 ${result.count || 0} 条规范读取`);
                            },
                            onGeneratePreview: generatePreview,
                            onApplyPreview: confirmApplyPreview,
                        }),
                    )}
                />

                <Card size="small" title={<TitleWithIcon icon={<Workflow className="size-4" />} title="步骤 4：写入结果 / 去画布" />}>
                    <Alert className="mb-3" type="info" showIcon title="所有写入都需要人工确认；本页不会自动开始图片或视频生成。" />
                    <div className="grid gap-2">
                        {(["production_bible", "storyboard_table", "video_node"] as const).map((targetType) => (
                            <PreviewSummaryRow
                                key={targetType}
                                targetType={targetType}
                                previews={previews.filter((preview) => preview.targetType === targetType)}
                                appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                                hasCanvas={Boolean(boundCanvas)}
                                applyingPreviewIds={applyingPreviewIds}
                                onApplyPreview={confirmApplyPreview}
                            />
                        ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="primary" icon={<Video className="size-4" />} disabled={!boundCanvas} onClick={() => boundCanvas && router.push(`/canvas/${boundCanvas.id}`)}>
                            去画布查看视频配置节点
                        </Button>
                        {!boundCanvas ? <span className="self-center text-sm text-stone-500">没有绑定画布，分镜头表和视频节点写入不可用。</span> : null}
                    </div>
                </Card>
            </div>
        </main>
    );
}

function stageCollapseItem({
    stage,
    workflowRun,
    output,
    previews,
    qualityResults,
    requiredReadingCount,
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
    requiredReadingCount: number;
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
    const copy = stageCopy[stage.stageId];
    const mappingStatus = workflowRun ? canGenerateWorkflowMappingPreview(workflowRun, stage.stageId) : { allowed: false, reason: "尚未初始化 workflow run" };
    const gateErrorCount = qualityResults.filter((result) => result.status === "error").length;
    const readCount = stageState?.readingRecords.filter((record) => record.status === "read").length || 0;
    const lockedReason = !hasScript ? "缺少本集剧本" : stageState?.status === "blocked" ? formatBlockedReason(stageState.blockedReason) : "";
    const isSceneStage = stage.stageId === "seedance-storyboard";
    return {
        key: stage.stageId,
        label: (
            <div className="flex flex-wrap items-center gap-2">
                <span>
                    {stage.order}. {copy.title}
                </span>
                <Tag className="m-0">{copy.agent}</Tag>
                <StatusTag status={stageState?.status || "idle"} />
                {lockedReason ? (
                    <Tag className="m-0" color="orange">
                        阻塞
                    </Tag>
                ) : null}
                {lockedReason ? <span className="text-xs text-stone-500">原因：{lockedReason}</span> : null}
            </div>
        ),
        children: (
            <Card size="small" className="border-0 shadow-none">
                <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                        <InfoBlock label="输入来源" value={copy.input} />
                        <InfoBlock label="输出产物" value={copy.output} />
                    </div>
                    <div className="grid gap-2 rounded-lg bg-stone-50 p-3 text-sm dark:bg-white/5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0">
                                规范读取 {readCount}/{requiredReadingCount}
                            </Tag>
                            <Tag className="m-0" color={gateErrorCount ? "red" : "green"}>
                                quality gate error {gateErrorCount}
                            </Tag>
                            {output ? <Tag className="m-0">最近产物 1</Tag> : <Tag className="m-0">暂无产物</Tag>}
                        </div>
                        <div className="text-stone-600 dark:text-stone-300">最近产物摘要：{output?.summary || "暂无阶段产物"}</div>
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
                            记录规范读取
                        </Button>
                        {copy.previewTargets.includes("production_bible") ? (
                            <Button size="small" disabled={!mappingStatus.allowed} onClick={() => onGeneratePreview(stage.stageId, "production_bible preview")}>
                                生成 production_bible preview
                            </Button>
                        ) : null}
                        {copy.previewTargets.includes("storyboard_table") ? (
                            <Button size="small" disabled={!mappingStatus.allowed} onClick={() => onGeneratePreview(stage.stageId, "storyboard_table preview")}>
                                生成 storyboard_table preview
                            </Button>
                        ) : null}
                        {copy.previewTargets.includes("video_node") ? (
                            <Button size="small" disabled={!mappingStatus.allowed} onClick={() => onGeneratePreview(stage.stageId, "video_node preview")}>
                                生成 video_node preview
                            </Button>
                        ) : null}
                        {!mappingStatus.allowed && copy.previewTargets.length ? <span className="text-xs text-stone-500">{mappingStatus.reason}</span> : null}
                    </Space>
                    {!isSceneStage && stageState?.status === "review" ? (
                        <div className="grid gap-2 rounded-lg bg-stone-50 p-3 dark:bg-white/5">
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
    const approvedCount = sceneStates.filter((scene) => scene.status === "approved").length;
    const pendingCount = scenes.filter((scene) => !sceneStates.some((state) => state.sceneKey === scene.sceneKey && state.status === "approved")).length;
    const currentWarnings = currentSceneState?.warnings?.length ? currentSceneState.warnings.join("；") : "";
    return (
        <div className="grid gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">场次推进</div>
                <Space size={6} wrap>
                    <Tag className="m-0">已批准 {approvedCount}</Tag>
                    <Tag className="m-0" color={pendingCount ? "orange" : "green"}>
                        未完成 {pendingCount}
                    </Tag>
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
                                    className={`rounded-md border px-3 py-2 text-left text-sm transition ${selected ? "border-stone-900 bg-stone-100 dark:border-stone-100 dark:bg-white/10" : "border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-white/5"}`}
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
                    <div className="grid gap-3 rounded-md bg-stone-50 p-3 dark:bg-white/5">
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
                            <div className="max-h-28 overflow-auto rounded-md bg-white p-2 text-xs leading-5 text-stone-500 dark:bg-black/20">{currentScene?.scriptText || "暂无当前场次剧本片段"}</div>
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
        <div className="grid gap-2 rounded-lg border border-dashed border-stone-200 p-3 dark:border-stone-700">
            {previews.map((preview) => {
                const counts = previewCounts(preview, appliedPreviewItemIds);
                const disabledReason = previewApplyDisabledReason(preview, counts.pending, hasCanvas);
                return (
                    <div key={preview.previewId} className="rounded-lg bg-stone-50 p-3 text-sm dark:bg-white/5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0">{preview.targetType}</Tag>
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
                            <summary className="cursor-pointer text-xs text-stone-500">mapping fields / workflow 追溯</summary>
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
    const disabledReason = latest ? previewApplyDisabledReason(latest, counts.pending, hasCanvas) : "尚未生成 preview";
    return (
        <div className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <Tag className="m-0">{targetType}</Tag>
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

function InfoBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
            <div className="mb-1 text-xs text-stone-500">{label}</div>
            <div className="leading-6">{value}</div>
        </div>
    );
}

function StatusTag({ status }: { status: AgentWorkflowStageState["status"] }) {
    const color = status === "approved" ? "green" : status === "review" ? "blue" : status === "running" ? "processing" : status === "rejected" || status === "error" ? "red" : status === "blocked" ? "orange" : undefined;
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
