"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Empty, Form, Input, Modal, Select, Spin } from "antd";
import { Wand2 } from "lucide-react";

import { confirmAgentPlan, continueAgentPlan, createAgentPlan, preflightAgentPlan } from "@/services/api/agent-plans";
import { createArtifact, getInvocation, reviewInvocation } from "@/services/api/invocations";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasCreateProjectModal } from "../../canvas/components/canvas-create-project-modal";
import { useCanvasStore } from "../../canvas/stores/use-canvas-store";
import { useScriptStore } from "../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../canvas/stores/use-storyboard-store";
import { buildImportedEpisodeWriteInput, canvasEpisodeContextFromCreateBinding, type CanvasCreateScriptBinding } from "../../canvas/utils/canvas-episode-context";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../../canvas/utils/canvas-project-preset";
import type { StructuredEpisodeScript } from "../../canvas/utils/script-management";
import { useOriginalWorkflowStore } from "../../original-workflow/use-original-workflow-store";
import { videoWorkflowEpisodeKey, videoWorkflowHref, videoWorkflowProjectSlug } from "../../original-workflow/video-workflow-routing";
import { canvasIdsForCreativeProject, unfiledCanvasProjects } from "../creative-projects";
import { editableCanvasPreset } from "../project-canvas-preset";
import { approveScriptAgentResult, assertScriptReviewMatches, executeScriptAgentToReview, preflightScriptAgent, type ScriptAgentReviewResult } from "../script-agent-runtime";
import { buildScriptSkillOverride } from "../script-skill-selection";
import { useCreativeProjectStore } from "../use-creative-project-store";
import { ProjectEpisodeBoard, type ProjectDetailTab, type ProjectEpisodeBoardRow } from "./components/project-episode-board";
import { buildOriginalScriptEditPatch } from "./project-episode-script-edit";
import { useScriptSkillSelection } from "./use-script-skill-selection";

type EpisodeImportFormValues = {
    title: string;
    scriptText: string;
};

type OptimizedImportDraft = {
    sourceScript: string;
    structuredScript?: StructuredEpisodeScript;
    review?: ScriptAgentReviewResult;
};

