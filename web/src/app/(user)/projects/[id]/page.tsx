"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Drawer, Empty, Form, Input, Modal, Select, Tag } from "antd";
import { AlertTriangle, Bot, Clapperboard, ExternalLink, Library, ListVideo, Maximize2, Plus, ScrollText, Save, Workflow } from "lucide-react";

import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { AssetBreakdownDrawer } from "../../canvas/components/asset-breakdown-drawer";
import { CanvasCreateProjectModal } from "../../canvas/components/canvas-create-project-modal";
import { ImageBriefWorkbenchDrawer } from "../../canvas/components/image-brief-workbench-drawer";
import { ProductionBibleDrawer } from "../../canvas/components/production-bible-drawer";
import { StoryboardManagerDrawer } from "../../canvas/components/storyboard-manager-drawer";
import { useCanvasStore, type CanvasProject } from "../../canvas/stores/use-canvas-store";
import { useGenerationQueueStore } from "../../canvas/stores/use-generation-queue-store";
import { useProductionBibleStore } from "../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../canvas/stores/use-storyboard-store";
import { canvasEpisodeLabel } from "../../canvas/utils/canvas-episode-context";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../../canvas/utils/canvas-project-preset";
import { buildImageBriefImageConfigNode, type ImageBrief } from "../../canvas/utils/image-brief";
import { productionBibleKindLabel, type ProductionBibleKind } from "../../canvas/utils/production-bible";
import { assetKindLabel } from "../../assets/asset-utils";
import { canvasIdsForCreativeProject, unfiledCanvasProjects } from "../creative-projects";
import { collectProjectAssetReferences, filterProjectAssetReferences, type ProjectAssetLibraryFilter, type ProjectAssetReferenceSummary, type ProjectAssetReferenceType, type ProjectAssetVersionFilter } from "../project-asset-references";
import { buildProjectOverviewDashboard, projectOverviewActionHref, type ProjectOverviewActionTarget, type ProjectOverviewDashboard } from "../project-overview-dashboard";
import { editableCanvasPreset } from "../project-canvas-preset";
import { agentKindLabel, agentRiskLabel } from "../agent-workbench";
import { useAgentTaskStore } from "../use-agent-task-store";
import { useCreativeProjectStore } from "../use-creative-project-store";

type EpisodeImportFormValues = {
    title: string;
    scriptText: string;
};

type ProjectEpisodeBoardRow = {
    actionLabel: string;
    canvasCount: number;
    filterStatus: "done" | "draft" | "running";
    id: string;
    order: number;
    progress: number;
    shotText: string;
    stage: "分镜" | "剧本" | "成片" | "未开始";
    status: "已完成" | "草稿" | "进行中";
    title: string;
    updatedAt: string;
    videoCount: number;
    primaryCanvasId?: string;
};

