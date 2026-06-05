"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Empty, Input, Select, Tabs, Tag } from "antd";
import { Bot, BookOpen, Clapperboard, FileText, Images, ListVideo, Maximize2, Plus, ScrollText, Save } from "lucide-react";

import { useAssetStore } from "@/stores/use-asset-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasCreateProjectModal } from "../../canvas/components/canvas-create-project-modal";
import { useCanvasStore } from "../../canvas/stores/use-canvas-store";
import { useGenerationQueueStore } from "../../canvas/stores/use-generation-queue-store";
import { useProductionBibleStore } from "../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../canvas/stores/use-storyboard-store";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../../canvas/utils/canvas-project-preset";
import { assetGenerationRecords } from "../../assets/asset-generation";
import { canvasIdsForCreativeProject, unfiledCanvasProjects } from "../creative-projects";
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
    const storyboardGroups = useStoryboardStore((state) => state.groups);
    const storyboardShots = useStoryboardStore((state) => state.shots);
    const bibleItems = useProductionBibleStore((state) => state.items);
    const queueItems = useGenerationQueueStore((state) => state.items);
    const assets = useAssetStore((state) => state.assets);
    const [createCanvasOpen, setCreateCanvasOpen] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState(project?.description || "");
    const [bindingCanvasId, setBindingCanvasId] = useState("");
    const canvasIds = useMemo(() => (project ? canvasIdsForCreativeProject(project, canvases) : []), [canvases, project]);
    const projectCanvases = useMemo(() => canvases.filter((canvas) => canvasIds.includes(canvas.id)), [canvasIds, canvases]);
    const unboundCanvases = useMemo(() => unfiledCanvasProjects(canvases, project ? [project] : []), [canvases, project]);
    const projectAssets = useMemo(() => assets.filter((asset) => assetGenerationRecords(asset).some((generation) => generation.projectId === projectId || canvasIds.includes(String(generation.projectId || "")))), [assets, canvasIds, projectId]);
    const stats = {
        canvases: projectCanvases.length,
        episodes: episodes.filter((item) => item.projectId === projectId).length,
        scenes: scenes.filter((item) => episodes.some((episode) => episode.projectId === projectId && episode.id === item.episodeId)).length,
        storyboardGroups: storyboardGroups.filter((item) => item.projectId === projectId).length,
        storyboardShots: storyboardShots.filter((shot) => storyboardGroups.some((group) => group.projectId === projectId && group.id === shot.groupId)).length,
        bibleItems: bibleItems.filter((item) => item.projectId === projectId).length,
        queueItems: queueItems.filter((item) => item.projectId === projectId).length,
        assets: projectAssets.length,
    };

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
                    defaultActiveKey="overview"
                    items={[
                        {
                            key: "overview",
                            label: "总览",
                            children: (
                                <div className="grid gap-4 md:grid-cols-4">
                                    <StatCard label="画布" value={stats.canvases} />
                                    <StatCard label="分集 / 场次" value={`${stats.episodes} / ${stats.scenes}`} />
                                    <StatCard label="分镜" value={`${stats.storyboardGroups} 组 · ${stats.storyboardShots} 条`} />
                                    <StatCard label="素材" value={stats.assets} />
                                </div>
                            ),
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
                                                <Link
                                                    key={canvas.id}
                                                    href={`/canvas/${canvas.id}`}
                                                    className="rounded-xl border border-stone-200 p-4 text-stone-950 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-100 dark:hover:bg-white/5"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="truncate font-medium">{canvas.title}</span>
                                                        <Tag className="m-0">{canvas.nodes.length} 节点</Tag>
                                                    </div>
                                                </Link>
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
                                    <EntryCard icon={<ScrollText className="size-5" />} title="剧本" description={`${stats.episodes} 个分集，${stats.scenes} 个场次`} onOpen={openPrimaryCanvas} />
                                    <EntryCard icon={<Clapperboard className="size-5" />} title="分镜" description={`${stats.storyboardGroups} 个分镜组，${stats.storyboardShots} 条分镜`} onOpen={openPrimaryCanvas} />
                                    <EntryCard icon={<BookOpen className="size-5" />} title="设定库" description={`${stats.bibleItems} 个角色 / 场景 / 道具设定`} onOpen={openPrimaryCanvas} />
                                    <EntryLink icon={<Images className="size-5" />} title="素材" description="查看当前项目生成和引用素材" href={`/assets?projectId=${project.id}`} />
                                    <EntryLink icon={<FileText className="size-5" />} title="提示词" description="进入提示词仓库复用模板" href="/prompts" />
                                    <EntryCard icon={<ListVideo className="size-5" />} title="队列" description={`${stats.queueItems} 个本地队列项`} onOpen={openPrimaryCanvas} />
                                    <EntryCard icon={<Bot className="size-5" />} title="Agent" description="预留入口，暂不自动执行生成" disabled />
                                </div>
                            ),
                        },
                    ]}
                />
            </div>

            <CanvasCreateProjectModal open={createCanvasOpen} defaultTitle={`${project.title} 画布 ${projectCanvases.length + 1}`} config={effectiveConfig} onCancel={() => setCreateCanvasOpen(false)} onCreate={createCanvasAndOpen} />
        </main>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
            <div className="text-xs text-stone-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
    );
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
