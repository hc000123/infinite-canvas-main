"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Empty, Form, Input, Modal, Spin } from "antd";
import { Wand2 } from "lucide-react";

import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasCreateProjectModal } from "../../canvas/components/canvas-create-project-modal";
import { useCanvasStore } from "../../canvas/stores/use-canvas-store";
import { useProductionBibleStore } from "../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../canvas/stores/use-storyboard-store";
import { buildImportedEpisodeWriteInput, canvasEpisodeContextFromCreateBinding, type CanvasCreateScriptBinding } from "../../canvas/utils/canvas-episode-context";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../../canvas/utils/canvas-project-preset";
import type { StructuredEpisodeScript } from "../../canvas/utils/script-management";
import { useOriginalWorkflowStore } from "../../original-workflow/use-original-workflow-store";
import { videoWorkflowEpisodeKey, videoWorkflowHref, videoWorkflowProjectSlug } from "../../original-workflow/video-workflow-routing";
import { canvasIdsForCreativeProject, unfiledCanvasProjects } from "../creative-projects";
import { editableCanvasPreset } from "../project-canvas-preset";
import { collectProjectAssetReferences, filterProjectAssetReferences, type ProjectAssetReferenceFilters } from "../project-asset-references";
import { defaultAgentConfigs, mergeAgentConfigs } from "../agent-settings";
import { builtInAgentWorkflowPresets, resolveWorkflowPreset } from "../agent-workflow-presets";
import type { ChatCompletionMessage } from "../agent-runner-types";
import { buildProjectScriptOptimizerMessages, runProjectScriptOptimizer } from "../script-optimizer-runner";
import { useAgentSettingsStore } from "../use-agent-settings-store";
import { useAgentRunnerStore } from "../use-agent-runner-store";
import { useCreativeProjectStore } from "../use-creative-project-store";
import { ProjectEpisodeBoard, type ProjectDetailTab, type ProjectEpisodeBoardRow } from "./components/project-episode-board";
import { buildOriginalScriptEditPatch } from "./project-episode-script-edit";

type EpisodeImportFormValues = {
    title: string;
    scriptText: string;
};

type OptimizedImportDraft = {
    sourceScript: string;
    structuredScript?: StructuredEpisodeScript;
};

function normalizeRunnerPromptMessages(messages: ReturnType<typeof buildProjectScriptOptimizerMessages>): ChatCompletionMessage[] {
    return messages.map(
        (item): ChatCompletionMessage => ({
            role: item.role as ChatCompletionMessage["role"],
            content: typeof item.content === "string" ? item.content : JSON.stringify(item.content),
        }),
    );
}

