"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useScriptStore } from "@/app/(user)/canvas/stores/use-script-store";
import { buildEpisodeScriptSnapshot } from "@/app/(user)/canvas/utils/canvas-episode-context";
import { orderedScriptScenes } from "@/app/(user)/canvas/utils/script-management";
import { useCreativeProjectStore } from "@/app/(user)/projects/use-creative-project-store";
import { useVideoPackageStore } from "@/app/(user)/video/use-video-package-store";
import { ensureWorkflowRun, getWorkflowRun, getWorkflowWorkerHealth, listWorkflowEvents, type RemoteWorkflowEvent, type RemoteWorkflowRunDetail, type WorkflowWorkerHealth } from "@/services/api/workflow-runs";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import { normalizeWorkflowRouteState, workflowRouteSearch, type WorkflowStageKey } from "./workflow-route-state";
import { summarizeWorkflowStages } from "./workflow-stage-summary";

export function useWorkflowWorkbench(projectId: string, episodeId: string) {
    const searchParams = useSearchParams();
    const token = useUserStore((state) => state.token);
    const projectHydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const scriptsHydrated = useScriptStore((state) => state.hydrated);
    const episode = useScriptStore((state) => state.episodes.find((item) => item.id === episodeId && item.projectId === projectId));
    const scenes = useScriptStore((state) => state.scenes);
    const importedPackages = useVideoPackageStore((state) => state.importedPackages);
    const effectiveConfig = useEffectiveConfig();
    const [detail, setDetail] = useState<RemoteWorkflowRunDetail | null>(null);
    const [health, setHealth] = useState<WorkflowWorkerHealth | null>(null);
    const [events, setEvents] = useState<RemoteWorkflowEvent[]>([]);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [remoteError, setRemoteError] = useState("");

    const episodeScenes = useMemo(() => orderedScriptScenes(scenes, episodeId), [episodeId, scenes]);
    const scriptSnapshot = useMemo(() => (episode ? buildEpisodeScriptSnapshot(episode, episodeScenes) : ""), [episode, episodeScenes]);
    const packages = useMemo(
        () => importedPackages.filter((item) => item.projectId === projectId && item.episodeId === episodeId).sort((left, right) => left.order - right.order),
        [episodeId, importedPackages, projectId],
    );
    const routeState = useMemo(
        () => normalizeWorkflowRouteState({ shot: searchParams.get("shot"), stage: searchParams.get("stage") }, packages.map((item) => ({ id: item.id, status: packageRouteStatus(item) }))),
        [packages, searchParams],
    );
    const selectedPackage = packages.find((item) => item.id === routeState.shot) || packages[0] || null;

    const refreshRemote = useCallback(async (runId?: string) => {
        try {
            const [nextHealth, nextDetail] = await Promise.all([getWorkflowWorkerHealth(), runId ? getWorkflowRun(runId) : Promise.resolve(null)]);
            setHealth(nextHealth);
            if (nextDetail) {
                setDetail(nextDetail);
                const nextEvents = await listWorkflowEvents(nextDetail.run.id, 0, 80);
                setEvents(nextEvents);
            }
            setRemoteError("");
        } catch (error) {
            setRemoteError(error instanceof Error ? error.message : "工作流状态读取失败");
        }
    }, []);

    useEffect(() => {
        if (!projectHydrated || !scriptsHydrated || !project || !episode || !scriptSnapshot.trim() || !token) return;
        let cancelled = false;
        setRemoteLoading(true);
        ensureWorkflowRun({ episodeId, projectId, scriptConfirmed: true, scriptSnapshot })
            .then(async (nextDetail) => {
                if (cancelled) return;
                setDetail(nextDetail);
                await refreshRemote(nextDetail.run.id);
            })
            .catch((error) => {
                if (!cancelled) setRemoteError(error instanceof Error ? error.message : "工作流创建失败");
            })
            .finally(() => {
                if (!cancelled) setRemoteLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [episode, episodeId, project, projectHydrated, projectId, refreshRemote, scriptSnapshot, scriptsHydrated, token]);

    const hasActiveRemoteStage = detail?.stages.some((stage) => ["queued", "running", "cancel_requested"].includes(stage.status));
    useEffect(() => {
        if (!detail?.run.id || !hasActiveRemoteStage) return;
        const timer = window.setInterval(() => void refreshRemote(detail.run.id), document.hidden ? 6000 : 2000);
        return () => window.clearInterval(timer);
    }, [detail?.run.id, hasActiveRemoteStage, refreshRemote]);

    useEffect(() => {
        const normalized = workflowRouteSearch(routeState);
        if (normalized === searchParams.toString()) return;
        window.history.replaceState(null, "", `${window.location.pathname}?${normalized}`);
    }, [routeState, searchParams]);

    const stageViews = useMemo(
        () =>
            summarizeWorkflowStages({
                generatedCount: packages.filter((item) => item.generation?.status === "succeeded" || item.canvasStatus === "已生成").length,
                missingAssetCount: packages.filter((item) => item.assetStatus !== "完整").length,
                packageCount: packages.length,
                remoteStages: detail?.stages,
                scriptReady: Boolean(scriptSnapshot.trim()),
                workerReady: Boolean(health?.ready),
            }),
        [detail?.stages, health?.ready, packages, scriptSnapshot],
    );
    const completedCount = stageViews.filter((stage) => ["approved", "applied", "complete"].includes(stage.status)).length;
    const blockerCount = stageViews.filter((stage) => ["blocked", "failed", "rejected"].includes(stage.status)).length;

    const selectRoute = useCallback(
        (stage: WorkflowStageKey, shot = routeState.shot) => {
            const next = workflowRouteSearch(normalizeWorkflowRouteState({ shot, stage }, packages.map((item) => item.id)));
            window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
        },
        [packages, routeState.shot],
    );
    const continueNext = useCallback(() => {
        const currentIndex = stageViews.findIndex((stage) => stage.key === routeState.stage);
        const next = stageViews.find((stage, index) => index > currentIndex && !["approved", "applied", "complete"].includes(stage.status)) || stageViews.find((stage) => !["approved", "applied", "complete"].includes(stage.status));
        if (next) selectRoute(next.key);
    }, [routeState.stage, selectRoute, stageViews]);

    return {
        blockerCount,
        completedCount,
        continueNext,
        detail,
        episode,
        events,
        health,
        isHydrated: projectHydrated && scriptsHydrated,
        modelSummary: effectiveConfig.videoModel || effectiveConfig.model || "未配置",
        packages,
        progress: Math.round((completedCount / stageViews.length) * 100),
        project,
        refreshRemote: () => refreshRemote(detail?.run.id),
        remoteError,
        remoteLoading,
        routeState,
        scriptSnapshot,
        selectRoute,
        selectedPackage,
        stageViews,
    };
}

function packageRouteStatus(item: ReturnType<typeof useVideoPackageStore.getState>["importedPackages"][number]) {
    if (item.risks.some((risk) => risk.level === "阻断") || item.assetStatus !== "完整") return "blocked" as const;
    if (item.promptStatus !== "已确认") return "review" as const;
    if (["checking", "creating", "queued", "running"].includes(item.generation?.status || "")) return "running" as const;
    if (item.generation?.status === "succeeded" || item.canvasStatus === "已生成") return "complete" as const;
    return "incomplete" as const;
}