export default function CreativeProjectDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { message } = App.useApp();
    const [episodeImportForm] = Form.useForm<EpisodeImportFormValues>();
    const effectiveConfig = useEffectiveConfig();
    const projectId = params.id;
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const updateCreativeProject = useCreativeProjectStore((state) => state.updateProject);
    const attachCanvas = useCreativeProjectStore((state) => state.attachCanvas);
    const canvases = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const updateCanvas = useCanvasStore((state) => state.updateProject);
    const scripts = useScriptStore((state) => state.projects);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const upsertScriptProject = useScriptStore((state) => state.upsertProject);
    const addEpisode = useScriptStore((state) => state.addEpisode);
    const storyboardGroups = useStoryboardStore((state) => state.groups);
    const storyboardShots = useStoryboardStore((state) => state.shots);
    const bibleItems = useProductionBibleStore((state) => state.items);
    const queueItems = useGenerationQueueStore((state) => state.items);
    const assets = useAssetStore((state) => state.assets);
    const agentTasks = useAgentTaskStore((state) => state.tasks);
    const [activeTab, setActiveTab] = useState("episodes");
    const [episodeImportOpen, setEpisodeImportOpen] = useState(false);
    const [projectEditOpen, setProjectEditOpen] = useState(false);
    const [editingCanvasPresetId, setEditingCanvasPresetId] = useState("");
    const [titleDraft, setTitleDraft] = useState(project?.title || "");
    const [descriptionDraft, setDescriptionDraft] = useState(project?.description || "");
    const [episodeFilter, setEpisodeFilter] = useState<"all" | "done" | "draft" | "running">("all");
    const [bindingCanvasId, setBindingCanvasId] = useState("");
    const [assetKindFilter, _setAssetKindFilter] = useState<AssetKind | "all">("all");
    const [referenceTypeFilter, _setReferenceTypeFilter] = useState<ProjectAssetReferenceType | "all">("all");
    const [versionStatusFilter, setVersionStatusFilter] = useState<ProjectAssetVersionFilter>("all");
    const [assetLibraryFilter, _setAssetLibraryFilter] = useState<ProjectAssetLibraryFilter>("all");
    const [_missingOnlyFilter, setMissingOnlyFilter] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [storyboardOpen, setStoryboardOpen] = useState(false);
    const [storyboardInitialGroupId, setStoryboardInitialGroupId] = useState("");
    const [assetBreakdownOpen, setAssetBreakdownOpen] = useState(false);
    const [imageBriefOpen, setImageBriefOpen] = useState(false);
    const [productionBibleOpen, setProductionBibleOpen] = useState(false);
    const [productionBibleInitialKind, setProductionBibleInitialKind] = useState<ProductionBibleKind | undefined>();
    const storyboardTableShots = useStoryboardStore((state) => state.tableShots);
    const shotGroups = useStoryboardStore((state) => state.shotGroups);
    const canvasIds = useMemo(() => (project ? canvasIdsForCreativeProject(project, canvases) : []), [canvases, project]);
    const projectCanvases = useMemo(() => canvases.filter((canvas) => canvasIds.includes(canvas.id)), [canvasIds, canvases]);
    const projectEpisodes = useMemo(() => episodes.filter((episode) => episode.projectId === projectId).sort((a, b) => a.order - b.order), [episodes, projectId]);
    const editingCanvasPreset = useMemo(() => projectCanvases.find((canvas) => canvas.id === editingCanvasPresetId), [editingCanvasPresetId, projectCanvases]);
    const unboundCanvases = useMemo(() => unfiledCanvasProjects(canvases, project ? [project] : []), [canvases, project]);
    const assetReferenceRows = useMemo(
        () =>
            project
                ? collectProjectAssetReferences({
                      assets,
                      projectId: project.id,
                      projectTitle: project.title,
                      canvasIds,
                      canvasProjects: canvases,
                      storyboardGroups,
                      storyboardShots,
                      productionBibleItems: bibleItems,
                  })
                : [],
        [assets, bibleItems, canvasIds, canvases, project, storyboardGroups, storyboardShots],
    );
    const _overviewDashboard = useMemo(
        () =>
            project
                ? buildProjectOverviewDashboard({
                      projectId: project.id,
                      canvasCount: projectCanvases.length,
                      scripts,
                      episodes,
                      scenes,
                      storyboardGroups,
                      storyboardShots,
                      productionBibleItems: bibleItems,
                      generationQueueItems: queueItems,
                      assets,
                      assetReferenceRows,
                      agentTasks,
                  })
                : null,
        [agentTasks, assetReferenceRows, assets, bibleItems, episodes, project, projectCanvases.length, queueItems, scenes, scripts, storyboardGroups, storyboardShots],
    );
    const _filteredAssetReferenceRows = useMemo(
        () =>
            filterProjectAssetReferences(assetReferenceRows, {
                assetKind: assetKindFilter,
                referenceType: referenceTypeFilter,
                versionStatus: versionStatusFilter,
                projectLibraryStatus: assetLibraryFilter,
            }),
        [assetKindFilter, assetLibraryFilter, assetReferenceRows, referenceTypeFilter, versionStatusFilter],
    );
    const _missingMaterialItems = useMemo(() => {
        if (!project) return [];
        const projectGroups = storyboardGroups.filter((group) => group.projectId === project.id);
        const groupIds = new Set(projectGroups.map((group) => group.id));
        const projectShots = storyboardShots.filter((shot) => groupIds.has(shot.groupId));
        const groupsById = new Map(projectGroups.map((group) => [group.id, group]));
        const missingBibleItems = bibleItems
            .filter((item) => item.projectId === project.id && !item.assetRefs.length)
            .map(
                (item): ProjectMissingMaterialItem => ({
                    id: `bible:${item.id}`,
                    sourceLabel: "设定库",
                    title: `${productionBibleKindLabel(item.kind)} · ${item.name}`,
                    description: "还没有绑定参考素材。",
                    actionLabel: "打开设定库",
                    action: { type: "production-bible", kind: item.kind },
                }),
            );
        const missingShotItems = projectShots
            .filter((shot) => !shot.assetRefs.length)
            .map(
                (shot): ProjectMissingMaterialItem => ({
                    id: `shot:${shot.id}`,
                    sourceLabel: "分镜",
                    title: shot.title || `分镜 ${shot.order}`,
                    description: `${groupsById.get(shot.groupId)?.title || "未命名分镜组"} 没有绑定参考素材。`,
                    actionLabel: "打开分镜",
                    action: { type: "storyboard", groupId: shot.groupId, shotId: shot.id },
                }),
            );
        const missingFileItems = assetReferenceRows
            .filter((row) => row.hasMissingLocalFile)
            .map(
                (row): ProjectMissingMaterialItem => ({
                    id: `asset-file:${row.asset.id}`,
                    sourceLabel: "本地文件",
                    title: row.asset.title || "未命名素材",
                    description: "素材记录存在，但本地文件或 dataUrl 缺失。",
                    actionLabel: "素材详情",
                    action: { type: "asset", asset: row.asset },
                }),
            );
        return [...missingBibleItems, ...missingShotItems, ...missingFileItems];
    }, [assetReferenceRows, bibleItems, project, storyboardGroups, storyboardShots]);
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

    useEffect(() => {
        if (!episodeImportOpen) return;
        episodeImportForm.setFieldsValue({ title: `第 ${projectEpisodes.length + 1} 集`, scriptText: "" });
    }, [episodeImportForm, episodeImportOpen, projectEpisodes.length]);

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

    const _saveDescription = () => {
        updateCreativeProject(project.id, { description: descriptionDraft });
        message.success("项目说明已保存");
    };

    const saveProjectEdit = () => {
        updateCreativeProject(project.id, { title: titleDraft, description: descriptionDraft });
        setProjectEditOpen(false);
        message.success("项目信息已保存");
    };

    const importEpisodeAndOpen = async () => {
        const values = await episodeImportForm.validateFields();
        const scriptText = values.scriptText.trim();
        const title = values.title.trim() || `第 ${projectEpisodes.length + 1} 集`;
        if (!scriptText) return message.warning("请粘贴本集剧本");
        upsertScriptProject(project.id, scriptText);
        const episodeId = addEpisode({ projectId: project.id, order: projectEpisodes.length + 1, title, summary: scriptText, hook: "", turningPoint: "", cliffhanger: "" });
        setEpisodeImportOpen(false);
        episodeImportForm.resetFields();
        message.success("已导入本集剧本");
        router.push(`/projects/${project.id}/episodes/${episodeId}/workbench`);
    };

    const createCanvasAndOpen = () => {
        const title = `${project.title} 画布 ${projectCanvases.length + 1}`;
        const canvasId = createCanvas(title, project.preset, { projectId: project.id });
        attachCanvas(project.id, canvasId);
        router.push(`/canvas/${canvasId}`);
    };

    const bindCanvas = () => {
        if (!bindingCanvasId) return;
        updateCanvas(bindingCanvasId, { projectId: project.id, preset: project.preset });
        attachCanvas(project.id, bindingCanvasId);
        setBindingCanvasId("");
        message.success("已绑定旧画布");
    };

    const openPrimaryCanvas = () => {
        const first = projectCanvases[0];
        if (first) router.push(`/canvas/${first.id}`);
        else createCanvasAndOpen();
    };

    const saveCanvasPreset = (_title: string, preset: CanvasProjectPreset) => {
        if (!editingCanvasPreset) return;
        updateCanvas(editingCanvasPreset.id, { preset });
        setEditingCanvasPresetId("");
        message.success("画布预设已保存");
    };

    const createBriefImageConfigNode = (brief: ImageBrief, targetCanvasId?: string) => {
        const canvas = projectCanvases.find((item) => item.id === targetCanvasId) || projectCanvases[0];
        if (!canvas) {
            message.warning("当前项目还没有可写入的画布");
            return;
        }
        const index = canvas.nodes.length;
        const node = buildImageBriefImageConfigNode({
            brief,
            config: effectiveConfig,
            position: { x: 160 + (index % 4) * 380, y: 160 + Math.floor(index / 4) * 280 },
        });
        updateCanvas(canvas.id, { nodes: [...canvas.nodes, node] });
    };

    const openStoryboardReference = (groupId?: string, shotId?: string) => {
        const group = groupId ? storyboardGroups.find((item) => item.id === groupId) : storyboardGroups.find((item) => item.id === storyboardShots.find((shot) => shot.id === shotId)?.groupId);
        setStoryboardInitialGroupId(group?.id || "");
        setStoryboardOpen(true);
    };

    const openProductionBibleReference = (kind?: ProductionBibleKind) => {
        setProductionBibleInitialKind(kind);
        setProductionBibleOpen(true);
    };

    const _runOverviewAction = (target: ProjectOverviewActionTarget) => {
        const href = projectOverviewActionHref(project.id, target);
        if (href) {
            router.push(href);
            return;
        }
        if (target.type === "tab") {
            setActiveTab(target.tab);
            return;
        }
        if (target.type === "asset-references") {
            setActiveTab("asset-references");
            setMissingOnlyFilter(Boolean(target.missingOnly));
            if (target.versionStatus === "outdated") setVersionStatusFilter("outdated");
            return;
        }
        if (target.type === "storyboard") {
            setActiveTab("workflow");
            openStoryboardReference(target.groupId);
            return;
        }
        if (target.type === "production-bible") {
            setActiveTab("workflow");
            openProductionBibleReference();
            return;
        }
        if (target.type === "primary-canvas") openPrimaryCanvas();
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
                onBindCanvas={bindCanvas}
                onBindingCanvasChange={setBindingCanvasId}
                onCreateCanvas={createCanvasAndOpen}
                onEditCanvasPreset={setEditingCanvasPresetId}
                onEditProject={() => setProjectEditOpen(true)}
                onFilterChange={setEpisodeFilter}
                onImportEpisode={() => setEpisodeImportOpen(true)}
                onOpenCanvasById={(canvasId) => router.push(`/canvas/${canvasId}`)}
                onOpenEpisode={(episodeId) => router.push(`/projects/${project.id}/episodes/${episodeId}/workbench`)}
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
            <Modal className="studio-modal" title="导入本集剧本" open={episodeImportOpen} onCancel={() => setEpisodeImportOpen(false)} onOk={() => void importEpisodeAndOpen()} okText="导入并进入生产流程" cancelText="取消" destroyOnHidden>
                <Form form={episodeImportForm} layout="vertical" initialValues={{ title: `第 ${projectEpisodes.length + 1} 集`, scriptText: "" }} requiredMark={false}>
                    <Form.Item name="title" label="本集标题" rules={[{ required: true, message: "请填写本集标题" }]}>
                        <Input placeholder="例如：第一集" />
                    </Form.Item>
                    <Form.Item name="scriptText" label="本集剧本" rules={[{ required: true, message: "请粘贴本集剧本" }]}>
                        <Input.TextArea rows={10} placeholder="先导入剧本并进入本集生产流程；画布会在最后写入结果时再创建或绑定。" />
                    </Form.Item>
                </Form>
            </Modal>
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
            <AssetReferenceDrawer asset={previewAsset} onClose={() => setPreviewAsset(null)} />
            <StoryboardManagerDrawer
                open={storyboardOpen}
                projectId={project.id}
                projectTitle={project.title}
                initialGroupId={storyboardInitialGroupId}
                canvases={projectCanvases}
                canvasNodes={projectCanvases.flatMap((canvas) => canvas.nodes)}
                onClose={() => setStoryboardOpen(false)}
                onAddGroupToCanvas={openPrimaryCanvas}
            />
            <AssetBreakdownDrawer open={assetBreakdownOpen} projectId={project.id} projectTitle={project.title} canvases={projectCanvases} onClose={() => setAssetBreakdownOpen(false)} />
            <ImageBriefWorkbenchDrawer
                open={imageBriefOpen}
                projectId={project.id}
                projectTitle={project.title}
                canvases={projectCanvases}
                onCreateImageConfig={createBriefImageConfigNode}
                onOpenAsset={setPreviewAsset}
                onClose={() => setImageBriefOpen(false)}
            />
            <ProductionBibleDrawer open={productionBibleOpen} projectId={project.id} projectTitle={project.title} canvases={projectCanvases} initialKind={productionBibleInitialKind} onClose={() => setProductionBibleOpen(false)} />
        </main>
    );
}

