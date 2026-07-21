"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Spin } from "antd";

export default function EpisodeProductionWorkbenchRedirectPage() {
    const params = useParams<{ episodeId: string; id: string }>();
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const next = new URLSearchParams(searchParams.toString());
        if (!next.get("stage")) next.set("stage", "script");
        router.replace(`/projects/${encodeURIComponent(params.id)}/episodes/${encodeURIComponent(params.episodeId)}/workflow?${next.toString()}`);
    }, [params.episodeId, params.id, router, searchParams]);

    return <main className="studio-workspace studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Spin description="正在打开统一视频工作流" /></main>;
}
