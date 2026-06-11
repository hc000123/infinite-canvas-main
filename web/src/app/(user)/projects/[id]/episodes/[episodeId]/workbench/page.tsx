"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Empty } from "antd";

import { requestImageQuestion, type ChatCompletionMessage } from "@/services/api/image";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useCanvasStore } from "../../../../../canvas/stores/use-canvas-store";
import { useScriptStore } from "../../../../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../../../../canvas/stores/use-storyboard-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import { canvasEpisodeContextFromEpisode } from "../../../../../canvas/utils/canvas-episode-context";
import { buildCanvasProjectPresetFromConfig } from "../../../../../canvas/utils/canvas-project-preset";
import { useAgentRunnerStore } from "../../../../use-agent-runner-store";
import { agentSystemPromptContent, canInvokeAgentConfig, defaultAgentConfigs, fillAgentPromptTemplate, mergeAgentConfigs } from "../../../../agent-settings";
import { useAgentSettingsStore } from "../../../../use-agent-settings-store";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";
import { useEpisodeWorkbenchState } from "./use-episode-workbench-state";
import { useEpisodeWorkbenchPreviewActions } from "./use-episode-workbench-preview-actions";
import { useEpisodeWorkbenchRunActions } from "./use-episode-workbench-run-actions";
import { useEpisodeWorkbenchUiState } from "./use-episode-workbench-ui-state";
import type { CanvasHandoffImportTarget } from "./components/episode-canvas-handoff-utils";
import { EpisodeDetailDrawer } from "./components/episode-module-panel";
import { EpisodeProductionShell } from "./components/episode-production-shell";
import { findVideoPreviewItemIdsForPackage, latestPreview, padEpisodeOrder } from "./episode-workbench-display";

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
    const workflowMappingPreviews = useAgentRunnerStore((state) => state.workflowMappingPreviews);
    const workflowAppliedPreviewItemIds = useAgentRunnerStore((state) => state.workflowAppliedPreviewItemIds);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const summarizeApprovedStoryboardScenes = useAgentRunnerStore((state) => state.summarizeApprovedStoryboardScenes);
    const generateWorkflowMappingPreview = useAgentRunnerStore((state) => state.generateWorkflowMappingPreview);
    const applyProductionBiblePreview = useAgentRunnerStore((state) => state.applyProductionBiblePreview);
    const applyStoryboardPreview = useAgentRunnerStore((state) => state.applyStoryboardPreview);
    const applyVideoNodePreview = useAgentRunnerStore((state) => state.applyVideoNodePreview);
    const approveRun = useAgentRunnerStore((state) => state.approveRun);
    const startWorkflowTextRun = useAgentRunnerStore((state) => state.startWorkflowTextRun);
    const completeWorkflowTextRun = useAgentRunnerStore((state) => state.completeWorkflowTextRun);
    const failWorkflowTextRun = useAgentRunnerStore((state) => state.failWorkflowTextRun);
    const globalAgentConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectAgentConfigs = useAgentSettingsStore((state) => state.projectConfigs);
    const effectiveConfig = useEffectiveConfig();
    const checkAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [scriptOptimizing, setScriptOptimizing] = useState(false);
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
    const resolvedAgentConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalAgentConfigs, projectAgentConfigs[projectId] || []), [globalAgentConfigs, projectAgentConfigs, projectId]);
    const scriptOptimizerConfig = useMemo(() => resolvedAgentConfigs.find((config) => config.kind === "script_optimizer"), [resolvedAgentConfigs]);
    const {
        activeModule,
        applyingPreviewIds,
        approveCurrentStoryboardScene,
        approveStageReview,
        currentScene,
        currentSceneState,
        detailRecord,
        directorReviewStates,
        scriptDraft,
        setActiveModule,
        setApplyingPreviewIds,
        setDetailRecord,
        setScriptDraft,
        updateDirectorReviewState,
    } = useEpisodeWorkbenchUiState({
        approveRun,
        directorOutputText,
        episodeExists: Boolean(episode),
        episodeId,
        hasScript,
        message,
        sceneOptions,
        scriptSnapshot,
        workflowRun,
    });

    useEffect(() => {
        if (!project || !episode) return;
        ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
    }, [boundCanvas?.id, ensureWorkflowRun, episode, episodeId, preset, project, projectId]);

    const { cancelStage, runStage, runStoryboardScene, runningStageIds } = useEpisodeWorkbenchRunActions({
        boundCanvas,
        checkAiConfigReady,
        currentScene,
        currentSceneState,
        effectiveConfig,
        resolvedAgentConfigs,
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

    const optimizeScript = async () => {
        const sourceScript = scriptDraft.trim();
        if (!sourceScript) {
            message.warning("请先导入或粘贴本集剧本。");
            return;
        }
        const agentConfig = scriptOptimizerConfig;
        if (!agentConfig) {
            message.warning("未找到剧本优化 Agent 设定。");
            return;
        }
        const callable = canInvokeAgentConfig(agentConfig);
        if (!callable.callable) {
            message.warning(callable.reason || "剧本优化 Agent 不可用。");
            return;
        }
        const preferredModel = agentConfig.modelPreference.trim();
        const textModel = preferredModel && preferredModel !== "default" ? preferredModel : effectiveConfig.textModel || effectiveConfig.model;
        if (!checkAiConfigReady(effectiveConfig, textModel)) {
            message.warning("请先配置可用的文本模型。");
            return;
        }
        const requestConfig = { ...effectiveConfig, model: textModel };
        const variables = {
            projectTitle: project?.title || "未命名项目",
            episodeTitle: `第 ${padEpisodeOrder(episode.order)} 集 ${episode.title}`,
            scriptSnapshot: sourceScript,
            productionScriptRules: SCRIPT_OPTIMIZER_PRODUCTION_RULES,
        };
        const promptMessages: ChatCompletionMessage[] = [
            {
                role: "system",
                content: `${agentSystemPromptContent(agentConfig)}\n\n${SCRIPT_OPTIMIZER_PRODUCTION_RULES}`,
            },
            {
                role: "user",
                content: `${fillAgentPromptTemplate(agentConfig.userPromptTemplate, variables)}\n\n${SCRIPT_OPTIMIZER_PRODUCTION_RULES}`,
            },
        ];
        setScriptOptimizing(true);
        try {
            const answer = await requestImageQuestion(requestConfig, promptMessages, (streamed) => {
                if (streamed.trim()) setScriptDraft(cleanOptimizedScriptText(streamed, episode.title));
            });
            const optimized = cleanOptimizedScriptText(answer, episode.title);
            if (optimized) setScriptDraft(optimized);
            message.success("剧本优化完成，请确认后进入导演分析。");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本优化失败");
        } finally {
            setScriptOptimizing(false);
        }
    };

    const saveScript = () => {
        updateEpisode(episode.id, { summary: scriptDraft });
        setActiveModule("director");
        message.success("剧本已确认，进入导演分析。");
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
                onCancelStage={cancelStage}
                onUpdateDirectorReviewState={updateDirectorReviewState}
                onRunStage={(stageId) => {
                    const stage = stages.find((item) => item.stageId === stageId);
                    if (stage) void runStage(stage);
                }}
                onRunStoryboardScene={() => void runStoryboardScene()}
                onOptimizeScript={() => void optimizeScript()}
                onSaveScript={saveScript}
                onSummarizeStoryboardScenes={summarizeStoryboardScenes}
                project={project}
                previews={previews}
                runningStageIds={runningStageIds}
                sceneOptions={sceneOptions}
                scriptOptimizing={scriptOptimizing}
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

const SCRIPT_OPTIMIZER_PRODUCTION_RULES =
    "生产稿标准化硬性规则：\n" +
    "1. 不要只做轻微润色，必须把原始剧本整理成后续导演分析可直接读取的标准生产稿。\n" +
    "2. 删除重复标题、重复摘要、重复集数、粘贴残留；同一标题只保留一次。\n" +
    "3. 每个场次必须使用清晰结构：场次编号 / 地点 / 时间 / 内外 / 出场人物 / 场记 / 动作视觉 / 对白。\n" +
    "4. 场记必须描述空间、人物位置、关键道具、光线氛围和连续性，不要省略。\n" +
    "5. 对白保留为“人物：对白”；动作视觉写成可读段落。\n" +
    "6. 不做导演分析、不输出资产清单、不输出分镜提示词、不输出 JSON。";

function cleanOptimizedScriptText(text: string, episodeTitle: string) {
    const lines = text
        .replace(/\r\n/g, "\n")
        .replace(/(#{1,6}\s*第\s*\d+\s*集\s*摘要[:：]\s*){2,}/g, "# ")
        .replace(/(第\s*\d+\s*集\s*摘要[:：]\s*){2,}/g, "$1")
        .split("\n")
        .map((line) => line.trimEnd());
    const seenHeadings = new Set<string>();
    const cleaned: string[] = [];
    for (const line of lines) {
        const normalized = line.replace(/^#+\s*/, "").trim();
        const headingKey = normalized.replace(/\s+/g, "");
        const isDuplicateHeading = /^第\s*\d+\s*集/.test(normalized) || normalized === episodeTitle.trim();
        if (isDuplicateHeading) {
            if (seenHeadings.has(headingKey)) continue;
            seenHeadings.add(headingKey);
        }
        cleaned.push(line);
    }
    return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