function ProjectEpisodeBoard({
    activeTab,
    currentEpisode,
    counts,
    description,
    episodeFilter,
    filteredRows,
    progress,
    canvases,
    unboundCanvases,
    bindingCanvasId,
    projectTitle,
    presetSummary,
    rows,
    onBindCanvas,
    onBindingCanvasChange,
    onCreateCanvas,
    onEditCanvasPreset,
    onEditProject,
    onFilterChange,
    onImportEpisode,
    onOpenCanvasById,
    onOpenEpisode,
    onTabChange,
}: {
    activeTab: string;
    currentEpisode?: ProjectEpisodeBoardRow;
    counts: { all: number; done: number; draft: number; running: number };
    description: string;
    episodeFilter: "all" | "done" | "draft" | "running";
    filteredRows: ProjectEpisodeBoardRow[];
    progress: number;
    canvases: CanvasProject[];
    unboundCanvases: CanvasProject[];
    bindingCanvasId: string;
    projectTitle: string;
    presetSummary: string;
    rows: ProjectEpisodeBoardRow[];
    onBindCanvas: () => void;
    onBindingCanvasChange: (canvasId: string) => void;
    onCreateCanvas: () => void;
    onEditCanvasPreset: (canvasId: string) => void;
    onEditProject: () => void;
    onFilterChange: (filter: "all" | "done" | "draft" | "running") => void;
    onImportEpisode: () => void;
    onOpenCanvasById: (canvasId: string) => void;
    onOpenEpisode: (episodeId: string) => void;
    onTabChange: (tab: string) => void;
}) {
    const currentText = currentEpisode ? `第 ${formatEpisodeOrder(currentEpisode.order)} 集 · ${currentEpisodeStatusText(currentEpisode)}` : "暂无分集";
    return (
        <div className="mx-auto min-h-full max-w-[1680px] rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)]">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--studio-border-subtle)] px-8 py-4">
                <nav className="flex flex-wrap items-center gap-4">
                    <ProjectDetailNavButton active={activeTab === "episodes"} label="分集" onClick={() => onTabChange("episodes")} />
                    <ProjectDetailNavButton active={activeTab === "canvas"} label="画布" onClick={() => onTabChange("canvas")} />
                </nav>

                <div className="flex min-w-0 flex-1 justify-center">
                    <div className="max-w-full rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-5 py-2 text-center text-base font-medium text-[var(--studio-text-secondary)]">
                        <span className="text-[var(--studio-text-muted)]">当前制作到</span>
                        <span className="ml-2 break-words text-[var(--studio-text-primary)]">{currentText}</span>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                    <Button className="h-11 px-5" onClick={onEditProject}>
                        编辑项目
                    </Button>
                    <Button type="primary" className="h-11 px-5" icon={<Plus className="size-4" />} onClick={onImportEpisode}>
                        新建分集
                    </Button>
                </div>
            </header>

            <section className="grid gap-5 px-8 py-6">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
                    <div className="min-w-0">
                        <Link href="/projects" className="text-base font-semibold leading-6 text-[var(--studio-accent)] hover:text-[var(--studio-accent-strong)]">
                            项目工作台 / {projectTitle}
                        </Link>
                        <h1 className="mt-2 break-words text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">{projectTitle}</h1>
                        <p className="mt-2 max-w-4xl whitespace-pre-wrap break-words text-base leading-6 text-[var(--studio-text-secondary)]">{description || presetSummary}</p>
                    </div>
                    <ProjectProgressCard counts={counts} currentEpisode={currentEpisode} progress={progress} total={rows.length} />
                </div>

                {activeTab === "canvas" ? (
                    <ProjectCanvasList
                        canvases={canvases}
                        unboundCanvases={unboundCanvases}
                        bindingCanvasId={bindingCanvasId}
                        onBindCanvas={onBindCanvas}
                        onBindingCanvasChange={onBindingCanvasChange}
                        onCreateCanvas={onCreateCanvas}
                        onEditCanvasPreset={onEditCanvasPreset}
                        onOpenCanvas={onOpenCanvasById}
                    />
                ) : (
                    <>
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <h2 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">分集列表</h2>
                            <div className="flex flex-wrap gap-3">
                                <EpisodeFilterButton active={episodeFilter === "all"} label="全部" onClick={() => onFilterChange("all")} />
                                <EpisodeFilterButton active={episodeFilter === "running"} label="进行中" onClick={() => onFilterChange("running")} />
                                <EpisodeFilterButton active={episodeFilter === "done"} label="已完成" onClick={() => onFilterChange("done")} />
                                <EpisodeFilterButton active={episodeFilter === "draft"} label="草稿" onClick={() => onFilterChange("draft")} />
                            </div>
                        </div>

                        {rows.length ? <ProjectEpisodeTable rows={filteredRows} onOpenCanvas={onOpenCanvasById} onOpenEpisode={onOpenEpisode} /> : <ProjectEpisodeEmpty onCreate={onImportEpisode} onCreateCanvas={onCreateCanvas} />}
                    </>
                )}
            </section>
        </div>
    );
}

