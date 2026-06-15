"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Empty, Form, Input, Modal, Spin } from "antd";

import { useAssetStore } from "@/stores/use-asset-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasCreateProjectModal } from "../../canvas/components/canvas-create-project-modal";
import { useGenerationQueueStore } from "../../canvas/stores/use-generation-queue-store";
import { useCanvasStore } from "../../canvas/stores/use-canvas-store";
import { useProductionBibleStore } from "../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../canvas/stores/use-storyboard-store";
import { buildImportedEpisodeWriteInput, canvasEpisodeContextFromCreateBinding, type CanvasCreateScriptBinding } from "../../canvas/utils/canvas-episode-context";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../../canvas/utils/canvas-project-preset";
import { videoWorkflowEpisodeKey, videoWorkflowHref, videoWorkflowProjectSlug } from "../../original-workflow/video-workflow-routing";
import { canvasIdsForCreativeProject, unfiledCanvasProjects } from "../creative-projects";
import { editableCanvasPreset } from "../project-canvas-preset";
import { collectProjectAssetReferences, filterProjectAssetReferences, type ProjectAssetReferenceFilters } from "../project-asset-references";
import { buildProjectOverviewDashboard, type ProjectOverviewActionTarget } from "../project-overview-dashboard";
import { useAgentTaskStore } from "../use-agent-task-store";
import { useCreativeProjectStore } from "../use-creative-project-store";
import { ProjectEpisodeBoard, type ProjectDetailTab, type ProjectEpisodeBoardRow } from "./components/project-episode-board";

type EpisodeImportFormValues = {
    title: string;
    scriptText: string;
};

