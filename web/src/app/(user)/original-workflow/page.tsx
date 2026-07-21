"use client";

import { Button, Result } from "antd";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OriginalWorkflowPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = searchParams.get("sourceProjectId") || "";
    const episodeId = searchParams.get("sourceEpisodeId") || "";

    useEffect(() => {
        if (projectId && episodeId) router.replace(`/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/workflow`);
    }, [episodeId, projectId, router]);

    return (
        <main className="min-h-[calc(100vh-56px)] bg-[var(--studio-page-bg)] p-4 sm:p-6">
            <section className="studio-panel mx-auto grid min-h-[520px] max-w-4xl place-items-center p-6">
                <Result
                    status="info"
                    title={projectId && episodeId ? "正在打开统一视频工作流" : "视频工作流已合并到项目分集"}
                    subTitle={projectId && episodeId ? "正在恢复当前项目、分集、阶段和分镜上下文。" : "请先进入一个项目并选择分集，再从分集页打开视频工作流。导演、美术、资产、分镜、视频和交付现在都在同一页面完成。"}
                    extra={[
                        <Button key="projects" type="primary" onClick={() => router.push("/projects")}>
                            选择项目
                        </Button>,
                    ]}
                />
            </section>
        </main>
    );
}