function ProjectCanvasList({
    canvases,
    unboundCanvases,
    bindingCanvasId,
    onBindCanvas,
    onBindingCanvasChange,
    onCreateCanvas,
    onEditCanvasPreset,
    onOpenCanvas,
}: {
    canvases: CanvasProject[];
    unboundCanvases: CanvasProject[];
    bindingCanvasId: string;
    onBindCanvas: () => void;
    onBindingCanvasChange: (canvasId: string) => void;
    onCreateCanvas: () => void;
    onEditCanvasPreset: (canvasId: string) => void;
    onOpenCanvas: (canvasId: string) => void;
}) {
    return (
        <section className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">画布列表</h2>
                    <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">查看当前项目下已经创建和生成过的画布。</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    {unboundCanvases.length ? (
                        <div className="flex min-w-[320px] gap-2">
                            <Select className="min-w-0 flex-1" value={bindingCanvasId || undefined} placeholder="绑定旧画布" options={unboundCanvases.map((canvas) => ({ value: canvas.id, label: canvas.title }))} onChange={onBindingCanvasChange} />
                            <Button disabled={!bindingCanvasId} onClick={onBindCanvas}>
                                绑定
                            </Button>
                        </div>
                    ) : null}
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={onCreateCanvas}>
                        新建画布
                    </Button>
                </div>
            </div>

            {canvases.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {canvases.map((canvas) => (
                        <ProjectCanvasCard key={canvas.id} canvas={canvas} onEditPreset={onEditCanvasPreset} onOpen={onOpenCanvas} />
                    ))}
                </div>
            ) : (
                <section className="grid min-h-80 place-items-center rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-6 py-16 text-center">
                    <div>
                        <h3 className="text-2xl font-semibold text-[var(--studio-text-primary)]">这个项目还没有画布</h3>
                        <p className="mt-3 max-w-xl text-base leading-7 text-[var(--studio-text-secondary)]">新建画布后，它会显示在这里；从本集生产流程创建的承接画布也会自动归到当前项目。</p>
                        <Button className="mt-6" type="primary" icon={<Plus className="size-4" />} onClick={onCreateCanvas}>
                            新建画布
                        </Button>
                    </div>
                </section>
            )}
        </section>
    );
}

function ProjectCanvasCard({ canvas, onEditPreset, onOpen }: { canvas: CanvasProject; onEditPreset: (canvasId: string) => void; onOpen: (canvasId: string) => void }) {
    const videoCount = canvas.nodes.filter((node) => node.type === "video").length;
    const imageCount = canvas.nodes.filter((node) => node.type === "image").length;
    return (
        <article className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold leading-6 text-[var(--studio-text-primary)]">{canvas.title}</h3>
                    <p className="mt-1 text-sm text-[var(--studio-text-muted)]">{canvasEpisodeLabel(canvas)}</p>
                </div>
                <Tag className="studio-tag">{canvas.nodes.length} 节点</Tag>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <CanvasCardStat label="图片" value={imageCount} />
                <CanvasCardStat label="视频" value={videoCount} />
                <CanvasCardStat label="连线" value={canvas.connections.length} />
            </div>
            <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--studio-text-secondary)]">{canvasProjectPresetSummary(canvas.preset)}</p>
            <div className="mt-3 text-xs text-[var(--studio-text-muted)]">更新时间：{formatProjectDate(canvas.updatedAt)}</div>
            <div className="mt-4 flex justify-end gap-2">
                <Button size="small" onClick={() => onEditPreset(canvas.id)}>
                    修改预设
                </Button>
                <Button size="small" type="primary" icon={<Maximize2 className="size-3.5" />} onClick={() => onOpen(canvas.id)}>
                    进入画布
                </Button>
            </div>
        </article>
    );
}

function CanvasCardStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-2">
            <div className="text-xs text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-1 text-base font-semibold text-[var(--studio-text-primary)]">{value}</div>
        </div>
    );
}

function ProjectDetailNavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-base font-semibold transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] text-[var(--studio-text-primary)] shadow-[0_0_0_1px_rgba(111,168,255,0.12)]" : "border-transparent text-[var(--studio-text-muted)] hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text-primary)]"}`}
            onClick={onClick}
        >
            <span className={`size-4 rounded-sm border ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-text-muted)]"}`} />
            {label}
        </button>
    );
}

function ProjectProgressCard({ counts, currentEpisode, progress, total }: { counts: { done: number; draft: number; running: number }; currentEpisode?: ProjectEpisodeBoardRow; progress: number; total: number }) {
    return (
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 shadow-[var(--studio-shadow)]">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-[var(--studio-text-primary)]">整剧制作进度</h2>
                <div className="text-base font-semibold text-[var(--studio-accent)]">
                    第 {formatEpisodeOrder(currentEpisode?.order || 0)} / {String(total).padStart(2, "0")} 集
                </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[var(--studio-elevated-bg)]">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--studio-accent),var(--studio-success))]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm font-medium text-[var(--studio-text-muted)]">
                <span>已完成 {counts.done} 集</span>
                <span className="text-center">进行中 {counts.running} 集</span>
                <span className="text-right">草稿 {counts.draft} 集</span>
            </div>
        </section>
    );
}

function EpisodeFilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`h-9 rounded-md border px-4 text-sm font-medium transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-panel-bg)] text-[var(--studio-accent)] shadow-[inset_0_-2px_0_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] bg-transparent text-[var(--studio-text-secondary)] hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text-primary)]"}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function ProjectEpisodeTable({ rows, onOpenCanvas, onOpenEpisode }: { rows: ProjectEpisodeBoardRow[]; onOpenCanvas: (canvasId: string) => void; onOpenEpisode: (episodeId: string) => void }) {
    if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的分集" className="rounded-md border border-[var(--studio-border-subtle)] py-16 text-[var(--studio-text-muted)]" />;
    return (
        <section className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
            <div className="grid grid-cols-[90px_minmax(180px,1.5fr)_100px_90px_80px_80px_80px_170px_112px] items-center gap-4 border-b border-[var(--studio-border-subtle)] px-5 py-3 text-sm font-semibold text-[var(--studio-text-muted)]">
                <span>集数</span>
                <span>标题</span>
                <span>状态</span>
                <span>阶段</span>
                <span>镜头</span>
                <span>画布</span>
                <span>视频</span>
                <span>完成度</span>
                <span>操作</span>
            </div>
            <div className="divide-y divide-[var(--studio-border-subtle)]">
                {rows.map((row) => {
                    const primaryCanvasId = row.primaryCanvasId;
                    return (
                        <div
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            className={`grid w-full cursor-pointer grid-cols-[90px_minmax(180px,1.5fr)_100px_90px_80px_80px_80px_170px_112px] items-center gap-4 px-5 py-4 text-left transition hover:bg-[rgba(255,255,255,0.025)] ${row.filterStatus === "running" ? "border-l-4 border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] pl-4" : ""}`}
                            onClick={() => onOpenEpisode(row.id)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") onOpenEpisode(row.id);
                            }}
                        >
                            <span className="text-base font-semibold text-[var(--studio-text-muted)]">第 {formatEpisodeOrder(row.order)} 集</span>
                            <span className="min-w-0">
                                <span className="block break-words text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{row.title}</span>
                                <span className="mt-1 block text-sm text-[var(--studio-text-muted)]">{row.progress ? `最近更新 ${formatEpisodeDate(row.updatedAt)}` : "尚未开始"}</span>
                            </span>
                            <EpisodeStatusBadge status={row.status} />
                            <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.stage}</span>
                            <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.shotText}</span>
                            <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.canvasCount || "-"}</span>
                            <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.videoCount || "-"}</span>
                            <span className="flex items-center gap-4">
                                <span className="h-2 w-24 rounded-full bg-[var(--studio-elevated-bg)]">
                                    <span className="block h-full rounded-full bg-[linear-gradient(90deg,var(--studio-accent),var(--studio-success))]" style={{ width: `${row.progress}%` }} />
                                </span>
                                <span className="w-12 text-sm font-semibold text-[var(--studio-text-muted)]">{row.progress}%</span>
                            </span>
                            {primaryCanvasId ? (
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Maximize2 className="size-3.5" />}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenCanvas(primaryCanvasId);
                                    }}
                                >
                                    进入画布
                                </Button>
                            ) : (
                                <Button
                                    size="small"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenEpisode(row.id);
                                    }}
                                >
                                    进入流程
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function EpisodeStatusBadge({ status }: { status: ProjectEpisodeBoardRow["status"] }) {
    const className =
        status === "已完成"
            ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-300"
            : status === "进行中"
              ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]"
              : "border-amber-400/40 bg-amber-400/12 text-amber-300";
    return <span className={`w-fit rounded-md border px-2.5 py-1 text-sm font-semibold ${className}`}>{status}</span>;
}

function ProjectEpisodeEmpty({ onCreate, onCreateCanvas }: { onCreate: () => void; onCreateCanvas: () => void }) {
    return (
        <section className="grid min-h-80 place-items-center rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-6 py-16 text-center">
            <div>
                <h2 className="text-2xl font-semibold text-[var(--studio-text-primary)]">还没有分集</h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-[var(--studio-text-secondary)]">先新建或导入第一集剧本，后续导演分析、分镜审核、画布承接都会围绕分集推进。</p>
                <div className="mt-6 flex justify-center gap-3">
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={onCreate}>
                        新建分集
                    </Button>
                    <Button onClick={onCreateCanvas}>创建画布</Button>
                </div>
            </div>
        </section>
    );
}

function currentEpisodeStatusText(row: ProjectEpisodeBoardRow) {
    if (row.stage === "分镜") return "分镜审核中";
    if (row.stage === "成片") return "成片完成";
    if (row.stage === "剧本") return "剧本整理中";
    return "尚未开始";
}

function formatEpisodeOrder(order: number) {
    return String(order || 0).padStart(2, "0");
}

function formatEpisodeDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatProjectDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function _ProjectCommandCenter({
    dashboard,
    descriptionDraft,
    hasCanvas,
    primaryEpisodeLabel,
    primaryEpisodeReady,
    onCreateCanvas,
    onDescriptionDraftChange,
    onImportEpisode,
    onManageEpisodes,
    onOpenAgent,
    onOpenCanvas,
    onOpenPrimaryEpisode,
    onRunSuggestion,
    onSaveDescription,
}: {
    dashboard: ProjectOverviewDashboard | null;
    descriptionDraft: string;
    hasCanvas: boolean;
    primaryEpisodeLabel: string;
    primaryEpisodeReady: boolean;
    onCreateCanvas: () => void;
    onDescriptionDraftChange: (value: string) => void;
    onImportEpisode: () => void;
    onManageEpisodes: () => void;
    onOpenAgent: () => void;
    onOpenCanvas: () => void;
    onOpenPrimaryEpisode: () => void;
    onRunSuggestion: (target: ProjectOverviewActionTarget) => void;
    onSaveDescription: () => void;
}) {
    const stats = dashboard?.stats;
    const primarySuggestion = dashboard?.suggestions[0];
    const primaryActionText = primaryEpisodeLabel ? "进入本集生产流程" : "导入本集剧本";
    return (
        <section className="studio-panel grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--studio-text-muted)]">
                            <Workflow className="size-3.5" />
                            生产主线
                        </div>
                        <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text-primary)]">{primaryEpisodeLabel || "先建立本集内容"}</h2>
                        <p className="mt-2 text-base leading-6 text-[var(--studio-text-secondary)]">
                            {primaryEpisodeLabel ? (primaryEpisodeReady ? "剧本已就绪，可进入导演分析、服化道和 Seedance 分镜流程。" : "当前集还缺少剧本文本，先补齐剧本再进入生产流程。") : "项目页先围绕单集推进，避免在画布、分镜和素材入口之间来回找。"}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="primary" icon={<Workflow className="size-4" />} onClick={onOpenPrimaryEpisode}>
                            {primaryActionText}
                        </Button>
                        <Button icon={<ScrollText className="size-4" />} onClick={onManageEpisodes}>
                            导入剧本
                        </Button>
                        <Button icon={<Bot className="size-4" />} onClick={onOpenAgent}>
                            Agent
                        </Button>
                    </div>
                </div>

                {primarySuggestion ? (
                    <div className="studio-panel-muted flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-[var(--studio-text-primary)]">{primarySuggestion.title}</div>
                            <div className="mt-1 text-sm leading-6 text-[var(--studio-text-secondary)]">{primarySuggestion.description}</div>
                        </div>
                        <Button size="small" onClick={() => onRunSuggestion(primarySuggestion.target)}>
                            {primarySuggestion.actionLabel}
                        </Button>
                    </div>
                ) : null}

                {stats ? (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <ProjectCommandStat label="画布" value={stats.canvasCount} onClick={onOpenCanvas} />
                        <ProjectCommandStat label="分集 / 场次" value={`${stats.episodeCount} / ${stats.sceneCount}`} onClick={onManageEpisodes} />
                        <ProjectCommandStat label="分镜" value={`${stats.storyboardGroupCount} / ${stats.storyboardShotCount}`} onClick={() => onRunSuggestion({ type: "storyboard" })} />
                        <ProjectCommandStat label="缺素材" value={stats.missingMaterialCount} tone={stats.missingMaterialCount ? "warning" : "default"} onClick={() => onRunSuggestion({ type: "asset-references", missingOnly: true })} />
                    </div>
                ) : null}
            </div>

            <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                    <Button icon={<Plus className="size-4" />} onClick={onCreateCanvas}>
                        最后创建画布
                    </Button>
                    {hasCanvas ? (
                        <Button icon={<Maximize2 className="size-4" />} onClick={onOpenCanvas}>
                            打开画布
                        </Button>
                    ) : null}
                </div>
                {!primaryEpisodeLabel ? (
                    <Button type="primary" icon={<ScrollText className="size-4" />} onClick={onImportEpisode}>
                        先导入本集
                    </Button>
                ) : null}
                <div>
                    <div className="mb-2 text-sm font-medium">项目备注</div>
                    <Input.TextArea value={descriptionDraft} rows={3} placeholder="补充项目说明、目标风格或当前阶段" onChange={(event) => onDescriptionDraftChange(event.target.value)} />
                    <Button className="mt-2" icon={<Save className="size-4" />} onClick={onSaveDescription}>
                        保存说明
                    </Button>
                </div>
            </div>
        </section>
    );
}

function ProjectCommandStat({ label, value, tone = "default", onClick }: { label: string; value: string | number; tone?: "default" | "warning"; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`rounded-md border px-3 py-2 text-left transition hover:border-[var(--studio-border-strong)] ${
                tone === "warning" ? "border-amber-400/35 bg-amber-400/10 text-amber-300" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] text-[var(--studio-text-muted)]"
            }`}
            onClick={onClick}
        >
            <div className="text-xs font-medium">{label}</div>
            <div className="mt-1 text-lg font-semibold text-[var(--studio-text-primary)]">{value}</div>
        </button>
    );
}

function _ProjectOverviewDashboardView({ dashboard, onAction }: { dashboard: ProjectOverviewDashboard; onAction: (target: ProjectOverviewActionTarget) => void }) {
    const stats = dashboard.stats;
    const keyStats = [
        { icon: <Maximize2 className="size-3.5" />, label: "画布", value: stats.canvasCount, target: { type: "tab", tab: "canvas" } as ProjectOverviewActionTarget },
        { icon: <ScrollText className="size-3.5" />, label: "分集 / 场次", value: `${stats.episodeCount} / ${stats.sceneCount}`, target: { type: "primary-canvas" } as ProjectOverviewActionTarget },
        { icon: <Clapperboard className="size-3.5" />, label: "分镜", value: `${stats.storyboardGroupCount} / ${stats.storyboardShotCount}`, target: { type: "storyboard" } as ProjectOverviewActionTarget },
        { icon: <ListVideo className="size-3.5" />, label: "队列 / 视频", value: `${stats.generationQueueCount} / ${stats.generatedVideoCount}`, target: { type: "storyboard" } as ProjectOverviewActionTarget },
    ];
    const attentionStats = [
        { label: "失败", value: stats.failedGenerationCount, tone: stats.failedGenerationCount ? "danger" : "default", target: { type: "storyboard" } as ProjectOverviewActionTarget },
        { label: "缺素材", value: stats.missingMaterialCount, tone: stats.missingMaterialCount ? "warning" : "default", target: { type: "asset-references", missingOnly: true } as ProjectOverviewActionTarget },
        { label: "过期引用", value: stats.outdatedReferenceCount, tone: stats.outdatedReferenceCount ? "warning" : "default", target: { type: "asset-references", versionStatus: "outdated" } as ProjectOverviewActionTarget },
        { label: "项目库", value: stats.projectLibraryAssetCount, tone: "default", target: { type: "assets-page" } as ProjectOverviewActionTarget },
        { label: "Agent", value: stats.recentAgentTaskCount, tone: "default", target: { type: "agent" } as ProjectOverviewActionTarget },
    ];
    return (
        <section className="grid gap-4">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
                <div className="studio-panel p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-lg font-semibold text-[var(--studio-text-primary)]">下一步建议</div>
                            <p className="mt-1 text-sm leading-6 text-[var(--studio-text-secondary)]">优先展示当前最该处理的创作动作。</p>
                        </div>
                    </div>
                    {dashboard.suggestions.length ? (
                        <div className="mt-3 divide-y divide-[var(--studio-border-subtle)]">
                            {dashboard.suggestions.map((suggestion) => (
                                <div key={suggestion.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-[var(--studio-text-primary)]">{suggestion.title}</div>
                                        <div className="mt-1 text-sm leading-6 text-[var(--studio-text-secondary)]">{suggestion.description}</div>
                                    </div>
                                    <Button size="small" onClick={() => onAction(suggestion.target)}>
                                        {suggestion.actionLabel}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目暂时没有阻塞建议" className="py-8" />
                    )}
                </div>

                <div className="grid gap-3">
                    <div className="studio-panel p-4">
                        <div className="text-lg font-semibold text-[var(--studio-text-primary)]">项目状态</div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {keyStats.map((item) => (
                                <OverviewStatButton key={item.label} icon={item.icon} label={item.label} value={item.value} onClick={() => onAction(item.target)} />
                            ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {attentionStats.map((item) => (
                                <OverviewStatChip key={item.label} label={item.label} value={item.value} tone={item.tone as "default" | "warning" | "danger"} onClick={() => onAction(item.target)} />
                            ))}
                        </div>
                    </div>

                    <div className="studio-panel p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-lg font-semibold text-[var(--studio-text-primary)]">Agent 摘要</div>
                            <Button size="small" onClick={() => onAction({ type: "agent" })}>
                                打开 Agent
                            </Button>
                        </div>
                        {dashboard.recentAgentTasks.length ? (
                            <div className="mt-3 divide-y divide-[var(--studio-border-subtle)]">
                                {dashboard.recentAgentTasks.map((task) => (
                                    <div key={task.id} className="py-2 first:pt-0 last:pb-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Tag className="studio-tag">{agentKindLabel(task.kind)}</Tag>
                                            <Tag className="studio-tag">{agentRiskLabel(task.riskLevel)}</Tag>
                                            <Tag className="studio-tag">{agentTaskStatusLabel(task.status)}</Tag>
                                        </div>
                                        <div className="mt-2 break-words text-sm font-semibold text-[var(--studio-text-primary)]">{task.title}</div>
                                        <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--studio-text-secondary)]">{task.summary}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Agent 任务" className="py-6" />
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function OverviewStatButton({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: string | number; onClick: () => void }) {
    return (
        <button type="button" className="studio-panel-muted px-3 py-2 text-left transition hover:border-[var(--studio-border-strong)]" onClick={onClick}>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--studio-text-muted)]">
                {icon}
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold text-[var(--studio-text-primary)]">{value}</div>
        </button>
    );
}

function OverviewStatChip({ label, value, tone = "default", onClick }: { label: string; value: string | number; tone?: "default" | "warning" | "danger"; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition hover:border-[var(--studio-border-strong)] ${
                tone === "danger"
                    ? "border-red-400/35 bg-red-400/10 text-red-300"
                    : tone === "warning"
                      ? "border-amber-400/35 bg-amber-400/10 text-amber-300"
                      : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] text-[var(--studio-text-secondary)]"
            }`}
            onClick={onClick}
        >
            {label} {value}
        </button>
    );
}

