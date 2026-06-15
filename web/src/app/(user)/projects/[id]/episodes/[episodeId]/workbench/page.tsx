"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { App, Button, Empty, Spin } from "antd";

import { requestImageQuestion, type ChatCompletionMessage } from "@/services/api/image";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useCanvasStore } from "../../../../../canvas/stores/use-canvas-store";
import { useScriptStore } from "../../../../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../../../../canvas/stores/use-storyboard-store";
import { normalizeStructuredEpisodeScript, structuredEpisodeScriptToText, type ScriptEpisode, type StructuredEpisodeScript } from "../../../../../canvas/utils/script-management";
import { canvasEpisodeContextFromEpisode } from "../../../../../canvas/utils/canvas-episode-context";
import { buildCanvasProjectPresetFromConfig } from "../../../../../canvas/utils/canvas-project-preset";
import { videoWorkflowEpisodeKey, videoWorkflowHref, videoWorkflowProjectSlug } from "../../../../../original-workflow/video-workflow-routing";
import { useAgentRunnerStore } from "../../../../use-agent-runner-store";
import { agentSystemPromptContent, canInvokeAgentConfig, defaultAgentConfigs, fillAgentPromptTemplate, mergeAgentConfigs } from "../../../../agent-settings";
import { useAgentSettingsStore } from "../../../../use-agent-settings-store";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";
import { useEpisodeWorkbenchState } from "./use-episode-workbench-state";
import { useEpisodeWorkbenchPreviewActions } from "./use-episode-workbench-preview-actions";
import { useEpisodeWorkbenchRunActions } from "./use-episode-workbench-run-actions";
import { useEpisodeWorkbenchUiState } from "./use-episode-workbench-ui-state";
import { buildEpisodeDistributedWorkflowRunInput, buildEpisodeFullWorkflowRunRequest } from "./episode-workbench-run-input";
import type { CanvasHandoffImportTarget } from "./components/episode-canvas-handoff-utils";
import { EpisodeDetailDrawer } from "./components/episode-module-panel";
import { EpisodeProductionShell } from "./components/episode-production-shell";
import { findVideoPreviewItemIdsForPackage, latestPreview, padEpisodeOrder, type EpisodeModuleKey } from "./episode-workbench-display";

