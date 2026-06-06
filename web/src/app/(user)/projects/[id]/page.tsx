"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Drawer, Empty, Input, Select, Tabs, Tag } from "antd";
import { AlertTriangle, Bot, BookOpen, Boxes, Clapperboard, ExternalLink, FileText, Images, Library, ListVideo, Maximize2, Plus, ScrollText, Save, SlidersHorizontal, Sparkles, Video } from "lucide-react";

import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { AssetBreakdownDrawer } from "../../canvas/components/asset-breakdown-drawer";
import { CanvasCreateProjectModal } from "../../canvas/components/canvas-create-project-modal";
import { ImageBriefWorkbenchDrawer } from "../../canvas/components/image-brief-workbench-drawer";
import { ProductionBibleDrawer } from "../../canvas/components/production-bible-drawer";
import { StoryboardManagerDrawer } from "../../canvas/components/storyboard-manager-drawer";
import { useCanvasStore } from "../../canvas/stores/use-canvas-store";
import { useGenerationQueueStore } from "../../canvas/stores/use-generation-queue-store";
import { useProductionBibleStore } from "../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../canvas/stores/use-storyboard-store";
import { buildImportedEpisodeWriteInput, canvasEpisodeContextFromCreateBinding, canvasEpisodeLabel, type CanvasCreateScriptBinding } from "../../canvas/utils/canvas-episode-context";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../../canvas/utils/canvas-project-preset";
import { buildImageBriefImageConfigNode, type ImageBrief } from "../../canvas/utils/image-brief";
import type { ProductionBibleKind } from "../../canvas/utils/production-bible";
import { assetKindLabel } from "../../assets/asset-utils";
import { canvasIdsForCreativeProject, unfiledCanvasProjects } from "../creative-projects";
import { collectProjectAssetReferences, filterProjectAssetReferences, type ProjectAssetLibraryFilter, type ProjectAssetReferenceSummary, type ProjectAssetReferenceType, type ProjectAssetVersionFilter } from "../project-asset-references";
import { buildProjectOverviewDashboard, projectOverviewActionHref, type ProjectOverviewActionTarget, type ProjectOverviewDashboard } from "../project-overview-dashboard";
import { editableCanvasPreset } from "../project-canvas-preset";
import { agentKindLabel, agentRiskLabel } from "../agent-workbench";
import { useAgentTaskStore } from "../use-agent-task-store";
import { useCreativeProjectStore } from "../use-creative-project-store";