function agentTaskStatusLabel(status: string) {
    if (status === "applied") return "已应用";
    if (status === "cancelled") return "已取消";
    return "待确认";
}

function _EntryCard({ icon, title, description, disabled, onOpen }: { icon: ReactNode; title: string; description: string; disabled?: boolean; onOpen?: () => void }) {
    return (
        <button type="button" disabled={disabled} className="studio-panel-muted p-4 text-left transition enabled:hover:border-[var(--studio-border-strong)] disabled:cursor-not-allowed disabled:opacity-50" onClick={onOpen}>
            <div className="flex items-center gap-2 text-base font-semibold text-[var(--studio-text-primary)]">
                {icon}
                {title}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">{description}</p>
        </button>
    );
}

function _EntryLink({ icon, title, description, href }: { icon: ReactNode; title: string; description: string; href: string }) {
    return (
        <Link href={href} className="studio-panel-muted p-4 text-left transition hover:border-[var(--studio-border-strong)]">
            <div className="flex items-center gap-2 text-base font-semibold text-[var(--studio-text-primary)]">
                {icon}
                {title}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">{description}</p>
        </Link>
    );
}

type ProjectMissingMaterialItem = {
    id: string;
    sourceLabel: string;
    title: string;
    description: string;
    actionLabel: string;
    action: { type: "production-bible"; kind?: ProductionBibleKind } | { type: "storyboard"; groupId?: string; shotId?: string } | { type: "asset"; asset: Asset };
};