export default function CreativeProjectDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { message } = App.useApp();
    const [episodeImportForm] = Form.useForm<EpisodeImportFormValues>();
    const effectiveConfig = useEffectiveConfig();
    const checkAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const projectId = params.id;
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const updateCreativeProject = useCreativeProjectStore((state) => state.updateProject);
    const attachCanvas = useCreativeProjectStore((state) => state.attachCanvas);
    const canvases = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const updateCanvas = useCanvasStore((state) => state.updateProject);
    const assets = useAssetStore((state) => state.assets);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const globalAgentConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectAgentConfigs = useAgentSettingsStore((state) => state.projectConfigs);
    const projectWorkflowSelections = useAgentSettingsStore((state) => state.projectWorkflowSelections);
    const saveProjectWorkflowSelection = useAgentSettingsStore((state) => state.saveProjectWorkflowSelection);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
    const upsertScriptProject = useScriptStore((state) => state.upsertProject);
    const addEpisode = useScriptStore((state) => state.addEpisode);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const [activeTab, setActiveTab] = useState<ProjectDetailTab>("episodes");
    const [assetReferenceFilters, setAssetReferenceFilters] = useState<ProjectAssetReferenceFilters>({ assetKind: "all", fileStatus: "all", projectLibraryStatus: "all", referenceType: "all", versionStatus: "all" });
    const [canvasCreateOpen, setCanvasCreateOpen] = useState(false);
    const [episodeImportOpen, setEpisodeImportOpen] = useState(false);
    const [projectEditOpen, setProjectEditOpen] = useState(false);
    const [scriptOptimizing, setScriptOptimizing] = useState(false);
    const [episodeImporting, setEpisodeImporting] = useState(false);
    const [optimizingEpisodeId, setOptimizingEpisodeId] = useState("");
    const [scriptOptimizeErrors, setScriptOptimizeErrors] = useState<Record<string, string>>({});
    const [optimizedImportDraft, setOptimizedImportDraft] = useState<OptimizedImportDraft>();
    const [editingCanvasPresetId, setEditingCanvasPresetId] = useState("");
    const [editingEpisodeTitleId, setEditingEpisodeTitleId] = useState("");
    const [episodeTitleDraft, setEpisodeTitleDraft] = useState("");
    const [titleDraft, setTitleDraft] = useState(project?.title || "");
    const [descriptionDraft, setDescriptionDraft] = useState(project?.description || "");
    const [episodeFilter, setEpisodeFilter] = useState<"all" | "done" | "draft" | "running">("all");
    const [bindingCanvasId, setBindingCanvasId] = useState("");
    const storyboardGroups = useStoryboardStore((state) => state.groups);
    const storyboardShots = useStoryboardStore((state) => state.shots);
    const storyboardTableShots = useStoryboardStore((state) => state.tableShots);
    const shotGroups = useStoryboardStore((state) => state.shotGroups);
    const startWorkflowTextRun = useAgentRunnerStore((state) => state.startWorkflowTextRun);
    const completeWorkflowTextRun = useAgentRunnerStore((state) => state.completeWorkflowTextRun);
    const failWorkflowTextRun = useAgentRunnerStore((state) => state.failWorkflowTextRun);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const workflowExecutionMode = useOriginalWorkflowStore((state) => state.executionMode);
    const workflowRootPath = useOriginalWorkflowStore((state) => state.rootPath);
    const codexApiBaseUrl = useOriginalWorkflowStore((state) => state.codexApiBaseUrl);
    const codexApiKey = useOriginalWorkflowStore((state) => state.codexApiKey);
    const codexModel = useOriginalWorkflowStore((state) => state.codexModel);
    const canvasIds = useMemo(() => (project ? canvasIdsForCreativeProject(project, canvases) : []), [canvases, project]);
    const projectCanvases = useMemo(() => canvases.filter((canvas) => canvasIds.includes(canvas.id)), [canvasIds, canvases]);
    const projectEpisodes = useMemo(() => episodes.filter((episode) => episode.projectId === projectId).sort((a, b) => a.order - b.order), [episodes, projectId]);
    const editingEpisodeTitle = useMemo(() => projectEpisodes.find((episode) => episode.id === editingEpisodeTitleId), [editingEpisodeTitleId, projectEpisodes]);
    const editingCanvasPreset = useMemo(() => projectCanvases.find((canvas) => canvas.id === editingCanvasPresetId), [editingCanvasPresetId, projectCanvases]);
    const unboundCanvases = useMemo(() => unfiledCanvasProjects(canvases, project ? [project] : []), [canvases, project]);
    useEffect(() => {
        setDescriptionDraft(project?.description || "");
        setTitleDraft(project?.title || "");
    }, [project?.description, project?.title]);

    const episodeRows = useMemo(
        () =>
            projectEpisodes.map((episode): ProjectEpisodeBoardRow => {
                const episodeCanvases = projectCanvases.filter((canvas) => canvas.episodeId === episode.id);
                const episodeTableShots = storyboardTableShots.filter((shot) => shot.projectId === projectId && shot.episodeId === episode.id);
                const episodeShotGroups = shotGroups.filter((group) => group.projectId === projectId && group.episodeId === episode.id);
                const finishedGroups = episodeShotGroups.filter((group) => group.status === "done" || group.resultAssetIds.length);
                const shotCount = episodeTableShots.length || episodeShotGroups.reduce((total, group) => total + group.shotIds.length, 0);
                const videoCount = finishedGroups.length;
                const hasScript = Boolean((episode.sourceSummary || episode.summary).trim());
                const stage = !hasScript ? "未开始" : shotCount ? (shotCount > 0 && videoCount >= shotCount ? "成片" : "分镜") : "剧本";
                const progress = stage === "成片" ? 100 : stage === "分镜" ? Math.max(42, Math.min(92, videoCount ? Math.round((videoCount / Math.max(shotCount, 1)) * 100) : 62)) : stage === "剧本" ? 8 : 0;
                const status = progress >= 100 ? "已完成" : stage === "分镜" ? "进行中" : "草稿";
                const sourceSummary = episode.sourceSummary?.trim();
                return {
                    id: episode.id,
                    canvasCount: episodeCanvases.length,
                    filterStatus: status === "已完成" ? "done" : status === "进行中" ? "running" : "draft",
                    order: episode.order,
                    progress,
                    shotText: shotCount ? (stage === "分镜" && videoCount ? `${videoCount} / ${shotCount}` : String(shotCount)) : "-",
                    stage,
                    status,
                    optimizedScriptPreview: sourceSummary ? episode.summary : "",
                    scriptPreview: sourceSummary || episode.summary,
                    title: episode.title,
                    updatedAt: episode.updatedAt,
                    videoCount,
                    primaryCanvasId: episodeCanvases[0]?.id,
                };
            }),
        [projectCanvases, projectEpisodes, projectId, shotGroups, storyboardTableShots],
    );
    const filteredEpisodeRows = useMemo(() => (episodeFilter === "all" ? episodeRows : episodeRows.filter((row) => row.filterStatus === episodeFilter)), [episodeFilter, episodeRows]);
    const episodeCounts = useMemo(
        () => ({
            all: episodeRows.length,
            done: episodeRows.filter((row) => row.filterStatus === "done").length,
            draft: episodeRows.filter((row) => row.filterStatus === "draft").length,
            running: episodeRows.filter((row) => row.filterStatus === "running").length,
        }),
        [episodeRows],
    );
    const currentEpisode = useMemo(() => episodeRows.find((row) => row.filterStatus === "running") || episodeRows.find((row) => row.filterStatus === "draft") || episodeRows[episodeRows.length - 1], [episodeRows]);
    const scriptOptimizerConfig = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalAgentConfigs, projectAgentConfigs[projectId] || []).find((config) => config.kind === "script_optimizer"), [globalAgentConfigs, projectAgentConfigs, projectId]);
    const workflowPresets = useMemo(() => builtInAgentWorkflowPresets(), []);
    const scriptSkillPresets = useMemo(() => {
        const whitePaperPreset = workflowPresets.find((preset) => preset.version.startsWith("5.2") && preset.stages.some((stage) => stage.stageId === "script-adaptation"));
        return whitePaperPreset ? [whitePaperPreset] : [];
    }, [workflowPresets]);
    const scriptSkillOptions = useMemo(() => scriptSkillPresets.map((preset) => ({ label: "白皮书 AI 剧本母版适配包 v1.1", value: preset.workflowId })), [scriptSkillPresets]);
    const projectWorkflowSelectionList = useMemo(() => projectWorkflowSelections[projectId] || [], [projectId, projectWorkflowSelections]);
    const selectedWorkflowPreset = useMemo(() => {
        const selectedWorkflowId = projectWorkflowSelectionList.find((selection) => selection.selected)?.workflowId || workflowPresets[0].workflowId;
        return resolveWorkflowPreset(selectedWorkflowId, projectWorkflowSelectionList) || workflowPresets[0];
    }, [projectWorkflowSelectionList, workflowPresets]);
    const selectedScriptWorkflowPreset = useMemo(() => {
        const selectedScriptPreset = scriptSkillPresets.find((preset) => preset.workflowId === selectedWorkflowPreset.workflowId);
        return selectedScriptPreset || scriptSkillPresets[0] || selectedWorkflowPreset;
    }, [scriptSkillPresets, selectedWorkflowPreset]);
    const projectProgress = useMemo(() => {
        if (!episodeRows.length) return 0;
        return Math.round(episodeRows.reduce((total, row) => total + row.progress, 0) / episodeRows.length);
    }, [episodeRows]);
    const assetReferenceRows = useMemo(
        () =>
            project
                ? collectProjectAssetReferences({
                      assets,
                      canvasIds,
                      canvasProjects: canvases,
                      productionBibleItems,
                      projectId: project.id,
                      projectTitle: project.title,
                      shotGroups,
                      storyboardGroups,
                      storyboardShots,
                      storyboardTableShots,
                  })
                : [],
        [assets, canvasIds, canvases, productionBibleItems, project, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots],
    );
    const filteredAssetReferenceRows = useMemo(() => filterProjectAssetReferences(assetReferenceRows, assetReferenceFilters), [assetReferenceFilters, assetReferenceRows]);
    useEffect(() => {
        if (!episodeImportOpen) {
            setOptimizedImportDraft(undefined);
            return;
        }
        episodeImportForm.setFieldsValue({ title: "", scriptText: "" });
    }, [episodeImportForm, episodeImportOpen]);

    if (!hydrated || !scriptsHydrated) {
        return (
            <main className="studio-workspace grid h-full place-items-center bg-[var(--studio-shell-bg)] px-6 py-10 text-[var(--studio-text-primary)]">
                <Spin description="正在读取本地项目" />
            </main>
        );
    }

    if (!project) {
        return (
            <main className="studio-workspace h-full overflow-auto bg-[var(--studio-shell-bg)] px-6 py-10 text-[var(--studio-text-primary)]">
                <div className="mx-auto max-w-3xl">
                    <Empty description="项目不存在或尚未加载">
                        <Button href="/projects">返回项目中心</Button>
                    </Empty>
                </div>
            </main>
        );
    }

    const saveProjectEdit = () => {
        updateCreativeProject(project.id, { title: titleDraft, description: descriptionDraft });
        setProjectEditOpen(false);
        message.success("项目信息已保存");
    };

    const openEpisodeTitleEdit = (row: ProjectEpisodeBoardRow) => {
        setEditingEpisodeTitleId(row.id);
        setEpisodeTitleDraft(row.title);
    };

    const saveEpisodeTitleEdit = () => {
        const title = episodeTitleDraft.trim();
        if (!editingEpisodeTitle) return;
        if (!title) return message.warning("请填写分集标题");
        updateEpisode(editingEpisodeTitle.id, { title });
        setEditingEpisodeTitleId("");
        setEpisodeTitleDraft("");
        message.success("分集标题已保存");
    };

    const closeEpisodeTitleEdit = () => {
        setEditingEpisodeTitleId("");
        setEpisodeTitleDraft("");
    };

    const startScriptOptimizerRunner = (input: { episodeId?: string; episodeTitle: string; source: "episode_import" | "project_detail"; sourceScript: string }) => {
        if (!scriptOptimizerConfig) throw new Error("未找到剧本优化 Agent 设定");
        const preferredModel = scriptOptimizerConfig.modelPreference.trim();
        const textModel = preferredModel && preferredModel !== "default" ? preferredModel : effectiveConfig.textModel || effectiveConfig.model;
        const runnerModel = workflowExecutionMode === "local-runner" ? codexModel || "当前 Codex 登录态" : textModel;
        const runnerProvider = workflowExecutionMode === "local-runner" ? "local-codex-cli" : effectiveConfig.channelMode;
        const promptMessages = buildProjectScriptOptimizerMessages({
            agentConfig: scriptOptimizerConfig,
            episodeTitle: input.episodeTitle,
            projectTitle: project.title,
            scriptSnapshot: input.sourceScript,
        });
        const scriptStage = selectedScriptWorkflowPreset.stages.find((stage) => stage.stageId === "script-adaptation");
        const workflowRunId = input.episodeId && scriptStage ? ensureWorkflowRun({ projectId: project.id, episodeId: input.episodeId, preset: selectedScriptWorkflowPreset }) : undefined;
        return startWorkflowTextRun({
            projectId: project.id,
            episodeId: input.episodeId,
            episodeTitle: input.episodeTitle,
            scriptSnapshot: input.sourceScript,
            sourceType: "workflow_text_stage",
            sourceId: input.source === "episode_import" ? "project-episode-import-script-optimizer" : "project-detail-script-optimizer",
            variables: { source: input.source, stageId: "script-adaptation" },
            workflowRunId,
            workflowId: selectedScriptWorkflowPreset.workflowId,
            workflowVersion: selectedScriptWorkflowPreset.version,
            stageId: "script-adaptation",
            agentId: "script-optimizer",
            agentName: scriptOptimizerConfig.name,
            sourcePresetId: selectedScriptWorkflowPreset.workflowId,
            presetId: selectedScriptWorkflowPreset.workflowId,
            inputSnapshot: {
                episodeTitle: input.episodeTitle,
                projectTitle: project.title,
                scriptLength: input.sourceScript.length,
            },
            promptMessages: normalizeRunnerPromptMessages(promptMessages),
            model: runnerModel,
            provider: runnerProvider,
            configSummary: JSON.stringify({ executionMode: workflowExecutionMode, model: runnerModel, channelMode: runnerProvider, source: input.source }, null, 2),
            sourceFiles: ["web/src/app/(user)/projects/agent-settings.ts", "web/src/app/(user)/projects/script-optimizer-agent.ts"],
            qualityGateIds: scriptStage?.qualityGateIds || ["script-production-draft-check"],
        });
    };

    const selectScriptSkill = (workflowId: string) => {
        if (!scriptSkillPresets.some((preset) => preset.workflowId === workflowId)) return;
        saveProjectWorkflowSelection(project.id, { workflowId, projectId: project.id, enabled: true, selected: true, updatedAt: new Date().toISOString() });
        message.success("已切换剧本优化 Skill");
    };

    const importEpisode = async () => {
        const values = await episodeImportForm.validateFields();
        const scriptText = values.scriptText.trim();
        const title = values.title.trim();
        if (!scriptText) return message.warning("请粘贴本集剧本");
        setEpisodeImporting(true);
        try {
            upsertScriptProject(project.id, scriptText);
            const order = projectEpisodes.length + 1;
            const sourceSummary = optimizedImportDraft?.sourceScript && optimizedImportDraft.sourceScript.trim() !== scriptText ? optimizedImportDraft.sourceScript : undefined;
            addEpisode({ projectId: project.id, order, title, summary: scriptText, sourceSummary, structuredScript: optimizedImportDraft?.structuredScript, hook: "", turningPoint: "", cliffhanger: "" });
            await syncVideoWorkflowScript(order, scriptText);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "同步视频工作流剧本失败");
            return;
        } finally {
            setEpisodeImporting(false);
        }
        setEpisodeImportOpen(false);
        setOptimizedImportDraft(undefined);
        episodeImportForm.resetFields();
        message.success("已导入本集剧本，可在分集栏手动进入视频工作流");
    };

    const optimizeEpisodeImportScript = async () => {
        const values = episodeImportForm.getFieldsValue();
        const sourceScript = values.scriptText?.trim() || "";
        const title = values.title?.trim() || "未命名集数";
        if (!sourceScript) return message.warning("请先粘贴本集剧本");
        if (!scriptOptimizerConfig) return message.warning("未找到剧本优化 Agent 设定");
        const runnerRunId = startScriptOptimizerRunner({ episodeTitle: title, source: "episode_import", sourceScript });
        setScriptOptimizing(true);
        try {
            const result = await runProjectScriptOptimizer({
                agentConfig: scriptOptimizerConfig,
                checkAiConfigReady,
                codexAgent: { apiBaseUrl: codexApiBaseUrl, apiKey: codexApiKey, model: codexModel },
                effectiveConfig,
                episodeTitle: title,
                executionMode: workflowExecutionMode,
                projectTitle: project.title,
                rootPath: workflowRootPath,
                scriptSnapshot: sourceScript,
            });
            completeWorkflowTextRun(runnerRunId, result.rawText);
            episodeImportForm.setFieldValue("scriptText", result.productionScript);
            setOptimizedImportDraft({ sourceScript, structuredScript: result.structuredScript });
            message.success("已生成 AI 适配稿，请检查后导入。");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "剧本 AI 适配失败";
            failWorkflowTextRun(runnerRunId, errorMessage);
            message.warning(errorMessage);
        } finally {
            setScriptOptimizing(false);
        }
    };

    const clearEpisodeOptimizedScript = (episodeId: string) => {
        const episode = projectEpisodes.find((item) => item.id === episodeId);
        if (!episode) return;
        const sourceScript = episode.sourceSummary?.trim() || episode.summary.trim();
        if (!sourceScript) return message.warning("当前分集还没有剧本");
        updateEpisode(episode.id, { summary: "", sourceSummary: episode.sourceSummary || sourceScript, structuredScript: undefined });
        setScriptOptimizeErrors((state) => ({ ...state, [episode.id]: "" }));
        message.success("已清除上一版优化稿");
    };

    const optimizeExistingEpisodeScript = async (episodeId: string) => {
        const episode = projectEpisodes.find((item) => item.id === episodeId);
        if (!episode) return;
        const sourceScript = episode.sourceSummary?.trim() || episode.summary.trim();
        if (!sourceScript) return message.warning("当前分集还没有剧本");
        if (!scriptOptimizerConfig) return message.warning("未找到剧本优化 Agent 设定");
        updateEpisode(episode.id, { summary: "", sourceSummary: episode.sourceSummary || sourceScript, structuredScript: undefined });
        const runnerRunId = startScriptOptimizerRunner({ episodeId: episode.id, episodeTitle: episode.title, source: "project_detail", sourceScript });
        setOptimizingEpisodeId(episode.id);
        setScriptOptimizeErrors((state) => ({ ...state, [episode.id]: "" }));
        try {
            const result = await runProjectScriptOptimizer({
                agentConfig: scriptOptimizerConfig,
                checkAiConfigReady,
                codexAgent: { apiBaseUrl: codexApiBaseUrl, apiKey: codexApiKey, model: codexModel },
                effectiveConfig,
                episodeTitle: episode.title,
                executionMode: workflowExecutionMode,
                projectTitle: project.title,
                rootPath: workflowRootPath,
                scriptSnapshot: sourceScript,
            });
            await syncVideoWorkflowScript(episode.order, result.productionScript);
            completeWorkflowTextRun(runnerRunId, result.rawText);
            updateEpisode(episode.id, { summary: result.productionScript, sourceSummary: episode.sourceSummary || sourceScript, structuredScript: result.structuredScript });
            setScriptOptimizeErrors((state) => ({ ...state, [episode.id]: "" }));
            message.success("已优化本集剧本，可继续进入视频工作流。");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "剧本优化失败";
            failWorkflowTextRun(runnerRunId, errorMessage);
            setScriptOptimizeErrors((state) => ({ ...state, [episode.id]: errorMessage }));
            message.warning(errorMessage);
        } finally {
            setOptimizingEpisodeId("");
        }
    };

    const createCanvasAndOpen = (title: string, preset: CanvasProjectPreset, scriptBinding?: CanvasCreateScriptBinding) => {
        if (scriptBinding?.mode === "import" && !scriptBinding.scriptText.trim()) {
            message.warning("请粘贴本集剧本");
            return;
        }
        const importedEpisode = buildImportedEpisodeWriteInput(project.id, scriptBinding);
        const importedEpisodeId = importedEpisode ? addEpisode({ ...importedEpisode, order: projectEpisodes.length + 1 }) : undefined;
        if (importedEpisode?.summary) upsertScriptProject(project.id, importedEpisode.summary);
        const episodeContext = canvasEpisodeContextFromCreateBinding(project.id, scriptBinding, importedEpisodeId);
        const canvasId = createCanvas(title, preset, { projectId: project.id, episodeContext });
        attachCanvas(project.id, canvasId);
        setCanvasCreateOpen(false);
        window.setTimeout(() => router.push(`/canvas/${canvasId}`), 0);
    };

    const bindCanvas = () => {
        if (!bindingCanvasId) return;
        updateCanvas(bindingCanvasId, { projectId: project.id, preset: project.preset });
        attachCanvas(project.id, bindingCanvasId);
        setBindingCanvasId("");
        message.success("已绑定旧画布");
    };

    const saveCanvasPreset = (_title: string, preset: CanvasProjectPreset) => {
        if (!editingCanvasPreset) return;
        updateCanvas(editingCanvasPreset.id, { preset });
        setEditingCanvasPresetId("");
        message.success("画布预设已保存");
    };

    const openEpisodeWorkflow = (episodeId: string) => {
        const episode = projectEpisodes.find((item) => item.id === episodeId);
        if (!episode) return;
        window.location.assign(videoWorkflowHref(episode.order, project.id, episode.id));
    };

    const saveEpisodeScript = (episodeId: string, script: string) => {
        try {
            updateEpisode(episodeId, buildOriginalScriptEditPatch(script));
            message.success("原剧本已更新，旧提取结果已清空");
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "剧本保存失败");
        }
    };

    const syncVideoWorkflowScript = async (order: number, content: string) => {
        const episode = videoWorkflowEpisodeKey(order, project.id);
        try {
            const response = await fetch("/api/original-workflow", {
                body: JSON.stringify({ action: "save-script", content, episode, executionMode: workflowExecutionMode, projectSlug: videoWorkflowProjectSlug(project.id), rootPath: workflowRootPath }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            return response.ok;
        } catch {
            return false;
        }
    };

    return (
        <main className="studio-workspace studio-shell h-full overflow-auto text-[var(--studio-text-primary)]">
            <ProjectEpisodeBoard
                activeTab={activeTab}
                assetReferenceFilters={assetReferenceFilters}
                assetReferenceRows={assetReferenceRows}
                currentEpisode={currentEpisode}
                counts={episodeCounts}
                description={project.description}
                episodeFilter={episodeFilter}
                filteredAssetReferenceRows={filteredAssetReferenceRows}
                filteredRows={filteredEpisodeRows}
                progress={projectProgress}
                canvases={projectCanvases}
                unboundCanvases={unboundCanvases}
                bindingCanvasId={bindingCanvasId}
                projectId={project.id}
                projectTitle={project.title}
                presetSummary={canvasProjectPresetSummary(project.preset)}
                rows={episodeRows}
                onBindCanvas={bindCanvas}
                onBindingCanvasChange={setBindingCanvasId}
                onAssetReferenceFiltersChange={setAssetReferenceFilters}
                onCreateCanvas={() => setCanvasCreateOpen(true)}
                onEditCanvasPreset={setEditingCanvasPresetId}
                onEditEpisodeTitle={openEpisodeTitleEdit}
                onOpenAgentSettings={() => router.push(`/projects/${project.id}/agents`)}
                onEditProject={() => setProjectEditOpen(true)}
                onFilterChange={setEpisodeFilter}
                onImportEpisode={() => setEpisodeImportOpen(true)}
                onClearOptimizedScript={clearEpisodeOptimizedScript}
                onOptimizeEpisodeScript={(episodeId) => void optimizeExistingEpisodeScript(episodeId)}
                onOpenEpisode={openEpisodeWorkflow}
                onSaveEpisodeScript={saveEpisodeScript}
                onScriptSkillChange={selectScriptSkill}
                onTabChange={setActiveTab}
                optimizingEpisodeId={optimizingEpisodeId}
                scriptOptimizeErrors={scriptOptimizeErrors}
                scriptSkillOptions={scriptSkillOptions}
                selectedScriptSkillId={selectedScriptWorkflowPreset.workflowId}
            />

            <Modal rootClassName="studio-modal" title="编辑项目" open={projectEditOpen} onCancel={() => setProjectEditOpen(false)} onOk={saveProjectEdit} okText="保存" cancelText="取消" destroyOnHidden>
                <div className="grid gap-4">
                    <label className="grid gap-2">
                        <span className="text-sm text-[var(--studio-text-secondary)]">项目名称</span>
                        <Input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                        <span className="text-sm text-[var(--studio-text-secondary)]">项目说明</span>
                        <Input.TextArea value={descriptionDraft} rows={5} onChange={(event) => setDescriptionDraft(event.target.value)} />
                    </label>
                </div>
            </Modal>
            <Modal rootClassName="studio-modal" title="修改分集标题" open={Boolean(editingEpisodeTitle)} onCancel={closeEpisodeTitleEdit} onOk={saveEpisodeTitleEdit} okText="保存" cancelText="取消" destroyOnHidden>
                <label className="grid gap-2">
                    <span className="text-sm text-[var(--studio-text-secondary)]">标题</span>
                    <Input value={episodeTitleDraft} placeholder="例如：毕业典礼" maxLength={80} showCount onChange={(event) => setEpisodeTitleDraft(event.target.value)} onPressEnter={saveEpisodeTitleEdit} />
                </label>
            </Modal>
            <Modal
                rootClassName="studio-modal"
                title="导入本集剧本"
                open={episodeImportOpen}
                onCancel={() => setEpisodeImportOpen(false)}
                onOk={() => void importEpisode()}
                okText="导入剧本"
                cancelText="取消"
                confirmLoading={scriptOptimizing || episodeImporting}
                destroyOnHidden
            >
                <Form form={episodeImportForm} layout="vertical" initialValues={{ title: "", scriptText: "" }} requiredMark={false}>
                    <Form.Item name="title" label="本集标题" rules={[{ required: true, message: "请填写本集标题" }]}>
                        <Input placeholder="例如：毕业典礼" />
                    </Form.Item>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm text-[var(--studio-text-secondary)]">本集剧本</span>
                        <Button size="small" icon={<Wand2 className="size-3.5" />} loading={scriptOptimizing} onClick={() => void optimizeEpisodeImportScript()}>
                            AI 适配剧本
                        </Button>
                    </div>
                    <Form.Item name="scriptText" rules={[{ required: true, message: "请粘贴本集剧本" }]}>
                        <Input.TextArea rows={10} placeholder="导入后会留在当前项目分集页；需要继续生产时再手动进入视频工作流。" />
                    </Form.Item>
                </Form>
            </Modal>
            <CanvasCreateProjectModal
                open={canvasCreateOpen}
                defaultTitle={`${project.title} 画布 ${projectCanvases.length + 1}`}
                initialPreset={project.preset}
                config={effectiveConfig}
                modalTitle="新建项目画布"
                namePlaceholder="例如：第一集主画布"
                helperText="可先选择或导入本集剧本；画布会保存本集标题和剧本文本快照，后续分镜、素材和生成结果都能追溯到这一集。"
                scriptOptions={{ projectId: project.id, episodes, scenes }}
                onCancel={() => setCanvasCreateOpen(false)}
                onCreate={createCanvasAndOpen}
            />
            <CanvasCreateProjectModal
                open={Boolean(editingCanvasPreset)}
                defaultTitle={editingCanvasPreset?.title || project.title}
                initialPreset={editableCanvasPreset(editingCanvasPreset?.preset, project.preset)}
                config={effectiveConfig}
                modalTitle="修改画布预设"
                showTitleField={false}
                okText="保存预设"
                helperText="预设会更新这个画布后续生成配置节点和视频生成的默认值；不会改动已经生成的节点。"
                onCancel={() => setEditingCanvasPresetId("")}
                onCreate={saveCanvasPreset}
            />
        </main>
    );
}