export default function CreativeProjectDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { message } = App.useApp();
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
    const assets = useAssetStore((state) => state.assets);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const generationQueueItems = useGenerationQueueStore((state) => state.items);
    const agentTasks = useAgentTaskStore((state) => state.tasks);
    const scriptProjects = useScriptStore((state) => state.projects);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
    const upsertScriptProject = useScriptStore((state) => state.upsertProject);
    const addEpisode = useScriptStore((state) => state.addEpisode);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const [activeTab, setActiveTab] = useState<ProjectDetailTab>("overview");
    const [assetReferenceFilters, setAssetReferenceFilters] = useState<ProjectAssetReferenceFilters>({ assetKind: "all", fileStatus: "all", projectLibraryStatus: "all", referenceType: "all", versionStatus: "all" });
    const [canvasCreateOpen, setCanvasCreateOpen] = useState(false);
    const [episodeImportOpen, setEpisodeImportOpen] = useState(false);
    const [projectEditOpen, setProjectEditOpen] = useState(false);
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
                const hasScript = Boolean(episode.summary.trim());
                const stage = !hasScript ? "未开始" : shotCount ? (shotCount > 0 && videoCount >= shotCount ? "成片" : "分镜") : "剧本";
                const progress = stage === "成片" ? 100 : stage === "分镜" ? Math.max(42, Math.min(92, videoCount ? Math.round((videoCount / Math.max(shotCount, 1)) * 100) : 62)) : stage === "剧本" ? 8 : 0;
                const status = progress >= 100 ? "已完成" : stage === "分镜" ? "进行中" : "草稿";
                return {
                    id: episode.id,
                    actionLabel: status === "已完成" ? "查看" : "进入",
                    canvasCount: episodeCanvases.length,
                    filterStatus: status === "已完成" ? "done" : status === "进行中" ? "running" : "draft",
                    order: episode.order,
                    progress,
                    shotText: shotCount ? (stage === "分镜" && videoCount ? `${videoCount} / ${shotCount}` : String(shotCount)) : "-",
                    stage,
                    status,
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
    const overviewDashboard = useMemo(
        () =>
            buildProjectOverviewDashboard({
                projectId,
                canvasCount: projectCanvases.length,
                scripts: scriptProjects,
                episodes,
                scenes,
                storyboardGroups,
                storyboardShots,
                storyboardTableShots,
                shotGroups,
                productionBibleItems,
                generationQueueItems,
                assets,
                assetReferenceRows,
                agentTasks,
            }),
        [agentTasks, assetReferenceRows, assets, episodes, generationQueueItems, productionBibleItems, projectCanvases.length, projectId, scenes, scriptProjects, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots],
    );

    useEffect(() => {
        if (!episodeImportOpen) return;
        episodeImportForm.setFieldsValue({ title: `第 ${projectEpisodes.length + 1} 集`, scriptText: "" });
    }, [episodeImportForm, episodeImportOpen, projectEpisodes.length]);

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
                        <Button href="/projects">返回项目工作台</Button>
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

    const importEpisodeAndOpen = async () => {
        const values = await episodeImportForm.validateFields();
        const scriptText = values.scriptText.trim();
        const title = values.title.trim() || `第 ${projectEpisodes.length + 1} 集`;
        if (!scriptText) return message.warning("请粘贴本集剧本");
        upsertScriptProject(project.id, scriptText);
        const order = projectEpisodes.length + 1;
        const episodeId = addEpisode({ projectId: project.id, order, title, summary: scriptText, hook: "", turningPoint: "", cliffhanger: "" });
        try {
            await syncVideoWorkflowScript(order, scriptText);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "同步视频工作流剧本失败");
            return;
        }
        setEpisodeImportOpen(false);
        episodeImportForm.resetFields();
        message.success("已导入本集剧本");
        router.push(videoWorkflowHref(order, project.id, episodeId));
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

    const openEpisodeWorkflow = async (episodeId: string) => {
        const episode = projectEpisodes.find((item) => item.id === episodeId);
        if (!episode) return;
        try {
            await syncVideoWorkflowScript(episode.order, episode.summary);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "同步视频工作流剧本失败");
            return;
        }
        router.push(videoWorkflowHref(episode.order, project.id, episode.id));
    };

    const syncVideoWorkflowScript = async (order: number, content: string) => {
        const episode = videoWorkflowEpisodeKey(order, project.id);
        const response = await fetch("/api/original-workflow", {
            body: JSON.stringify({ action: "save-script", content, episode, projectSlug: videoWorkflowProjectSlug(project.id) }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        });
        if (!response.ok) throw new Error("同步视频工作流剧本失败");
    };

    const openEpisodeWorkbench = (module: "assets" | "storyboard") => {
        if (!currentEpisode) {
            setActiveTab("episodes");
            return;
        }
        router.push(`/projects/${project.id}/episodes/${currentEpisode.id}/workbench?module=${module}`);
    };

    const handleOverviewAction = (target: ProjectOverviewActionTarget) => {
        if (target.type === "tab") {
            setActiveTab(target.tab);
            return;
        }
        if (target.type === "asset-references") {
            setAssetReferenceFilters({
                assetKind: "all",
                fileStatus: target.missingOnly ? "missing" : "all",
                projectLibraryStatus: "all",
                referenceType: "all",
                versionStatus: target.versionStatus || "all",
            });
            setActiveTab("asset-references");
            return;
        }
        if (target.type === "assets-page") {
            router.push(`/assets?projectId=${encodeURIComponent(project.id)}&returnTo=${encodeURIComponent(`/projects/${project.id}`)}&returnLabel=${encodeURIComponent("返回项目")}`);
            return;
        }
        if (target.type === "agent") {
            router.push(`/projects/${project.id}/agents`);
            return;
        }
        if (target.type === "production-bible") {
            openEpisodeWorkbench("assets");
            return;
        }
        if (target.type === "storyboard") {
            openEpisodeWorkbench("storyboard");
            return;
        }
        if (target.type === "primary-canvas") {
            if (currentEpisode?.primaryCanvasId) {
                router.push(`/canvas/${currentEpisode.primaryCanvasId}`);
                return;
            }
            if (currentEpisode) {
                void openEpisodeWorkflow(currentEpisode.id);
                return;
            }
            setEpisodeImportOpen(true);
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
                overview={overviewDashboard}
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
                onOpenCanvasById={(canvasId) => router.push(`/canvas/${canvasId}`)}
                onOpenEpisode={openEpisodeWorkflow}
                onOverviewAction={handleOverviewAction}
                onTabChange={setActiveTab}
            />

            <Modal className="studio-modal" title="编辑项目" open={projectEditOpen} onCancel={() => setProjectEditOpen(false)} onOk={saveProjectEdit} okText="保存" cancelText="取消" destroyOnHidden>
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
            <Modal className="studio-modal" title="修改分集标题" open={Boolean(editingEpisodeTitle)} onCancel={closeEpisodeTitleEdit} onOk={saveEpisodeTitleEdit} okText="保存" cancelText="取消" destroyOnHidden>
                <label className="grid gap-2">
                    <span className="text-sm text-[var(--studio-text-secondary)]">标题</span>
                    <Input value={episodeTitleDraft} placeholder="例如：第 147 集" maxLength={80} showCount onChange={(event) => setEpisodeTitleDraft(event.target.value)} onPressEnter={saveEpisodeTitleEdit} />
                </label>
            </Modal>
            <Modal className="studio-modal" title="导入本集剧本" open={episodeImportOpen} onCancel={() => setEpisodeImportOpen(false)} onOk={() => void importEpisodeAndOpen()} okText="导入并进入视频工作流" cancelText="取消" destroyOnHidden>
                <Form form={episodeImportForm} layout="vertical" initialValues={{ title: `第 ${projectEpisodes.length + 1} 集`, scriptText: "" }} requiredMark={false}>
                    <Form.Item name="title" label="本集标题" rules={[{ required: true, message: "请填写本集标题" }]}>
                        <Input placeholder="例如：第一集" />
                    </Form.Item>
                    <Form.Item name="scriptText" label="本集剧本" rules={[{ required: true, message: "请粘贴本集剧本" }]}>
                        <Input.TextArea rows={10} placeholder="先导入剧本并进入视频工作流；画布会在最后写入结果时再创建或绑定。" />
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
