"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Empty, Spin } from "antd";

import { useScriptStore } from "../../../../../canvas/stores/use-script-store";
import { videoWorkflowEpisodeKey, videoWorkflowHref, videoWorkflowProjectSlug } from "../../../../../original-workflow/video-workflow-routing";
import { useCreativeProjectStore } from "../../../../use-creative-project-store";

export default function EpisodeProductionWorkbenchRedirectPage() {
    const params = useParams<{ id: string; episodeId: string }>();
    const router = useRouter();
    const { message } = App.useApp();
    const projectId = params.id;
    const episodeId = params.episodeId;
    const projectHydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
    const episode = useScriptStore((state) => state.episodes.find((item) => item.id === episodeId && item.projectId === projectId));
    const redirectStartedRef = useRef(false);
    const [redirecting, setRedirecting] = useState(false);

    useEffect(() => {
        if (!projectHydrated || !scriptsHydrated || !project || !episode || redirectStartedRef.current) return;
        let cancelled = false;
        const href = videoWorkflowHref(episode.order, project.id, episode.id);
        const episodeKey = videoWorkflowEpisodeKey(episode.order, project.id);
        const projectSlug = videoWorkflowProjectSlug(project.id);
        const scriptText = episode.summary;
        redirectStartedRef.current = true;
        setRedirecting(true);

        async function syncAndRedirect() {
            try {
                const response = await fetch("/api/original-workflow", {
                    body: JSON.stringify({
                        action: "save-script",
                        content: scriptText,
                        episode: episodeKey,
                        projectSlug,
                    }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                });
                if (!response.ok) throw new Error("同步视频工作流剧本失败");
            } catch (error) {
                if (!cancelled) message.warning(error instanceof Error ? error.message : "同步视频工作流剧本失败");
            } finally {
                if (!cancelled) router.replace(href);
            }
        }

        void syncAndRedirect();
        return () => {
            cancelled = true;
        };
    }, [episode, message, project, projectHydrated, router, scriptsHydrated]);

    if (!projectHydrated || !scriptsHydrated || redirecting) {
        return (
            <main className="studio-workspace studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]">
                <Spin description="正在打开视频工作流" />
            </main>
        );
    }

    if (!project || !episode) {
        return (
            <main className="studio-workspace studio-shell h-full overflow-auto px-6 py-10 text-[var(--studio-text-primary)]">
                <div className="mx-auto max-w-3xl">
                    <Empty description="项目或集数不存在">
                        <Button href={project ? `/projects/${project.id}` : "/projects"}>返回项目</Button>
                    </Empty>
                </div>
            </main>
        );
    }

    return (
        <main className="studio-workspace studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]">
            <Spin description="正在打开视频工作流" />
        </main>
    );
}
