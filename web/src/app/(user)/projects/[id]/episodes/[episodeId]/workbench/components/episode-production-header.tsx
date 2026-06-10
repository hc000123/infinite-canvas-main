"use client";

import Link from "next/link";
import { Button } from "antd";

import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { padEpisodeOrder } from "../episode-workbench-display";
import { EpisodeStatusPill } from "./episode-module-panel";

export function EpisodeProductionHeader({
    boundCanvas,
    currentPhase,
    episode,
    nextActionText,
    onBackProject,
    onOpenCanvas,
    project,
}: {
    boundCanvas?: CanvasProject;
    currentPhase: string;
    episode: ScriptEpisode;
    nextActionText: string;
    onBackProject: () => void;
    onOpenCanvas: () => void;
    project: { id: string; title: string };
}) {
    return (
        <header className="border-b border-slate-800/80 px-6 py-5 xl:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                        <Link href={`/projects/${project.id}`} className="text-cyan-300/85 hover:text-cyan-200">
                            {project.title}
                        </Link>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        <h1 className="break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title}</h1>
                        <EpisodeStatusPill status={currentPhase} tone="cyan" />
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">建议下一步：{nextActionText}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button className="!border-slate-700 !bg-slate-950/50 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" onClick={onBackProject}>
                        返回项目
                    </Button>
                    <Button type="primary" onClick={onOpenCanvas}>
                        {boundCanvas ? "进入画布" : "创建承接画布"}
                    </Button>
                </div>
            </div>
        </header>
    );
}