export default function EpisodeProductionWorkbenchPage() {
    const params = useParams<{ id: string; episodeId: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message, modal } = App.useApp();
    const projectId = params.id;
    const episodeId = params.episodeId;
    const projectHydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const attachCanvas = useCreativeProjectStore((state) => state.attachCanvas);
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
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
    const saveWorkflowStageResult = useAgentRunnerStore((state) => state.saveWorkflowStageResult);
    const startWorkflowTextRun = useAgentRunnerStore((state) => state.startWorkflowTextRun);
    const completeWorkflowTextRun = useAgentRunnerStore((state) => state.completeWorkflowTextRun);
    const failWorkflowTextRun = useAgentRunnerStore((state) => state.failWorkflowTextRun);
    const interruptWorkflowStageRun = useAgentRunnerStore((state) => state.interruptWorkflowStageRun);
    const interruptWorkflowSceneRun = useAgentRunnerStore((state) => state.interruptWorkflowSceneRun);
    const clearWorkflowSceneStates = useAgentRunnerStore((state) => state.clearWorkflowSceneStates);
    const globalAgentConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectAgentConfigs = useAgentSettingsStore((state) => state.projectConfigs);
    const effectiveConfig = useEffectiveConfig();
    const checkAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [scriptOptimizing, setScriptOptimizing] = useState(false);
    const [fullWorkflowRunning, setFullWorkflowRunning] = useState(false);
    const [openingOriginalWorkflow, setOpeningOriginalWorkflow] = useState(false);
    const [pendingStructuredScript, setPendingStructuredScript] = useState<StructuredEpisodeScript | undefined>();
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
    const scriptAgentSnapshot = useMemo(() => buildAiReadableScriptSnapshot(scriptSnapshot, episode?.structuredScript), [episode?.structuredScript, scriptSnapshot]);
    const resolvedAgentConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalAgentConfigs, projectAgentConfigs[projectId] || []), [globalAgentConfigs, projectAgentConfigs, projectId]);
    const scriptOptimizerConfig = useMemo(() => resolvedAgentConfigs.find((config) => config.kind === "script_optimizer"), [resolvedAgentConfigs]);
    const requestedModule = parseRequestedEpisodeModule(searchParams.get("module"));
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
        requestedModule,
        sceneOptions,
        scriptSnapshot: scriptAgentSnapshot,
        workflowRun,
    });

    useEffect(() => {
        if (!project || !episode) return;
        ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
    }, [boundCanvas?.id, ensureWorkflowRun, episode, episodeId, preset, project, projectId]);

    const { cancelStage, cancelStoryboardScene, runStage, runStoryboardScene, runningSceneKeys, runningStageDrafts, runningStageIds } = useEpisodeWorkbenchRunActions({
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
        interruptWorkflowStageRun,
        interruptWorkflowSceneRun,
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

    const saveStageResult = useCallback(
        (stageId: string) => {
            if (!workflowRun) {
                message.warning("当前还没有可保存的 workflow 结果。");
                return;
            }
            const result = saveWorkflowStageResult(workflowRun.id, stageId);
            if (!result.ok) {
                message.warning(result.reason || "当前阶段结果无法保存。");
                return;
            }
            message.success("已保存当前阶段结果，刷新后会自动恢复。");
        },
        [message, saveWorkflowStageResult, workflowRun],
    );

    const runFullWorkflow = useCallback(async () => {
        if (!episode) {
            message.warning("当前集数不存在。");
            return;
        }
        const sourceScript = scriptAgentSnapshot.trim();
        if (!sourceScript) {
            message.warning("请先导入或确认本集剧本。");
            return;
        }
        const { promptMessages, requestConfig, textModel } = buildEpisodeFullWorkflowRunRequest({
            effectiveConfig,
            episode,
            projectTitle: project?.title || "",
            resolvedAgentConfigs,
            scriptSnapshot: sourceScript,
        });
        if (!checkAiConfigReady(effectiveConfig, textModel)) {
            message.warning("请先配置可用的文本模型。");
            return;
        }
        const workflowRunId = ensureWorkflowRun({ projectId, canvasId: boundCanvas?.id, episodeId, preset });
        setFullWorkflowRunning(true);
        try {
            const answer = await requestImageQuestion(requestConfig, promptMessages);
            const parsed = parseFullWorkflowResult(answer);
            if (!parsed) {
                message.warning("完整工作流没有返回可用 JSON。");
                return;
            }
            clearWorkflowSceneStates(workflowRunId, "seedance-storyboard");
            const stagePayloads = fullWorkflowStagePayloads(parsed);
            const completedStageIds: string[] = [];
            for (const stageId of ["director-analysis", "art-design", "seedance-storyboard"]) {
                const stage = stages.find((item) => item.stageId === stageId);
                const payload = stagePayloads[stageId];
                if (!stage || !payload) continue;
                const runId = startWorkflowTextRun(
                    buildEpisodeDistributedWorkflowRunInput({
                        boundCanvas,
                        effectiveConfig,
                        episode,
                        preset,
                        projectId,
                        scriptSnapshot: sourceScript,
                        stage,
                        textModel,
                        workflowRunId,
                    }),
                );
                completeWorkflowTextRun(runId, JSON.stringify(payload, null, 2));
                if (stageId !== "art-design") approveRun(runId, "完整工作流自动分发。");
                completedStageIds.push(stageId);
            }
            clearWorkflowSceneStates(workflowRunId, "seedance-storyboard");
            if (completedStageIds.includes("art-design")) generateWorkflowMappingPreview(workflowRunId, "art-design");
            if (completedStageIds.includes("seedance-storyboard")) generateWorkflowMappingPreview(workflowRunId, "seedance-storyboard");
            setActiveModule("storyboard");
            message.success("完整工作流已跑完，结果已分发到导演分析、资产与分镜生产包。");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "完整工作流运行失败");
        } finally {
            setFullWorkflowRunning(false);
        }
    }, [
        approveRun,
        boundCanvas,
        checkAiConfigReady,
        clearWorkflowSceneStates,
        completeWorkflowTextRun,
        effectiveConfig,
        ensureWorkflowRun,
        episode,
        episodeId,
        generateWorkflowMappingPreview,
        message,
        preset,
        project?.title,
        projectId,
        resolvedAgentConfigs,
        scriptAgentSnapshot,
        setActiveModule,
        stages,
        startWorkflowTextRun,
    ]);

    if (!projectHydrated || !scriptsHydrated) {
        return (
            <main className="grid h-full place-items-center bg-background px-6 py-10 text-stone-950 dark:text-stone-100">
                <Spin description="正在读取本地项目" />
            </main>
        );
    }

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
        const sourceScript = (scriptSnapshot || scriptDraft).trim();
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
            structuredScriptRules: SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES,
        };
        const promptMessages: ChatCompletionMessage[] = [
            {
                role: "system",
                content: `${agentSystemPromptContent(agentConfig)}\n\n${SCRIPT_OPTIMIZER_PRODUCTION_RULES}\n\n${SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES}`,
            },
            {
                role: "user",
                content: `${fillAgentPromptTemplate(agentConfig.userPromptTemplate, variables)}\n\n${SCRIPT_OPTIMIZER_PRODUCTION_RULES}\n\n${SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES}`,
            },
        ];
        setScriptOptimizing(true);
        try {
            const answer = await requestImageQuestion(requestConfig, promptMessages);
            const result = parseOptimizedScriptResult(answer, episode.title);
            const optimized = result.productionScript;
            if (!optimized) {
                setScriptDraft(scriptSnapshot || sourceScript);
                setPendingStructuredScript(undefined);
                message.warning("模型没有返回可用的优化稿。");
                return;
            }
            if (!isMeaningfullyOptimizedScript(sourceScript, optimized)) {
                setScriptDraft(scriptSnapshot || sourceScript);
                setPendingStructuredScript(undefined);
                message.warning("模型返回内容与原稿基本一致，未作为有效优化稿写入。请换更强的文本模型或调整剧本优化 Agent 设定后重试。");
                return;
            }
            setScriptDraft(optimized);
            setPendingStructuredScript(result.structuredScript);
            message.success("剧本优化完成，请确认后进入导演分析。");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本优化失败");
        } finally {
            setScriptOptimizing(false);
        }
    };

    const saveScript = () => {
        updateEpisode(episode.id, {
            summary: scriptDraft,
            structuredScript: pendingStructuredScript || (scriptDraft.trim() === scriptSnapshot.trim() ? episode.structuredScript : undefined),
        });
        setPendingStructuredScript(undefined);
        setActiveModule("director");
        message.success("剧本已确认，进入导演分析。");
    };

    const openOriginalWorkflow = async () => {
        const content = (scriptDraft || scriptSnapshot || episode.summary).trim();
        if (!content) {
            message.warning("请先导入或粘贴本集剧本。");
            return;
        }
        setOpeningOriginalWorkflow(true);
        try {
            const response = await fetch("/api/original-workflow", {
                body: JSON.stringify({ action: "save-script", content, episode: videoWorkflowEpisodeKey(episode.order, project.id), projectSlug: videoWorkflowProjectSlug(project.id) }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            if (!response.ok) throw new Error("同步视频工作流剧本失败");
            router.push(videoWorkflowHref(episode.order, project.id, episode.id));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "同步视频工作流剧本失败");
        } finally {
            setOpeningOriginalWorkflow(false);
        }
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
                fullWorkflowRunning={fullWorkflowRunning}
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
                onOpenOriginalWorkflow={() => void openOriginalWorkflow()}
                onRunFullWorkflow={() => void runFullWorkflow()}
                onApproveStageReview={approveStageReview}
                onApproveStoryboardScene={approveCurrentStoryboardScene}
                onCancelStage={cancelStage}
                onCancelStoryboardScene={cancelStoryboardScene}
                onUpdateDirectorReviewState={updateDirectorReviewState}
                onRunStage={(stageId) => {
                    const stage = stages.find((item) => item.stageId === stageId);
                    if (stage) void runStage(stage);
                }}
                onRunStoryboardScene={() => void runStoryboardScene()}
                onOptimizeScript={() => void optimizeScript()}
                onSaveScript={saveScript}
                onSaveStageResult={saveStageResult}
                onSummarizeStoryboardScenes={summarizeStoryboardScenes}
                project={project}
                previews={previews}
                openingOriginalWorkflow={openingOriginalWorkflow}
                runningStageIds={runningStageIds}
                runningSceneKeys={runningSceneKeys}
                runningStageDrafts={runningStageDrafts}
                sceneOptions={sceneOptions}
                scriptOptimizing={scriptOptimizing}
                scriptDraft={scriptDraft}
                scriptSnapshot={scriptSnapshot}
                structuredScriptDraft={pendingStructuredScript}
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
    "6. 不允许原样返回、只改标点、只改换行或只补标题；必须让生产稿比原稿更结构化、更可拍。\n" +
    "7. 不做导演分析、不输出资产清单、不输出分镜提示词；productionScript 只放优化后的完整剧本正文。";

const SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES =
    "结构化输出硬性规则：\n" +
    "1. 最终回复必须是一个 JSON 对象，不要 Markdown，不要代码围栏，不要解释文字。\n" +
    "2. 顶层只包含 productionScript 和 structuredScript。\n" +
    "3. productionScript 是优化后的完整生产稿正文，供人阅读和确认。\n" +
    "4. structuredScript.schemaVersion 固定为 episode-script.v1。\n" +
    "5. structuredScript 必须包含 episodeTitle、summary、characters、scenes。\n" +
    "6. 每个 scenes 条目必须包含 sceneId、location、timeOfDay、space、characters、sceneNote、beats、assets。\n" +
    "7. beats 只能使用 type=action/dialogue/visual/note；dialogue 必须写 speaker 和 text。\n" +
    "8. assets 必须包含 characters、locations、props、costumes、mood 数组，缺失时给空数组。";

function buildAiReadableScriptSnapshot(scriptSnapshot: string, structuredScript?: StructuredEpisodeScript) {
    if (!structuredScript) return scriptSnapshot;
    return [scriptSnapshot, "AI 结构化剧本 JSON：", JSON.stringify(structuredScript, null, 2)].filter(Boolean).join("\n\n");
}

function parseOptimizedScriptResult(text: string, episodeTitle: string) {
    const payload = parseJsonObjectFromText(text);
    if (!payload) return { productionScript: cleanOptimizedScriptText(text, episodeTitle), structuredScript: undefined };
    const structuredScript = normalizeStructuredEpisodeScript(payload.structuredScript || payload);
    const productionScript = cleanOptimizedScriptText(stringFromPayload(payload, ["productionScript", "optimizedScript", "script", "text"]) || (structuredScript ? structuredEpisodeScriptToText(structuredScript) : text), episodeTitle);
    return { productionScript, structuredScript };
}

function parseJsonObjectFromText(text: string): Record<string, unknown> | undefined {
    const candidates = [text.trim()];
    for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
        if (match[1]) candidates.push(match[1].trim());
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
            // try next candidate
        }
    }
    return undefined;
}

function parseFullWorkflowResult(text: string): Record<string, unknown> | undefined {
    const payload = parseJsonObjectFromText(text);
    if (!payload) return undefined;
    const hasWorkflowShape = payload.directorAnalysis || payload.assets || payload.storyboard;
    return hasWorkflowShape ? payload : undefined;
}

function fullWorkflowStagePayloads(payload: Record<string, unknown>): Record<string, Record<string, unknown> | undefined> {
    const directorAnalysis = objectPayload(payload.directorAnalysis) || objectPayload(payload.director) || { summary: stringFromPayload(payload, ["summary"]) || "完整工作流导演分析已生成。", raw: payload.directorAnalysis || payload.director };
    const assets = normalizeFullWorkflowAssetsPayload(payload.assets || payload.assetAnalysis || payload.productionBible);
    const storyboard = objectPayload(payload.storyboard || payload.storyboardPackages || payload.seedanceStoryboard);
    return {
        "director-analysis": directorAnalysis,
        "art-design": assets,
        "seedance-storyboard": storyboard,
    };
}

function normalizeFullWorkflowAssetsPayload(value: unknown): Record<string, unknown> | undefined {
    if (Array.isArray(value)) return { assets: value };
    const record = objectPayload(value);
    if (!record) return undefined;
    if (Array.isArray(record.assets)) return record;
    const assets = ["characters", "scenes", "props", "costumes", "items"].flatMap((key) => {
        const list = record[key];
        return Array.isArray(list) ? list : [];
    });
    return assets.length ? { ...record, assets } : record;
}

function objectPayload(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringFromPayload(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

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
    return cleaned
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function isMeaningfullyOptimizedScript(source: string, optimized: string) {
    const sourceNormalized = normalizeComparableScriptText(source);
    const optimizedNormalized = normalizeComparableScriptText(optimized);
    if (!sourceNormalized || !optimizedNormalized) return false;
    if (sourceNormalized === optimizedNormalized) return false;
    const sourceLength = sourceNormalized.length;
    const optimizedLength = optimizedNormalized.length;
    const lengthGrowth = optimizedLength / Math.max(sourceLength, 1);
    const productionMarkers = ["出场人物", "场记", "动作视觉", "对白", "内外"].filter((marker) => optimized.includes(marker)).length;
    if (lengthGrowth >= 1.18 || productionMarkers >= 3) return true;
    if (lengthGrowth < 1.08 && productionMarkers < 2) return false;
    return normalizedTextSimilarity(sourceNormalized, optimizedNormalized) < 0.9;
}

function normalizeComparableScriptText(text: string) {
    return text
        .replace(/\s+/g, "")
        .replace(/[，。！？；：、“”‘’《》（）()#\-—_]/g, "")
        .trim();
}

function normalizedTextSimilarity(left: string, right: string) {
    const leftChars = new Map<string, number>();
    for (const char of left) leftChars.set(char, (leftChars.get(char) || 0) + 1);
    let shared = 0;
    for (const char of right) {
        const count = leftChars.get(char) || 0;
        if (!count) continue;
        shared += 1;
        if (count === 1) leftChars.delete(char);
        else leftChars.set(char, count - 1);
    }
    return shared / Math.max(left.length, right.length, 1);
}

function parseRequestedEpisodeModule(value: string | null): EpisodeModuleKey | undefined {
    if (value === "script" || value === "director" || value === "assets" || value === "storyboard" || value === "canvas") return value;
    return undefined;
}
