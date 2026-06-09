"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Empty, Spin, Tag } from "antd";

import { useCanvasStore } from "../../../canvas/stores/use-canvas-store";
import { useScriptStore } from "../../../canvas/stores/use-script-store";
import { AgentWorkspacePanel } from "../../agent-settings-drawer";
import type { AgentConfigKind } from "../../agent-settings";
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
    const requestedAgentKind = parseAgentKind(searchParams.get("agentKind"));
    const requestedStageId = searchParams.get("stageId") || undefined;
    const requestedTab = parseAgentTab(searchParams.get("tab"));
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
                            <h1 className="text-3xl font-semibold">Agent 设置</h1>
                            <p className="mt-2 text-sm text-stone-500">项目级设置入口；集中维护通用模型配置、Agent 模板、提示词和写入策略，流程执行回到本集生产流程中完成。</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
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
                    initialAgentKind={requestedAgentKind}
                    initialStageId={requestedStageId}
                    initialTab={requestedTab === "workflow" ? "quick-agents" : requestedTab}
                    settingsOnly
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

function parseAgentKind(value: string | null): AgentConfigKind | undefined {
    return ["asset_extractor", "storyboard_director", "image_brief_builder", "video_prompt_builder", "prompt_reviewer"].includes(value || "") ? (value as AgentConfigKind) : undefined;
}

function parseAgentTab(value: string | null): "quick-agents" | "workflow" | undefined {
    return value === "quick-agents" || value === "workflow" ? value : undefined;
}