export default function CreativeProjectDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { message } = App.useApp();
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
    const [activeTab, setActiveTab] = useState("overview");
    const [createCanvasOpen, setCreateCanvasOpen] = useState(false);
    const [editingCanvasPresetId, setEditingCanvasPresetId] = useState("");
    const [descriptionDraft, setDescriptionDraft] = useState(project?.description || "");
    const [bindingCanvasId, setBindingCanvasId] = useState("");
    const [assetKindFilter, setAssetKindFilter] = useState<AssetKind | "all">("all");
    const [referenceTypeFilter, setReferenceTypeFilter] = useState<ProjectAssetReferenceType | "all">("all");
    const [versionStatusFilter, setVersionStatusFilter] = useState<ProjectAssetVersionFilter>("all");
    const [assetLibraryFilter, setAssetLibraryFilter] = useState<ProjectAssetLibraryFilter>("all");
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [storyboardOpen, setStoryboardOpen] = useState(false);
    const [storyboardInitialGroupId, setStoryboardInitialGroupId] = useState("");
    const [assetBreakdownOpen, setAssetBreakdownOpen] = useState(false);
    const [imageBriefOpen, setImageBriefOpen] = useState(false);
    const [productionBibleOpen, setProductionBibleOpen] = useState(false);
    const [productionBibleInitialKind, setProductionBibleInitialKind] = useState<ProductionBibleKind | undefined>();
    const canvasIds = useMemo(() => (project ? canvasIdsForCreativeProject(project, canvases) : []), [canvases, project]);
    const projectCanvases = useMemo(() => canvases.filter((canvas) => canvasIds.includes(canvas.id)), [canvasIds, canvases]);
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
    const overviewDashboard = useMemo(
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
    const filteredAssetReferenceRows = useMemo(
        () =>
            filterProjectAssetReferences(assetReferenceRows, {
                assetKind: assetKindFilter,
                referenceType: referenceTypeFilter,
                versionStatus: versionStatusFilter,
                projectLibraryStatus: assetLibraryFilter,
            }),
        [assetKindFilter, assetLibraryFilter, assetReferenceRows, referenceTypeFilter, versionStatusFilter],
    );
    useEffect(() => {
        setDescriptionDraft(project?.description || "");
    }, [project?.description]);

    if (!project) {
        return (
            <main className="h-full overflow-auto bg-background px-6 py-10 text-stone-950 dark:text-stone-100">
                <div className="mx-auto max-w-3xl">
                    <Empty description="项目不存在或尚未加载">
                        <Button href="/projects">返回项目工作台</Button>
                    </Empty>
                </div>
            </main>
        );
    }

    const saveDescription = () => {
        updateCreativeProject(project.id, { description: descriptionDraft });
        message.success("项目说明已保存");
    };

    const createCanvasAndOpen = (title: string, preset: CanvasProjectPreset, scriptBinding?: CanvasCreateScriptBinding) => {
        const importedEpisode = buildImportedEpisodeWriteInput(project.id, scriptBinding);
        if (importedEpisode && scriptBinding?.mode === "import") upsertScriptProject(project.id, scriptBinding.scriptText);
        const importedEpisodeId = importedEpisode ? addEpisode(importedEpisode) : undefined;
        const episodeContext = canvasEpisodeContextFromCreateBinding(project.id, scriptBinding, importedEpisodeId);
        const canvasId = createCanvas(title, preset, { projectId: project.id, episodeContext });
        attachCanvas(project.id, canvasId);
        setCreateCanvasOpen(false);
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
        else setCreateCanvasOpen(true);
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

    const runOverviewAction = (target: ProjectOverviewActionTarget) => {
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
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Link href="/projects" className="text-xs text-stone-500 hover:text-stone-950 dark:hover:text-stone-100">
                                项目工作台
                            </Link>
                            <h1 className="mt-3 text-3xl font-semibold">{project.title}</h1>
                            <p className="mt-2 text-sm text-stone-500">{canvasProjectPresetSummary(project.preset)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button icon={<Plus className="size-4" />} onClick={() => setCreateCanvasOpen(true)}>
                                新建画布
                            </Button>
                            <Button type="primary" icon={<Maximize2 className="size-4" />} onClick={openPrimaryCanvas}>
                                打开画布
                            </Button>
                        </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
                        <Input.TextArea value={descriptionDraft} rows={2} placeholder="补充项目说明、目标风格或当前阶段" onChange={(event) => setDescriptionDraft(event.target.value)} />
                        <Button icon={<Save className="size-4" />} onClick={saveDescription}>
                            保存说明
                        </Button>
                    </div>
                </header>

                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: "overview",
                            label: "总览",
                            children: overviewDashboard ? <ProjectOverviewDashboardView dashboard={overviewDashboard} onAction={runOverviewAction} /> : null,
                        },
                        {
                            key: "canvas",
                            label: "画布",
                            children: (
                                <section className="grid gap-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateCanvasOpen(true)}>
                                            新建项目画布
                                        </Button>
                                        <Select
                                            size="small"
                                            showSearch
                                            className="min-w-56"
                                            placeholder="绑定未归档画布"
                                            value={bindingCanvasId || undefined}
                                            options={unboundCanvases.map((canvas) => ({ label: canvas.title, value: canvas.id }))}
                                            optionFilterProp="label"
                                            onChange={setBindingCanvasId}
                                        />
                                        <Button size="small" disabled={!bindingCanvasId} onClick={bindCanvas}>
                                            绑定
                                        </Button>
                                    </div>
                                    {projectCanvases.length ? (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            {projectCanvases.map((canvas) => (
                                                <div key={canvas.id} className="flex items-center gap-3 rounded-xl border border-stone-200 p-4 transition hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-white/5">
                                                    <Link href={`/canvas/${canvas.id}`} className="min-w-0 flex-1 text-stone-950 dark:text-stone-100">
                                                        <div className="flex items-center gap-3">
                                                            <span className="truncate font-medium">{canvas.title}</span>
                                                            <Tag className="m-0 shrink-0">{canvas.nodes.length} 节点</Tag>
                                                            <Tag className="m-0 shrink-0" color={canvas.episodeId ? "blue" : undefined}>
                                                                {canvasEpisodeLabel(canvas)}
                                                            </Tag>
                                                        </div>
                                                        <p className="mt-2 truncate text-xs text-stone-500">{canvasProjectPresetSummary(editableCanvasPreset(canvas.preset, project.preset))}</p>
                                                    </Link>
                                                    <Button size="small" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setEditingCanvasPresetId(canvas.id)}>
                                                        预设
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <Empty description="这个项目还没有画布" />
                                    )}
                                </section>
                            ),
                        },
                        {
                            key: "workflow",
                            label: "工作流",
                            children: (
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    <EntryCard
                                        icon={<ScrollText className="size-5" />}
                                        title="剧本分镜"
                                        description={`${overviewDashboard?.stats.episodeCount || 0} 个分集，${overviewDashboard?.stats.sceneCount || 0} 个场次，${overviewDashboard?.stats.storyboardGroupCount || 0} 个分镜组，${overviewDashboard?.stats.storyboardShotCount || 0} 条分镜`}
                                        onOpen={openPrimaryCanvas}
                                    />
                                    <EntryCard
                                        icon={<BookOpen className="size-5" />}
                                        title="设定库"
                                        description={`${bibleItems.filter((item) => item.projectId === project.id).length} 个角色 / 场景 / 道具设定`}
                                        onOpen={() => openProductionBibleReference()}
                                    />
                                    <EntryCard icon={<Boxes className="size-5" />} title="资产拆解" description="从本集剧本整理角色、场景、道具和风格 Brief" onOpen={() => setAssetBreakdownOpen(true)} />
                                    <EntryCard icon={<Sparkles className="size-5" />} title="生图 Brief" description="管理场景图、角色图、道具图和氛围参考图 Brief" onOpen={() => setImageBriefOpen(true)} />
                                    <EntryLink icon={<Images className="size-5" />} title="素材" description="查看当前项目生成和引用素材" href={`/assets?projectId=${project.id}`} />
                                    <EntryLink icon={<FileText className="size-5" />} title="提示词" description="进入提示词仓库复用模板" href="/prompts" />
                                    <EntryCard icon={<ListVideo className="size-5" />} title="队列" description={`${overviewDashboard?.stats.generationQueueCount || 0} 个本地队列项`} onOpen={() => openStoryboardReference()} />
                                    <EntryLink icon={<Bot className="size-5" />} title="Agent" description="进入短剧 Agent 任务中心" href={`/projects/${project.id}/agent`} />
                                </div>
                            ),
                        },
                        {
                            key: "asset-references",
                            label: "素材引用",
                            children: (
                                <ProjectAssetReferencesView
                                    rows={filteredAssetReferenceRows}
                                    totalCount={assetReferenceRows.length}
                                    filters={{
                                        assetKind: assetKindFilter,
                                        referenceType: referenceTypeFilter,
                                        versionStatus: versionStatusFilter,
                                        projectLibraryStatus: assetLibraryFilter,
                                    }}
                                    onAssetKindChange={setAssetKindFilter}
                                    onReferenceTypeChange={setReferenceTypeFilter}
                                    onVersionStatusChange={setVersionStatusFilter}
                                    onProjectLibraryStatusChange={setAssetLibraryFilter}
                                    onOpenAsset={setPreviewAsset}
                                    onOpenCanvas={(canvasId) => router.push(`/canvas/${canvasId}`)}
                                    onOpenStoryboard={openStoryboardReference}
                                    onOpenProductionBible={openProductionBibleReference}
                                />
                            ),
                        },
                    ]}
                />
            </div>

            <CanvasCreateProjectModal
                open={createCanvasOpen}
                defaultTitle={`${project.title} 画布 ${projectCanvases.length + 1}`}
                config={effectiveConfig}
                scriptOptions={{ projectId: project.id, episodes, scenes }}
                onCancel={() => setCreateCanvasOpen(false)}
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

function ProjectOverviewDashboardView({ dashboard, onAction }: { dashboard: ProjectOverviewDashboard; onAction: (target: ProjectOverviewActionTarget) => void }) {
    const stats = dashboard.stats;
    return (
        <section className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <OverviewStatCard icon={<Maximize2 className="size-4" />} label="画布" value={stats.canvasCount} onClick={() => onAction({ type: "tab", tab: "canvas" })} />
                <OverviewStatCard icon={<ScrollText className="size-4" />} label="剧本 / 分集 / 场次" value={`${stats.scriptProjectCount} / ${stats.episodeCount} / ${stats.sceneCount}`} onClick={() => onAction({ type: "primary-canvas" })} />
                <OverviewStatCard icon={<Clapperboard className="size-4" />} label="分镜组 / 条目" value={`${stats.storyboardGroupCount} / ${stats.storyboardShotCount}`} onClick={() => onAction({ type: "storyboard" })} />
                <OverviewStatCard icon={<ListVideo className="size-4" />} label="生成队列" value={stats.generationQueueCount} onClick={() => onAction({ type: "storyboard" })} />
                <OverviewStatCard icon={<Video className="size-4" />} label="已生成视频" value={stats.generatedVideoCount} onClick={() => onAction({ type: "asset-references" })} />
                <OverviewStatCard icon={<AlertTriangle className="size-4" />} label="失败生成" value={stats.failedGenerationCount} tone={stats.failedGenerationCount ? "danger" : "default"} onClick={() => onAction({ type: "storyboard" })} />
                <OverviewStatCard icon={<Boxes className="size-4" />} label="缺素材" value={stats.missingMaterialCount} tone={stats.missingMaterialCount ? "warning" : "default"} onClick={() => onAction({ type: "asset-references", missingOnly: true })} />
                <OverviewStatCard
                    icon={<AlertTriangle className="size-4" />}
                    label="过期引用"
                    value={stats.outdatedReferenceCount}
                    tone={stats.outdatedReferenceCount ? "warning" : "default"}
                    onClick={() => onAction({ type: "asset-references", versionStatus: "outdated" })}
                />
                <OverviewStatCard icon={<Library className="size-4" />} label="项目库素材" value={stats.projectLibraryAssetCount} onClick={() => onAction({ type: "assets-page" })} />
                <OverviewStatCard icon={<Bot className="size-4" />} label="最近 Agent 任务" value={stats.recentAgentTaskCount} onClick={() => onAction({ type: "agent" })} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-medium">下一步建议</div>
                            <p className="mt-1 text-sm text-stone-500">根据当前项目状态给出可点击的制作动作，不会自动修改数据。</p>
                        </div>
                    </div>
                    {dashboard.suggestions.length ? (
                        <div className="mt-4 grid gap-3">
                            {dashboard.suggestions.map((suggestion) => (
                                <div key={suggestion.id} className="rounded-lg bg-stone-50 px-4 py-3 dark:bg-stone-900/70">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="font-medium text-stone-950 dark:text-stone-100">{suggestion.title}</div>
                                            <div className="mt-1 text-sm text-stone-500">{suggestion.description}</div>
                                        </div>
                                        <Button size="small" onClick={() => onAction(suggestion.target)}>
                                            {suggestion.actionLabel}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目暂时没有阻塞建议" className="py-8" />
                    )}
                </div>

                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-medium">Agent 摘要</div>
                            <p className="mt-1 text-sm text-stone-500">只展示最近任务，不新增 Agent 进阶能力。</p>
                        </div>
                        <Button size="small" onClick={() => onAction({ type: "agent" })}>
                            打开 Agent
                        </Button>
                    </div>
                    {dashboard.recentAgentTasks.length ? (
                        <div className="mt-4 space-y-2">
                            {dashboard.recentAgentTasks.map((task) => (
                                <div key={task.id} className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-900/70">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0">{agentKindLabel(task.kind)}</Tag>
                                        <Tag className="m-0">{agentRiskLabel(task.riskLevel)}</Tag>
                                        <Tag className="m-0">{agentTaskStatusLabel(task.status)}</Tag>
                                    </div>
                                    <div className="mt-2 line-clamp-1 text-sm font-medium">{task.title}</div>
                                    <div className="mt-1 line-clamp-2 text-xs text-stone-500">{task.summary}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Agent 任务" className="py-8" />
                    )}
                </div>
            </div>
        </section>
    );
}

function OverviewStatCard({ icon, label, value, tone = "default", onClick }: { icon: ReactNode; label: string; value: string | number; tone?: "default" | "warning" | "danger"; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`rounded-xl border p-4 text-left transition hover:bg-stone-50 dark:hover:bg-white/5 ${
                tone === "danger" ? "border-red-200 dark:border-red-900/70" : tone === "warning" ? "border-amber-200 dark:border-amber-900/70" : "border-stone-200 dark:border-stone-800"
            }`}
            onClick={onClick}
        >
            <div className="flex items-center gap-2 text-xs text-stone-500">
                {icon}
                {label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-stone-950 dark:text-stone-100">{value}</div>
        </button>
    );
}

function agentTaskStatusLabel(status: string) {
    if (status === "applied") return "已应用";
    if (status === "cancelled") return "已取消";
    return "待确认";
}

function EntryCard({ icon, title, description, disabled, onOpen }: { icon: ReactNode; title: string; description: string; disabled?: boolean; onOpen?: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className="rounded-xl border border-stone-200 p-4 text-left transition enabled:hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-800 dark:enabled:hover:bg-white/5"
            onClick={onOpen}
        >
            <div className="flex items-center gap-2 text-base font-medium">
                {icon}
                {title}
            </div>
            <p className="mt-2 text-sm text-stone-500">{description}</p>
        </button>
    );
}

function EntryLink({ icon, title, description, href }: { icon: ReactNode; title: string; description: string; href: string }) {
    return (
        <Link href={href} className="rounded-xl border border-stone-200 p-4 text-left text-stone-950 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-100 dark:hover:bg-white/5">
            <div className="flex items-center gap-2 text-base font-medium">
                {icon}
                {title}
            </div>
            <p className="mt-2 text-sm text-stone-500">{description}</p>
        </Link>
    );
}

function ProjectAssetReferencesView({
    rows,
    totalCount,
    filters,
    onAssetKindChange,
    onReferenceTypeChange,
    onVersionStatusChange,
    onProjectLibraryStatusChange,
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
    onAssetKindChange: (value: AssetKind | "all") => void;
    onReferenceTypeChange: (value: ProjectAssetReferenceType | "all") => void;
    onVersionStatusChange: (value: ProjectAssetVersionFilter) => void;
    onProjectLibraryStatusChange: (value: ProjectAssetLibraryFilter) => void;
    onOpenAsset: (asset: Asset) => void;
    onOpenCanvas: (canvasId: string) => void;
    onOpenStoryboard: (groupId?: string, shotId?: string) => void;
    onOpenProductionBible: (kind?: ProductionBibleKind) => void;
}) {
    return (
        <section className="grid gap-4">
            <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="text-base font-medium">项目素材引用</div>
                        <p className="mt-1 text-sm text-stone-500">按素材聚合当前项目中的画布、分镜、设定库和生成结果引用。</p>
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
                <div className="mt-3 text-xs text-stone-500">
                    当前显示 {rows.length} 个素材，总计 {totalCount} 个项目引用素材。
                </div>
            </div>

            {rows.length ? (
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
        <div className="rounded-xl border border-stone-200 bg-background p-4 dark:border-stone-800">
            <div className="flex flex-col gap-4 lg:flex-row">
                <button type="button" className="w-full overflow-hidden rounded-lg bg-stone-100 text-left dark:bg-stone-900 lg:w-32" onClick={() => onOpenAsset(row.asset)}>
                    <AssetReferenceThumb asset={row.asset} />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <button type="button" className="truncate text-left text-base font-medium text-stone-950 hover:underline dark:text-stone-100" onClick={() => onOpenAsset(row.asset)}>
                                {row.asset.title || "未命名素材"}
                            </button>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <Tag className="m-0">{assetKindLabel(row.asset.kind)}</Tag>
                                <Tag className="m-0">{row.referenceCount} 处引用</Tag>
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
                                    <Tag className="m-0" icon={<Library className="size-3" />}>
                                        项目库
                                    </Tag>
                                ) : (
                                    <Tag className="m-0">未入项目库</Tag>
                                )}
                            </div>
                            <div className="mt-2 text-xs text-stone-500">最近更新：{row.updatedAt || "未知"}</div>
                        </div>
                        <Button size="small" icon={<ExternalLink className="size-3.5" />} onClick={() => onOpenAsset(row.asset)}>
                            素材详情
                        </Button>
                    </div>
                    <div className="mt-3 grid gap-2">
                        {row.references.map((reference) => (
                            <div key={reference.id} className="flex flex-col gap-2 rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-900/70 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0">{referenceTypeLabel(reference.type)}</Tag>
                                        <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{reference.label}</span>
                                        {reference.hasOutdatedVersion ? <Tag color="gold">旧版本</Tag> : null}
                                    </div>
                                    <div className="mt-1 text-xs text-stone-500">{[reference.contextLabel, reference.role].filter(Boolean).join(" · ")}</div>
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
        <Drawer title="素材详情" open={Boolean(asset)} onClose={onClose} size="large">
            {asset ? (
                <div className="space-y-4">
                    <AssetReferenceThumb asset={asset} large />
                    <div>
                        <div className="text-xl font-semibold text-stone-950 dark:text-stone-100">{asset.title}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Tag>{assetKindLabel(asset.kind)}</Tag>
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag}>{tag}</Tag>
                            ))}
                        </div>
                    </div>
                    {asset.kind === "text" ? <pre className="whitespace-pre-wrap rounded-lg bg-stone-50 p-4 text-sm leading-6 dark:bg-stone-900">{asset.data.content}</pre> : null}
                    <div className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-800">
                        <div className="text-xs text-stone-500">素材 ID</div>
                        <div className="mt-1 break-all">{asset.id}</div>
                        <div className="mt-3 text-xs text-stone-500">最近更新</div>
                        <div className="mt-1">{asset.updatedAt || "未知"}</div>
                    </div>
                </div>
            ) : null}
        </Drawer>
    );
}

function AssetReferenceThumb({ asset, large = false }: { asset: Asset; large?: boolean }) {
    const className = large ? "max-h-[420px] w-full rounded-lg object-contain bg-stone-100 dark:bg-stone-900" : "aspect-video w-full object-cover";
    if (asset.kind === "image") return <img src={asset.coverUrl || asset.data.dataUrl} alt={asset.title} className={className} />;
    if (asset.kind === "video") return <video src={asset.data.url} controls={large} muted={!large} playsInline preload="metadata" className={`${className} bg-black`} />;
    if (asset.kind === "audio") return large ? <audio src={asset.data.url} controls className="w-full" /> : <div className="grid aspect-video place-items-center text-sm text-stone-500">音频素材</div>;
    return <div className={`${large ? "min-h-40" : "aspect-video"} overflow-hidden p-4 text-sm leading-6 text-stone-600 dark:text-stone-300`}>{asset.data.content}</div>;
}

function referenceTypeLabel(type: ProjectAssetReferenceType) {
    if (type === "canvas") return "画布";
    if (type === "storyboard") return "分镜";
    if (type === "production-bible") return "设定库";
    return "生成结果";
}