function _ProjectAssetReferencesView({
    rows,
    totalCount,
    filters,
    missingOnly,
    missingItems,
    onAssetKindChange,
    onReferenceTypeChange,
    onVersionStatusChange,
    onProjectLibraryStatusChange,
    onMissingOnlyChange,
    onOpenAsset,
    onOpenCanvas,
    onOpenStoryboard,
    onOpenProductionBible,
}: {
    rows: ProjectAssetReferenceSummary[];
    totalCount: number;
    filters: {
        assetKind: AssetKind | "all";
        referenceType: ProjectAssetReferenceType | "all";
        versionStatus: ProjectAssetVersionFilter;
        projectLibraryStatus: ProjectAssetLibraryFilter;
    };
    missingOnly: boolean;
    missingItems: ProjectMissingMaterialItem[];
    onAssetKindChange: (value: AssetKind | "all") => void;
    onReferenceTypeChange: (value: ProjectAssetReferenceType | "all") => void;
    onVersionStatusChange: (value: ProjectAssetVersionFilter) => void;
    onProjectLibraryStatusChange: (value: ProjectAssetLibraryFilter) => void;
    onMissingOnlyChange: (value: boolean) => void;
    onOpenAsset: (asset: Asset) => void;
    onOpenCanvas: (canvasId: string) => void;
    onOpenStoryboard: (groupId?: string, shotId?: string) => void;
    onOpenProductionBible: (kind?: ProductionBibleKind) => void;
}) {
    return (
        <section className="grid gap-4">
            <div className="studio-panel p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="text-lg font-semibold text-[var(--studio-text-primary)]">项目素材引用</div>
                        <p className="mt-1 text-sm leading-6 text-[var(--studio-text-secondary)]">按素材聚合当前项目中的画布、分镜、设定库和生成结果引用。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Select
                            size="small"
                            className="w-28"
                            value={filters.assetKind}
                            options={[
                                { label: "全部类型", value: "all" },
                                { label: "图片", value: "image" },
                                { label: "视频", value: "video" },
                                { label: "音频", value: "audio" },
                                { label: "文本", value: "text" },
                            ]}
                            onChange={onAssetKindChange}
                        />
                        <Select
                            size="small"
                            className="w-32"
                            value={filters.referenceType}
                            options={[
                                { label: "全部引用", value: "all" },
                                { label: "画布", value: "canvas" },
                                { label: "分镜", value: "storyboard" },
                                { label: "设定库", value: "production-bible" },
                                { label: "生成结果", value: "generation-result" },
                            ]}
                            onChange={onReferenceTypeChange}
                        />
                        <Select
                            size="small"
                            className="w-32"
                            value={filters.versionStatus}
                            options={[
                                { label: "全部版本", value: "all" },
                                { label: "有过期引用", value: "outdated" },
                                { label: "已是最新版", value: "latest" },
                            ]}
                            onChange={onVersionStatusChange}
                        />
                        <Select
                            size="small"
                            className="w-32"
                            value={filters.projectLibraryStatus}
                            options={[
                                { label: "全部项目库", value: "all" },
                                { label: "仅项目库", value: "shared" },
                                { label: "未入项目库", value: "not_shared" },
                            ]}
                            onChange={onProjectLibraryStatusChange}
                        />
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--studio-text-secondary)]">
                    <span>
                        当前显示 {missingOnly ? missingItems.length : rows.length} 个{missingOnly ? "缺口" : "素材"}，总计 {totalCount} 个项目引用素材、{missingItems.length} 处素材缺口。
                    </span>
                    <Button size="small" type={missingOnly ? "primary" : "default"} onClick={() => onMissingOnlyChange(!missingOnly)}>
                        {missingOnly ? "查看素材引用" : "只看缺素材"}
                    </Button>
                </div>
            </div>

            {missingOnly ? (
                <ProjectMissingMaterialList items={missingItems} onOpenAsset={onOpenAsset} onOpenStoryboard={onOpenStoryboard} onOpenProductionBible={onOpenProductionBible} />
            ) : rows.length ? (
                <div className="grid gap-3">
                    {rows.map((row) => (
                        <ProjectAssetReferenceCard key={row.asset.id} row={row} onOpenAsset={onOpenAsset} onOpenCanvas={onOpenCanvas} onOpenStoryboard={onOpenStoryboard} onOpenProductionBible={onOpenProductionBible} />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的素材引用" className="py-16" />
            )}
        </section>
    );
}

function ProjectMissingMaterialList({
    items,
    onOpenAsset,
    onOpenStoryboard,
    onOpenProductionBible,
}: {
    items: ProjectMissingMaterialItem[];
    onOpenAsset: (asset: Asset) => void;
    onOpenStoryboard: (groupId?: string, shotId?: string) => void;
    onOpenProductionBible: (kind?: ProductionBibleKind) => void;
}) {
    if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有素材缺口" className="py-16" />;
    return (
        <div className="grid gap-3">
            {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-md border border-amber-400/35 bg-amber-400/10 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag color="warning" className="m-0">
                                {item.sourceLabel}
                            </Tag>
                            <div className="font-semibold text-[var(--studio-text-primary)]">{item.title}</div>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">{item.description}</div>
                    </div>
                    <Button size="small" onClick={() => openMissingMaterialAction(item, onOpenAsset, onOpenStoryboard, onOpenProductionBible)}>
                        {item.actionLabel}
                    </Button>
                </div>
            ))}
        </div>
    );
}

