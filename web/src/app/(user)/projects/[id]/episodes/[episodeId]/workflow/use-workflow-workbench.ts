"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useScriptStore } from "@/app/(user)/canvas/stores/use-script-store";
import { buildEpisodeScriptSnapshot } from "@/app/(user)/canvas/utils/canvas-episode-context";
import { orderedScriptScenes } from "@/app/(user)/canvas/utils/script-management";
import { useCreativeProjectStore } from "@/app/(user)/projects/use-creative-project-store";
import { agentWorkspaceHref } from "@/app/(user)/projects/agent-workspace-route";
import { useVideoPackageStore } from "@/app/(user)/video/use-video-package-store";
import { ensureWorkflowRun, getWorkflowRun, pollWorkflowRun, type RemoteWorkflowEvent, type RemoteWorkflowRunDetail, type WorkflowRunPoll, type WorkflowWorkerHealth } from "@/services/api/workflow-runs";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import { normalizeWorkflowRouteState, type WorkflowStageKey } from "./workflow-route-state";
import { appendWorkflowEvents, workflowPollNeedsDetail } from "./workflow-poll-state";
import { summarizeWorkflowStages } from "./workflow-stage-summary";
import type { WorkflowStageView } from "./workflow-view-types";

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
    const detailRef = useRef<RemoteWorkflowRunDetail | null>(null);
    const eventCursorRef = useRef(0);
    const pollPendingRef = useRef(false);
    const detailRefreshPendingRef = useRef(false);

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

    const commitDetail = useCallback((nextDetail: RemoteWorkflowRunDetail) => {
        detailRef.current = nextDetail;
        setDetail(nextDetail);
    }, []);

    const applyPoll = useCallback((current: RemoteWorkflowRunDetail, poll: WorkflowRunPoll) => {
        const stages = new Map(poll.stages.map((stage) => [stage.stageId, stage]));
        commitDetail({
            ...current,
            run: { ...current.run, status: poll.status, updatedAt: poll.updatedAt },
            stages: current.stages.map((stage) => {
                const next = stages.get(stage.stageId);
                return next ? { ...stage, status: next.status, attempt: next.attempt, errorMessage: next.errorMessage, updatedAt: next.updatedAt } : stage;
            }),
        });
    }, [commitDetail]);

    const refreshRemote = useCallback(async (runId?: string, initialDetail?: RemoteWorkflowRunDetail) => {
        if (!runId) return;
        try {
            const [nextDetail, poll] = await Promise.all([initialDetail ? Promise.resolve(initialDetail) : getWorkflowRun(runId), pollWorkflowRun(runId, 0)]);
            commitDetail(nextDetail);
            setHealth(poll.worker);
            setEvents(poll.events);
            eventCursorRef.current = poll.nextAfter;
            detailRefreshPendingRef.current = false;
            setRemoteError("");
        } catch (error) {
            setRemoteError(error instanceof Error ? error.message : "工作流状态读取失败");
        }
    }, [commitDetail]);

    const pollRemote = useCallback(async (runId: string) => {
        const current = detailRef.current;
        if (!current || pollPendingRef.current) return;
        pollPendingRef.current = true;
        try {
            const poll = await pollWorkflowRun(runId, eventCursorRef.current);
            setHealth(poll.worker);
            setEvents((existing) => appendWorkflowEvents(existing, poll.events));
            eventCursorRef.current = poll.nextAfter;
            const needsDetail = detailRefreshPendingRef.current || workflowPollNeedsDetail(current, poll);
            applyPoll(current, poll);
            if (needsDetail) {
                detailRefreshPendingRef.current = true;
                commitDetail(await getWorkflowRun(runId));
                detailRefreshPendingRef.current = false;
            }
            setRemoteError("");
        } catch (error) {
            setRemoteError(error instanceof Error ? error.message : "工作流状态读取失败");
        } finally {
            pollPendingRef.current = false;
        }
    }, [applyPoll, commitDetail]);

    useEffect(() => {
        if (!projectHydrated || !scriptsHydrated || !project || !episode || !scriptSnapshot.trim() || !token) return;
        let cancelled = false;
        setRemoteLoading(true);
        ensureWorkflowRun({ episodeId, projectId, scriptConfirmed: true, scriptSnapshot })
            .then(async (nextDetail) => {
                if (cancelled) return;
                await refreshRemote(nextDetail.run.id, nextDetail);
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
        let cancelled = false;
        let timer = 0;
        const tick = async () => {
            await pollRemote(detail.run.id);
            if (!cancelled) timer = window.setTimeout(() => void tick(), document.hidden ? 6000 : 2000);
        };
        timer = window.setTimeout(() => void tick(), document.hidden ? 6000 : 2000);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [detail?.run.id, hasActiveRemoteStage, pollRemote]);

    useEffect(() => {
        const target = agentWorkspaceHref({ projectId, episodeId, stage: routeState.stage, shot: routeState.shot });
        if (`/agent?${searchParams.toString()}` === target) return;
        window.history.replaceState(null, "", target);
    }, [episodeId, projectId, routeState, searchParams]);

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
    const completedCount = stageViews.filter(workflowViewStageComplete).length;
    const blockerCount = stageViews.filter((stage) => ["blocked", "failed", "rejected"].includes(stage.status)).length;

    const selectRoute = useCallback(
        (stage: WorkflowStageKey, shot = routeState.shot) => {
            const next = normalizeWorkflowRouteState({ shot, stage }, packages.map((item) => item.id));
            window.history.replaceState(null, "", agentWorkspaceHref({ projectId, episodeId, stage: next.stage, shot: next.shot }));
            window.dispatchEvent(new PopStateEvent("popstate"));
        },
        [episodeId, packages, projectId, routeState.shot],
    );
    const continueNext = useCallback(() => {
        const currentIndex = stageViews.findIndex((stage) => stage.key === routeState.stage);
        const next = stageViews.find((stage, index) => index > currentIndex && !workflowViewStageComplete(stage)) || stageViews.find((stage) => !workflowViewStageComplete(stage));
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

function workflowViewStageComplete(stage: WorkflowStageView) {
    return ["approved", "applied", "complete"].includes(stage.status);
}

function packageRouteStatus(item: ReturnType<typeof useVideoPackageStore.getState>["importedPackages"][number]) {
    if (item.risks.some((risk) => risk.level === "阻断")) return "blocked" as const;
    if (item.promptStatus !== "已确认") return "review" as const;
    if (["checking", "creating", "queued", "running"].includes(item.generation?.status || "")) return "running" as const;
    if (item.generation?.status === "succeeded" || item.canvasStatus === "已生成") return "complete" as const;
    return "incomplete" as const;
}
