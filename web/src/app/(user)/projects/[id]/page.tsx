"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Drawer, Empty, Form, Input, Modal, Select, Tabs, Tag } from "antd";
import { AlertTriangle, Bot, BookOpen, Boxes, Clapperboard, ExternalLink, FileText, Images, Library, ListVideo, Maximize2, Plus, ScrollText, Save, SlidersHorizontal, Sparkles, Workflow } from "lucide-react";

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
import { LocalAiTaskLogPanel } from "../components/local-ai-task-log-panel";
import { useAgentTaskStore } from "../use-agent-task-store";
import { useCreativeProjectStore } from "../use-creative-project-store";

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
    const [episodeImportOpen, setEpisodeImportOpen] = useState(false);
    const [editingCanvasPresetId, setEditingCanvasPresetId] = useState("");
    const [descriptionDraft, setDescriptionDraft] = useState(project?.description || "");
    const [bindingCanvasId, setBindingCanvasId] = useState("");
    const [assetKindFilter, setAssetKindFilter] = useState<AssetKind | "all">("all");
    const [referenceTypeFilter, setReferenceTypeFilter] = useState<ProjectAssetReferenceType | "all">("all");
    const [versionStatusFilter, setVersionStatusFilter] = useState<ProjectAssetVersionFilter>("all");
    const [assetLibraryFilter, setAssetLibraryFilter] = useState<ProjectAssetLibraryFilter>("all");
    const [missingOnlyFilter, setMissingOnlyFilter] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [storyboardOpen, setStoryboardOpen] = useState(false);
    const [storyboardInitialGroupId, setStoryboardInitialGroupId] = useState("");
    const [assetBreakdownOpen, setAssetBreakdownOpen] = useState(false);
    const [imageBriefOpen, setImageBriefOpen] = useState(false);
    const [productionBibleOpen, setProductionBibleOpen] = useState(false);
    const [productionBibleInitialKind, setProductionBibleInitialKind] = useState<ProductionBibleKind | undefined>();
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
    const missingMaterialItems = useMemo(() => {
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
    }, [project?.description]);

    useEffect(() => {
        if (!episodeImportOpen) return;
        episodeImportForm.setFieldsValue({ title: `第 ${projectEpisodes.length + 1} 集`, scriptText: "" });
    }, [episodeImportForm, episodeImportOpen, projectEpisodes.length]);

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

    const createCanvasAndOpen = (title: string, preset: CanvasProjectPreset) => {
        const canvasId = createCanvas(title, preset, { projectId: project.id });
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

    const primaryEpisode = projectEpisodes[0];

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <Link href="/projects" className="text-xs text-stone-500 hover:text-stone-950 dark:hover:text-stone-100">
                            项目工作台
                        </Link>
                        <h1 className="mt-3 text-3xl font-semibold">{project.title}</h1>
                        <p className="mt-2 text-sm text-stone-500">{canvasProjectPresetSummary(project.preset)}</p>
                    </div>
                </header>

                <ProjectCommandCenter
                    dashboard={overviewDashboard}
                    descriptionDraft={descriptionDraft}
                    hasCanvas={Boolean(projectCanvases.length)}
                    primaryEpisodeLabel={primaryEpisode ? `${primaryEpisode.order}. ${primaryEpisode.title}` : ""}
                    primaryEpisodeReady={Boolean(primaryEpisode?.summary.trim())}
                    onCreateCanvas={() => setCreateCanvasOpen(true)}
                    onDescriptionDraftChange={setDescriptionDraft}
                    onImportEpisode={() => setEpisodeImportOpen(true)}
                    onManageEpisodes={() => setEpisodeImportOpen(true)}
                    onOpenAgent={() => router.push(`/projects/${project.id}/agents`)}
                    onOpenCanvas={openPrimaryCanvas}
                    onOpenPrimaryEpisode={() => {
                        if (primaryEpisode) router.push(`/projects/${project.id}/episodes/${primaryEpisode.id}/workbench`);
                        else setEpisodeImportOpen(true);
                    }}
                    onRunSuggestion={runOverviewAction}
                    onSaveDescription={saveDescription}
                />

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
                                <div className="grid gap-4">
                                    <LocalAiTaskLogPanel projectId={project.id} />
                                    <section className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2 text-base font-medium">
                                                    <Workflow className="size-5" />
                                                    本集生产流程
                                                </div>
                                                <p className="mt-1 text-sm text-stone-500">按集进入导演分析、服化道美术设计、Seedance 分镜和人工确认写入。</p>
                                            </div>
                                        <Button size="small" icon={<ScrollText className="size-3.5" />} onClick={() => setEpisodeImportOpen(true)}>
                                            导入本集剧本
                                            </Button>
                                        </div>
                                        {projectEpisodes.length ? (
                                            <div className="mt-4 grid gap-2">
                                                {projectEpisodes.map((episode) => {
                                                    const episodeCanvas = projectCanvases.find((canvas) => canvas.episodeId === episode.id);
                                                    return (
                                                        <div key={episode.id} className="flex flex-col gap-3 rounded-lg bg-stone-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-medium">
                                                                        {episode.order}. {episode.title}
                                                                    </span>
                                                                    <Tag className="m-0" color={episode.summary.trim() ? "green" : "orange"}>
                                                                        {episode.summary.trim() ? "已有剧本" : "缺少剧本"}
                                                                    </Tag>
                                                                    <Tag className="m-0">{episodeCanvas ? `已绑定画布：${episodeCanvas.title}` : "未绑定画布"}</Tag>
                                                                </div>
                                                                <div className="mt-1 line-clamp-1 text-xs text-stone-500">{episode.summary || "可先导入本集剧本，再进入生产流程。"}</div>
                                                            </div>
                                                            <Button type="primary" size="small" onClick={() => router.push(`/projects/${project.id}/episodes/${episode.id}/workbench`)}>
                                                                生产流程
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分集。先导入本集剧本，再进入生产流程。" className="py-8" />
                                        )}
                                    </section>
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        <EntryCard
                                            icon={<ScrollText className="size-5" />}
                                            title="本集生产流程"
                                            description="先导入剧本并完成 Agent 分析，最后再创建画布承接结果"
                                            onOpen={() => {
                                                const firstEpisode = projectEpisodes[0];
                                                if (firstEpisode) router.push(`/projects/${project.id}/episodes/${firstEpisode.id}/workbench`);
                                                else setEpisodeImportOpen(true);
                                            }}
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
                                        <EntryCard icon={<Bot className="size-5" />} title="Agent 工作台" description="全项目 Agent 控制台，保留配置、模板预览和草案记录" onOpen={() => router.push(`/projects/${project.id}/agents`)} />
                                        <EntryLink icon={<Bot className="size-5" />} title="Agent 任务中心" description="查看旧的本地 Skill 任务预览与应用记录" href={`/projects/${project.id}/agent`} />
                                    </div>
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
                                    missingOnly={missingOnlyFilter}
                                    missingItems={missingMaterialItems}
                                    onMissingOnlyChange={setMissingOnlyFilter}
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
                modalTitle="最后创建画布"
                helperText="画布用于承接分镜、提示词和视频配置节点。建议先在本集生产流程完成分析与审核，再作为最后一步创建或绑定画布。"
                onCancel={() => setCreateCanvasOpen(false)}
                onCreate={createCanvasAndOpen}
            />
            <Modal
                title="导入本集剧本"
                open={episodeImportOpen}
                onCancel={() => setEpisodeImportOpen(false)}
                onOk={() => void importEpisodeAndOpen()}
                okText="导入并进入生产流程"
                cancelText="取消"
                destroyOnHidden
            >
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

function ProjectCommandCenter({
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
        <section className="grid gap-5 border-y border-stone-200 py-5 dark:border-stone-800 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            <Workflow className="size-3.5" />
                            生产主线
                        </div>
                        <h2 className="mt-2 text-xl font-semibold">{primaryEpisodeLabel || "先建立本集内容"}</h2>
                        <p className="mt-2 text-sm text-stone-500">{primaryEpisodeLabel ? (primaryEpisodeReady ? "剧本已就绪，可进入导演分析、服化道和 Seedance 分镜流程。" : "当前集还缺少剧本文本，先补齐剧本再进入生产流程。") : "项目页先围绕单集推进，避免在画布、分镜和素材入口之间来回找。"}</p>
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
                    <div className="flex flex-col gap-3 rounded-lg bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{primarySuggestion.title}</div>
                            <div className="mt-1 text-sm text-stone-500">{primarySuggestion.description}</div>
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
            className={`rounded-lg border px-3 py-2 text-left transition hover:bg-stone-50 dark:hover:bg-white/5 ${
                tone === "warning" ? "border-amber-300 text-amber-600 dark:border-amber-900/70" : "border-stone-200 text-stone-500 dark:border-stone-800"
            }`}
            onClick={onClick}
        >
            <div className="text-xs">{label}</div>
            <div className="mt-1 text-lg font-semibold text-stone-950 dark:text-stone-100">{value}</div>
        </button>
    );
}

function ProjectOverviewDashboardView({ dashboard, onAction }: { dashboard: ProjectOverviewDashboard; onAction: (target: ProjectOverviewActionTarget) => void }) {
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
                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-medium">下一步建议</div>
                            <p className="mt-1 text-sm text-stone-500">优先展示当前最该处理的创作动作。</p>
                        </div>
                    </div>
                    {dashboard.suggestions.length ? (
                        <div className="mt-3 divide-y divide-stone-200 dark:divide-stone-800">
                            {dashboard.suggestions.map((suggestion) => (
                                <div key={suggestion.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="font-medium text-stone-950 dark:text-stone-100">{suggestion.title}</div>
                                        <div className="mt-1 text-sm text-stone-500">{suggestion.description}</div>
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
                    <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                        <div className="text-base font-medium">项目状态</div>
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

                    <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-base font-medium">Agent 摘要</div>
                            <Button size="small" onClick={() => onAction({ type: "agent" })}>
                                打开 Agent
                            </Button>
                        </div>
                        {dashboard.recentAgentTasks.length ? (
                            <div className="mt-3 divide-y divide-stone-200 dark:divide-stone-800">
                                {dashboard.recentAgentTasks.map((task) => (
                                    <div key={task.id} className="py-2 first:pt-0 last:pb-0">
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
        <button type="button" className="rounded-lg border border-stone-200 px-3 py-2 text-left transition hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-white/5" onClick={onClick}>
            <div className="flex items-center gap-2 text-xs text-stone-500">
                {icon}
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold text-stone-950 dark:text-stone-100">{value}</div>
        </button>
    );
}

function OverviewStatChip({ label, value, tone = "default", onClick }: { label: string; value: string | number; tone?: "default" | "warning" | "danger"; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`rounded-full border px-2.5 py-1 text-xs transition hover:bg-stone-50 dark:hover:bg-white/5 ${
                tone === "danger" ? "border-red-300 text-red-600 dark:border-red-900/70" : tone === "warning" ? "border-amber-300 text-amber-600 dark:border-amber-900/70" : "border-stone-200 text-stone-500 dark:border-stone-800"
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

type ProjectMissingMaterialItem = {
    id: string;
    sourceLabel: string;
    title: string;
    description: string;
    actionLabel: string;
    action: { type: "production-bible"; kind?: ProductionBibleKind } | { type: "storyboard"; groupId?: string; shotId?: string } | { type: "asset"; asset: Asset };
};

function ProjectAssetReferencesView({
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
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
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
                <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/70 dark:bg-amber-950/10">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag color="warning" className="m-0">
                                {item.sourceLabel}
                            </Tag>
                            <div className="font-medium text-stone-950 dark:text-stone-100">{item.title}</div>
                        </div>
                        <div className="mt-2 text-sm text-stone-600 dark:text-stone-400">{item.description}</div>
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