function openMissingMaterialAction(item: ProjectMissingMaterialItem, onOpenAsset: (asset: Asset) => void, onOpenStoryboard: (groupId?: string, shotId?: string) => void, onOpenProductionBible: (kind?: ProductionBibleKind) => void) {
    if (item.action.type === "asset") onOpenAsset(item.action.asset);
    if (item.action.type === "storyboard") onOpenStoryboard(item.action.groupId, item.action.shotId);
    if (item.action.type === "production-bible") onOpenProductionBible(item.action.kind);
}

function ProjectAssetReferenceCard({
    row,
    onOpenAsset,
    onOpenCanvas,
    onOpenStoryboard,
    onOpenProductionBible,
}: {
    row: ProjectAssetReferenceSummary;
    onOpenAsset: (asset: Asset) => void;
    onOpenCanvas: (canvasId: string) => void;
    onOpenStoryboard: (groupId?: string, shotId?: string) => void;
    onOpenProductionBible: (kind?: ProductionBibleKind) => void;
}) {
    return (
        <div className="studio-panel p-4">
            <div className="flex flex-col gap-4 lg:flex-row">
                <button type="button" className="w-full overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] text-left lg:w-32" onClick={() => onOpenAsset(row.asset)}>
                    <AssetReferenceThumb asset={row.asset} />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <button type="button" className="break-words text-left text-base font-semibold text-[var(--studio-text-primary)] hover:text-[var(--studio-accent)]" onClick={() => onOpenAsset(row.asset)}>
                                {row.asset.title || "未命名素材"}
                            </button>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <Tag className="studio-tag">{assetKindLabel(row.asset.kind)}</Tag>
                                <Tag className="studio-tag">{row.referenceCount} 处引用</Tag>
                                {row.hasOutdatedVersion ? (
                                    <Tag color="gold" className="m-0">
                                        有过期引用
                                    </Tag>
                                ) : (
                                    <Tag color="success" className="m-0">
                                        最新
                                    </Tag>
                                )}
                                {row.hasMissingLocalFile ? (
                                    <Tag color="error" className="m-0" icon={<AlertTriangle className="size-3" />}>
                                        本地文件缺失
                                    </Tag>
                                ) : null}
                                {row.inProjectLibrary ? (
                                    <Tag className="studio-tag" icon={<Library className="size-3" />}>
                                        项目库
                                    </Tag>
                                ) : (
                                    <Tag className="studio-tag">未入项目库</Tag>
                                )}
                            </div>
                            <div className="mt-2 text-xs text-[var(--studio-text-muted)]">最近更新：{row.updatedAt || "未知"}</div>
                        </div>
                        <Button size="small" icon={<ExternalLink className="size-3.5" />} onClick={() => onOpenAsset(row.asset)}>
                            素材详情
                        </Button>
                    </div>
                    <div className="mt-3 grid gap-2">
                        {row.references.map((reference) => (
                            <div key={reference.id} className="flex flex-col gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="studio-tag">{referenceTypeLabel(reference.type)}</Tag>
                                        <span className="text-sm font-semibold text-[var(--studio-text-primary)]">{reference.label}</span>
                                        {reference.hasOutdatedVersion ? <Tag color="gold">旧版本</Tag> : null}
                                    </div>
                                    <div className="mt-1 text-xs text-[var(--studio-text-muted)]">{[reference.contextLabel, reference.role].filter(Boolean).join(" · ")}</div>
                                </div>
                                <ReferenceOpenButton reference={reference} onOpenCanvas={onOpenCanvas} onOpenStoryboard={onOpenStoryboard} onOpenProductionBible={onOpenProductionBible} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ReferenceOpenButton({
    reference,
    onOpenCanvas,
    onOpenStoryboard,
    onOpenProductionBible,
}: {
    reference: ProjectAssetReferenceSummary["references"][number];
    onOpenCanvas: (canvasId: string) => void;
    onOpenStoryboard: (groupId?: string, shotId?: string) => void;
    onOpenProductionBible: (kind?: ProductionBibleKind) => void;
}) {
    if (reference.type === "canvas" && reference.canvasId)
        return (
            <Button size="small" onClick={() => onOpenCanvas(reference.canvasId!)}>
                打开画布
            </Button>
        );
    if (reference.type === "storyboard" || reference.storyboardGroupId || reference.storyboardShotId)
        return (
            <Button size="small" onClick={() => onOpenStoryboard(reference.storyboardGroupId, reference.storyboardShotId)}>
                打开分镜
            </Button>
        );
    if (reference.type === "production-bible")
        return (
            <Button size="small" onClick={() => onOpenProductionBible(reference.productionBibleKind)}>
                打开设定库
            </Button>
        );
    return null;
}

function AssetReferenceDrawer({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
    return (
        <Drawer rootClassName="studio-workspace" title="素材详情" open={Boolean(asset)} onClose={onClose} size="large">
            {asset ? (
                <div className="space-y-4">
                    <AssetReferenceThumb asset={asset} large />
                    <div>
                        <div className="text-xl font-semibold text-[var(--studio-text-primary)]">{asset.title}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Tag className="studio-tag">{assetKindLabel(asset.kind)}</Tag>
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag} className="studio-tag">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    </div>
                    {asset.kind === "text" ? <pre className="whitespace-pre-wrap rounded-md bg-[var(--studio-panel-muted-bg)] p-4 text-sm leading-6 text-[var(--studio-text-secondary)]">{asset.data.content}</pre> : null}
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 text-sm">
                        <div className="text-sm text-[var(--studio-text-muted)]">素材 ID</div>
                        <div className="mt-1 break-all text-[var(--studio-text-primary)]">{asset.id}</div>
                        <div className="mt-3 text-sm text-[var(--studio-text-muted)]">最近更新</div>
                        <div className="mt-1 text-[var(--studio-text-primary)]">{asset.updatedAt || "未知"}</div>
                    </div>
                </div>
            ) : null}
        </Drawer>
    );
}

function AssetReferenceThumb({ asset, large = false }: { asset: Asset; large?: boolean }) {
    const className = large ? "max-h-[420px] w-full rounded-md object-contain bg-[var(--studio-panel-muted-bg)]" : "aspect-video w-full object-cover";
    if (asset.kind === "image") return <img src={asset.coverUrl || asset.data.dataUrl} alt={asset.title} className={className} />;
    if (asset.kind === "video") return <video src={asset.data.url} controls={large} muted={!large} playsInline preload="metadata" className={`${className} bg-black`} />;
    if (asset.kind === "audio") return large ? <audio src={asset.data.url} controls className="w-full" /> : <div className="grid aspect-video place-items-center text-sm text-[var(--studio-text-muted)]">音频素材</div>;
    return <div className={`${large ? "min-h-40" : "aspect-video"} overflow-hidden p-4 text-sm leading-6 text-[var(--studio-text-secondary)]`}>{asset.data.content}</div>;
}

function referenceTypeLabel(type: ProjectAssetReferenceType) {
    if (type === "canvas") return "画布";
    if (type === "storyboard") return "分镜";
    if (type === "production-bible") return "设定库";
    return "生成结果";
}
