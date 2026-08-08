"use client";

import Link from "next/link";
import { Button } from "antd";
import { Workflow } from "lucide-react";

import { agentWorkspaceHref } from "@/app/(user)/projects/agent-workspace-route";
import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { padEpisodeOrder } from "../episode-workbench-display";
import { EpisodeStatusPill } from "./episode-module-panel";

export function EpisodeProductionHeader({
    boundCanvas,
    currentPhase,
    episode,
    legacyWorkflowVisible = true,
    nextActionText,
    onBackProject,
    onOpenCanvas,
    project,
}: {
    boundCanvas?: CanvasProject;
    canRunFullWorkflow: boolean;
    currentPhase: string;
    episode: ScriptEpisode;
    fullWorkflowRunning: boolean;
    legacyWorkflowVisible?: boolean;
    nextActionText: string;
    onBackProject: () => void;
    onOpenCanvas: () => void;
    onOpenOriginalWorkflow: () => void;
    onRunFullWorkflow: () => void;
    openingOriginalWorkflow?: boolean;
    project: { id: string; title: string };
}) {
    return (
        <header className="border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-5 py-4 backdrop-blur-xl xl:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--studio-text-muted)]">
                        <Link href={`/projects/${project.id}`} className="text-[var(--studio-accent)] transition hover:text-[var(--studio-accent-hover)]">
                            {project.title}
                        </Link>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        <h1 className="break-words text-3xl font-semibold leading-tight text-[var(--studio-text-primary)]">{episode.title}</h1>
                        <EpisodeStatusPill status={currentPhase} tone="cyan" />
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-[var(--studio-text-muted)]">建议下一步：{nextActionText}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {legacyWorkflowVisible ? (
                        <Button className="!h-9 !rounded-md !px-3" href={agentWorkspaceHref({ projectId: project.id, episodeId: episode.id, stage: "script" })} icon={<Workflow className="size-4" />} type="primary">
                            打开 Agent
                        </Button>
                    ) : (
                        <Button className="!h-9 !rounded-md !px-3" href={agentWorkspaceHref({ projectId: project.id, episodeId: episode.id, stage: "script" })} icon={<Workflow className="size-4" />} type="primary">
                            继续 Agent 生产
                        </Button>
                    )}
                    <Button className="!h-9 !rounded-md !px-3" onClick={onBackProject}>
                        返回项目
                    </Button>
                    {legacyWorkflowVisible && boundCanvas ? (
                        <Button className="!h-9 !rounded-md !px-3" type="primary" onClick={onOpenCanvas}>
                            进入关联画布
                        </Button>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
