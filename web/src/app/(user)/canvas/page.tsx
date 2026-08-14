"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Empty, Input, Select, Tooltip } from "antd";
import { Plus, Search } from "lucide-react";

import { useEffectiveConfig } from "@/stores/use-config-store";
import { canvasIdsForCreativeProject } from "../projects/creative-projects";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { CanvasCreateProjectModal } from "./components/canvas-create-project-modal";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "./components/canvas-project-card";
import { useCanvasStore } from "./stores/use-canvas-store";
import type { CanvasProjectPreset } from "./utils/canvas-project-preset";

const ALL_PROJECTS = "__all__";

export default function CanvasPage() {
    return (
        <Suspense fallback={null}>
            <CanvasPageContent />
        </Suspense>
    );
}

function CanvasPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const [keyword, setKeyword] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const projectsHydrated = useCreativeProjectStore((state) => state.hydrated);
    const projects = useCreativeProjectStore((state) => state.projects);
    const attachCanvas = useCreativeProjectStore((state) => state.attachCanvas);
    const canvasesHydrated = useCanvasStore((state) => state.hydrated);
    const canvases = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const activeProjectId = projects.some((project) => project.id === searchParams.get("projectId")) ? searchParams.get("projectId") || ALL_PROJECTS : ALL_PROJECTS;
    const activeProject = projects.find((project) => project.id === activeProjectId);
    const canvasProjectMap = useMemo(() => {
        const result = new Map<string, string>();
        projects.forEach((project) => canvasIdsForCreativeProject(project, canvases).forEach((canvasId) => result.set(canvasId, project.id)));
        return result;
    }, [canvases, projects]);
    const visibleCanvases = useMemo(() => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        return [...canvases]
            .filter((canvas) => activeProjectId === ALL_PROJECTS || canvasProjectMap.get(canvas.id) === activeProjectId)
            .filter((canvas) => !normalizedKeyword || `${canvas.title} ${canvas.episodeTitle || ""}`.toLowerCase().includes(normalizedKeyword))
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }, [activeProjectId, canvasProjectMap, canvases, keyword]);
    const projectOptions = useMemo(() => [{ label: "所有项目", value: ALL_PROJECTS }, ...[...projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map((project) => ({ label: project.title, value: project.id }))], [projects]);
    const loading = !projectsHydrated || !canvasesHydrated;

    const changeProject = (projectId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (projectId === ALL_PROJECTS) params.delete("projectId");
        else params.set("projectId", projectId);
        const query = params.toString();
        router.replace(query ? `/canvas?${query}` : "/canvas");
    };

    const openCreate = () => {
        if (!activeProject) return message.warning("请先选择画布所属项目");
        setCreateOpen(true);
    };

    const createAndOpen = (title: string, preset: CanvasProjectPreset) => {
        if (!activeProject) return;
        const canvasId = createCanvas(title, preset, { projectId: activeProject.id });
        attachCanvas(activeProject.id, canvasId);
        setCreateOpen(false);
        router.push(`/canvas/${canvasId}`);
    };

    return (
        <main className="studio-shell h-full min-h-0 overflow-y-auto px-4 py-4 xl:px-6">
            <div className="mx-auto max-w-[1440px] pb-8">
                <header className="studio-toolbar flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <h1 className="shrink-0 text-xl font-semibold text-[var(--studio-text-primary)]">画布</h1>
                        <span className="text-[var(--studio-text-muted)]">/</span>
                        <Select showSearch className="min-w-0 flex-1 sm:w-60 sm:flex-none" value={activeProjectId} optionFilterProp="label" options={projectOptions} onChange={changeProject} aria-label="切换画布项目" />
                        <span className="shrink-0 text-sm tabular-nums text-[var(--studio-text-muted)]">{visibleCanvases.length}</span>
                    </div>
                    <div className="flex min-w-0 gap-2">
                        <Input allowClear className="min-w-0 flex-1 sm:w-64 sm:flex-none" prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} value={keyword} placeholder="搜索画布" onChange={(event) => setKeyword(event.target.value)} />
                    </div>
                </header>

                {loading ? (
                    <section className="studio-panel mt-4 flex min-h-[420px] items-center justify-center text-sm text-[var(--studio-text-muted)]">正在加载画布...</section>
                ) : visibleCanvases.length || (activeProject && !keyword) ? (
                    <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {visibleCanvases.map((canvas) => {
                            const projectId = canvasProjectMap.get(canvas.id);
                            return <CanvasProjectCard key={canvas.id} project={canvas} projectTitle={projects.find((project) => project.id === projectId)?.title || "未绑定项目"} />;
                        })}
                        {activeProject && !keyword ? (
                            <Tooltip title="新建画布">
                                <button
                                    type="button"
                                    className="studio-panel flex min-h-52 cursor-pointer items-center justify-center text-[var(--studio-text-muted)] transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-accent)]"
                                    onClick={openCreate}
                                    aria-label="新建画布"
                                >
                                    <Plus className="size-7" />
                                </button>
                            </Tooltip>
                        ) : null}
                    </section>
                ) : (
                    <section className="studio-panel mt-4 flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword ? "没有匹配的画布" : activeProject ? "当前项目还没有画布" : "还没有画布"} />
                    </section>
                )}
            </div>

            <CanvasCreateProjectModal
                open={createOpen}
                defaultTitle={`${activeProject?.title || "项目"} 画布 ${visibleCanvases.length + 1}`}
                initialPreset={activeProject?.preset}
                config={config}
                modalTitle="新建项目画布"
                helperText="画布会直接绑定当前项目；后续资产、分镜和生成结果继续沿用该项目上下文。"
                onCancel={() => setCreateOpen(false)}
                onCreate={createAndOpen}
            />
            <CanvasDeleteProjectsDialog />
        </main>
    );
}
