"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Empty, Spin, Tag } from "antd";

import { useCanvasStore } from "../../../canvas/stores/use-canvas-store";
import { useScriptStore } from "../../../canvas/stores/use-script-store";
import { AgentWorkspacePanel } from "../../agent-settings-drawer";
import { useCreativeProjectStore } from "../../use-creative-project-store";

export default function ProjectAgentWorkspacePage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = params.id;
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const canvases = useCanvasStore((state) => state.projects);
    const updateCanvas = useCanvasStore((state) => state.updateProject);
    const episodes = useScriptStore((state) => state.episodes);
    const requestedCanvasId = searchParams.get("canvasId") || "";
    const requestedEpisodeId = searchParams.get("episodeId") || "";
    const canvas = useMemo(() => canvases.find((item) => item.id === requestedCanvasId && item.projectId === projectId), [canvases, projectId, requestedCanvasId]);
    const episodeId = canvas?.episodeId || requestedEpisodeId || undefined;
    const episodeTitle = canvas?.episodeTitle || episodes.find((item) => item.id === episodeId)?.title;

    if (!hydrated) {
        return (
            <main className="grid h-full place-items-center bg-background px-6 py-10 text-stone-950 dark:text-stone-100">
                <Spin description="正在读取本地项目" />
            </main>
        );
    }

    if (!project) {
        return (
            <main className="h-full overflow-auto bg-background px-6 py-10 text-stone-950 dark:text-stone-100">
                <div className="mx-auto max-w-3xl">
                    <Empty description="项目不存在或尚未加载">
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button href={`/projects/${projectId}/agent`}>打开旧 Agent 任务中心</Button>
                            <Button href="/projects">返回项目工作台</Button>
                        </div>
                    </Empty>
                </div>
            </main>
        );
    }

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="border-b border-stone-200 pb-6 dark:border-stone-800">
                    <Link href={`/projects/${project.id}`} className="text-xs text-stone-500 hover:text-stone-950 dark:hover:text-stone-100">
                        {project.title}
                    </Link>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-semibold">Agent 工作台</h1>
                            <p className="mt-2 text-sm text-stone-500">项目级统一入口；保留 workflow、单 Agent 配置、映射预览和草案记录，不在这里触发图片或视频生成。</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button href={`/projects/${project.id}/agent`}>打开旧 Agent 任务中心</Button>
                            {canvas ? <Tag className="m-0">{canvas.title}</Tag> : null}
                            {episodeTitle ? <Tag className="m-0">{episodeTitle}</Tag> : null}
                            {requestedCanvasId && !canvas ? <Tag className="m-0">未找到画布上下文</Tag> : null}
                        </div>
                    </div>
                </header>

                <AgentWorkspacePanel
                    projectId={project.id}
                    projectTitle={project.title}
                    canvasId={canvas?.id}
                    episodeId={episodeId}
                    episodeTitle={episodeTitle}
                    canvasNodes={canvas?.nodes}
                    onApplyVideoPreviewNodes={
                        canvas
                            ? ({ nodes, focusNodeIds }) => {
                                  updateCanvas(canvas.id, { nodes });
                                  if (focusNodeIds[0]) router.push(`/canvas/${canvas.id}?focusNodeId=${focusNodeIds[0]}`);
                              }
                            : undefined
                    }
                />
            </div>
        </main>
    );
}