export default function CreativeProjectDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { message, modal } = App.useApp();
    const [episodeImportForm] = Form.useForm<EpisodeImportFormValues>();
    const effectiveConfig = useEffectiveConfig();
    const projectId = params.id;
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const updateCreativeProject = useCreativeProjectStore((state) => state.updateProject);
    const attachCanvas = useCreativeProjectStore((state) => state.attachCanvas);
    const canvases = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const updateCanvas = useCanvasStore((state) => state.updateProject);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
    const upsertScriptProject = useScriptStore((state) => state.upsertProject);
    const addEpisode = useScriptStore((state) => state.addEpisode);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const [activeTab, setActiveTab] = useState<ProjectDetailTab>("episodes");
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
    const storyboardTableShots = useStoryboardStore((state) => state.tableShots);
    const shotGroups = useStoryboardStore((state) => state.shotGroups);
    const workflowExecutionMode = useOriginalWorkflowStore((state) => state.executionMode);
    const workflowRootPath = useOriginalWorkflowStore((state) => state.rootPath);
    const canvasIds = useMemo(() => (project ? canvasIdsForCreativeProject(project, canvases) : []), [canvases, project]);
    const projectCanvases = useMemo(() => canvases.filter((canvas) => canvasIds.includes(canvas.id)), [canvasIds, canvases]);
    const projectEpisodes = useMemo(() => episodes.filter((episode) => episode.projectId === projectId).sort((a, b) => a.order - b.order), [episodes, projectId]);
    const scriptSkills = useScriptSkillSelection(projectId, projectEpisodes.map((episode) => episode.id));
    const editingEpisodeTitle = useMemo(() => projectEpisodes.find((episode) => episode.id === editingEpisodeTitleId), [editingEpisodeTitleId, projectEpisodes]);
    const editingCanvasPreset = useMemo(() => projectCanvases.find((canvas) => canvas.id === editingCanvasPresetId), [editingCanvasPresetId, projectCanvases]);
    const unboundCanvases = useMemo(() => unfiledCanvasProjects(canvases, project ? [project] : []), [canvases, project]);
    useEffect(() => {
        setDescriptionDraft(project?.description || "");
        setTitleDraft(project?.title || "");
    }, [project?.description, project?.title]);
    useEffect(() => {
        if (scriptSkills.error) message.error(scriptSkills.error.message);
    }, [message, scriptSkills.error]);
    useEffect(() => {
        if (!scriptSkills.selectionNotice) return;
        message.warning(scriptSkills.selectionNotice);
        scriptSkills.clearSelectionNotice();
    }, [message, scriptSkills]);

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
    const projectProgress = useMemo(() => {
        if (!episodeRows.length) return 0;
        return Math.round(episodeRows.reduce((total, row) => total + row.progress, 0) / episodeRows.length);
    }, [episodeRows]);
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

    const runScriptAgentToReview = async (input: { episodeId?: string; episodeTitle: string; sourceScript: string; skillVersionId: string }) => {
        if (!scriptSkills.agent || !scriptSkills.agentPackage) throw new Error("系统剧本制作 Agent 尚未准备完成");
        const skillOverrides = buildScriptSkillOverride(scriptSkills.agentPackage, scriptSkills.options, input.skillVersionId);
        const prepared = await preflightScriptAgent(
            {
                createArtifact: (artifactInput) => createArtifact(artifactInput as Parameters<typeof createArtifact>[0]),
                createAgentPlan: (planInput) => createAgentPlan(planInput as Parameters<typeof createAgentPlan>[0]),
                preflightAgentPlan,
            },
            { projectId: project.id, episodeId: input.episodeId, episodeTitle: input.episodeTitle, sourceText: input.sourceScript, agent: scriptSkills.agent, skillOverrides, idempotencyKey: globalThis.crypto.randomUUID() },
        );
        const confirmed = await new Promise<boolean>((resolve) => {
            modal.confirm({
                title: "确认运行剧本制作 Agent？",
                content: (
                    <div className="space-y-2 text-sm">
                        <div>
                            将冻结 <code>{prepared.preflight.plan.id}</code> 的 Agent / Skill 精确版本，预计上限 {prepared.preflight.plan.estimatedCredits} Credits。
                        </div>
                        <div>{prepared.preflight.confirmationRequirements.map((item) => item.message).join("；") || "本次无额外确认项"}</div>
                        <div className="text-[var(--studio-text-muted)]">执行完成后只生成待审核 Artifact，不会自动写入分集。</div>
                    </div>
                ),
                okText: "确认执行",
                cancelText: "取消",
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });
        if (!confirmed) return undefined;
        return executeScriptAgentToReview({ confirmAgentPlan, continueAgentPlan, getInvocation }, prepared.preflight);
    };

    const approveScriptResult = (review: ScriptAgentReviewResult) => approveScriptAgentResult({ reviewInvocation, continueAgentPlan }, review);

    const confirmExistingEpisodeResult = (productionScript: string) =>
        new Promise<boolean>((resolve) => {
            modal.confirm({
                title: "批准并写入这版生产剧本？",
                content: <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-[var(--studio-panel-muted-bg)] p-3 text-xs leading-6">{productionScript}</pre>,
                width: 760,
                okText: "批准并写入",
                cancelText: "保留待审核",
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });

    const approveImportDraft = async (scriptText: string) => {
        if (!optimizedImportDraft?.review) return;
        assertScriptReviewMatches(scriptText, optimizedImportDraft.review);
        await approveScriptResult(optimizedImportDraft.review);
    };

    const importEpisode = async () => {
        const values = await episodeImportForm.validateFields();
        const scriptText = values.scriptText.trim();
        const title = values.title.trim();
        if (!scriptText) return message.warning("请粘贴本集剧本");
        setEpisodeImporting(true);
        try {
            await approveImportDraft(scriptText);
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
        setScriptOptimizing(true);
        try {
            const result = await runScriptAgentToReview({ episodeTitle: title, sourceScript, skillVersionId: scriptSkills.importVersionId });
            if (!result) return;
            episodeImportForm.setFieldValue("scriptText", result.productionScript);
            setOptimizedImportDraft({ sourceScript, review: result });
            message.success("已生成待审核的 production_script Artifact，请检查后导入。");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "剧本 AI 适配失败";
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

    const optimizeExistingEpisodeScript = async (episodeId: string, skillVersionId: string) => {
        const episode = projectEpisodes.find((item) => item.id === episodeId);
        if (!episode) return;
        const sourceScript = episode.sourceSummary?.trim() || episode.summary.trim();
        if (!sourceScript) return message.warning("当前分集还没有剧本");
        setOptimizingEpisodeId(episode.id);
        setScriptOptimizeErrors((state) => ({ ...state, [episode.id]: "" }));
        try {
            const result = await runScriptAgentToReview({ episodeId: episode.id, episodeTitle: episode.title, sourceScript, skillVersionId });
            if (!result || !(await confirmExistingEpisodeResult(result.productionScript))) return;
            await approveScriptResult(result);
            await syncVideoWorkflowScript(episode.order, result.productionScript);
            updateEpisode(episode.id, { summary: result.productionScript, sourceSummary: episode.sourceSummary || sourceScript, structuredScript: undefined });
            setScriptOptimizeErrors((state) => ({ ...state, [episode.id]: "" }));
            message.success("已批准并写入本集生产剧本。");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "剧本优化失败";
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
                currentEpisode={currentEpisode}
                counts={episodeCounts}
                description={project.description}
                episodeFilter={episodeFilter}
                filteredRows={filteredEpisodeRows}
                progress={projectProgress}
                canvases={projectCanvases}
                unboundCanvases={unboundCanvases}
                bindingCanvasId={bindingCanvasId}
                projectTitle={project.title}
                presetSummary={canvasProjectPresetSummary(project.preset)}
                rows={episodeRows}
                scriptSkillOptions={scriptSkills.options.map((option) => ({ value: option.skillVersionId, label: `${option.skillName} · v${option.version}` }))}
                scriptSkillVersionIds={scriptSkills.episodeVersionIds}
                scriptSkillsLoading={scriptSkills.loading}
                onBindCanvas={bindCanvas}
                onBindingCanvasChange={setBindingCanvasId}
                onCreateCanvas={() => setCanvasCreateOpen(true)}
                onEditCanvasPreset={setEditingCanvasPresetId}
                onEditEpisodeTitle={openEpisodeTitleEdit}
                onOpenAgentSettings={() => router.push(`/projects/${project.id}/agents`)}
                onOpenWorkflowCenter={() => router.push(`/projects/${project.id}/workflows`)}
                onEditProject={() => setProjectEditOpen(true)}
                onFilterChange={setEpisodeFilter}
                onImportEpisode={() => setEpisodeImportOpen(true)}
                onClearOptimizedScript={clearEpisodeOptimizedScript}
                onOptimizeEpisodeScript={(episodeId, skillVersionId) => void optimizeExistingEpisodeScript(episodeId, skillVersionId)}
                onScriptSkillChange={scriptSkills.setEpisodeVersionId}
                onOpenEpisode={openEpisodeWorkflow}
                onSaveEpisodeScript={saveEpisodeScript}
                onTabChange={setActiveTab}
                optimizingEpisodeId={optimizingEpisodeId}
                scriptOptimizeErrors={scriptOptimizeErrors}
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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Select aria-label="导入剧本优化 Skill" size="small" loading={scriptSkills.loading} value={scriptSkills.importVersionId || undefined} options={scriptSkills.options.map((option) => ({ value: option.skillVersionId, label: `${option.skillName} · v${option.version}` }))} placeholder="选择 Skill 版本" className="min-w-44" onChange={scriptSkills.setImportVersionId} />
                            <Button size="small" icon={<Wand2 className="size-3.5" />} loading={scriptOptimizing} disabled={!scriptSkills.importVersionId} onClick={() => void optimizeEpisodeImportScript()}>
                                运行系统剧本制作 Agent
                            </Button>
                        </div>
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
