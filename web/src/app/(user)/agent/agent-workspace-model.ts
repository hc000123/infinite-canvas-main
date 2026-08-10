import type { WorkflowRunListItem } from "@/services/api/workflow-runs-contract";
import type { ScriptEpisode } from "../canvas/utils/script-management";
import type { CreativeProject } from "../projects/creative-projects";
import { productionStageComplete, projectProductionStages, type ProductionStageKey, type ProductionStageStatus, type ProductionStageView } from "../projects/production-stage-projection.ts";

export type AgentStageKey = ProductionStageKey;
export type AgentStageStatus = ProductionStageStatus;
export type AgentAttentionStatus = "all" | "running" | "review" | "blocked" | "failed" | "completed";
export type AgentStageView = ProductionStageView;

export type AgentEpisodeView = {
    id: string;
    projectId: string;
    code: string;
    title: string;
    runId: string;
    status: Exclude<AgentAttentionStatus, "all"> | "not_started";
    progress: number;
    currentStageKey: AgentStageKey;
    currentStageLabel: string;
    reviewCount: number;
    warningCount: number;
    stages: AgentStageView[];
    updatedAt: string;
};

export type AgentPackageProgress = {
    projectId: string;
    episodeId: string;
    canvasStatus?: string;
    generation?: { status?: string };
};

export type AgentProjectView = {
    id: string;
    title: string;
    description: string;
    status: AgentEpisodeView["status"];
    progress: number;
    episodeCount: number;
    runningCount: number;
    reviewCount: number;
    warningCount: number;
    failureCount: number;
    currentStageLabel: string;
    episodes: AgentEpisodeView[];
    updatedAt: string;
};

export function buildAgentEpisodeView(input: { project: CreativeProject; episode: ScriptEpisode; run?: WorkflowRunListItem; packageCount?: number; generatedCount?: number }): AgentEpisodeView {
    const { episode, run } = input;
    const scriptReady = Boolean(episode.summary.trim() || episode.structuredScript?.scenes.length);
    const stages = projectProductionStages({ generatedCount: input.generatedCount, packageCount: input.packageCount, remoteStages: run?.stages, scriptReady, warningCount: run?.warningCount });
    const completedGates = stages.filter((stage) => productionStageComplete(stage.status)).length;
    const progress = Math.round((completedGates / stages.length) * 100);
    const status = episodeStatus(stages, progress, Boolean(run));
    const current = currentStage(stages);
    return {
        id: episode.id,
        projectId: input.project.id,
        code: episode.code,
        title: episode.title,
        runId: run?.id || "",
        status,
        progress,
        currentStageKey: current?.key || "script",
        currentStageLabel: current?.label || "尚未开始",
        reviewCount: run?.reviewCount || 0,
        warningCount: run?.warningCount || 0,
        stages,
        updatedAt: run?.updatedAt || episode.updatedAt,
    };
}

export function buildAgentProjectViews(input: { projects: CreativeProject[]; episodes: ScriptEpisode[]; runs: WorkflowRunListItem[]; packages?: AgentPackageProgress[] }): AgentProjectView[] {
    const latestRuns = new Map<string, WorkflowRunListItem>();
    for (const run of input.runs) {
        const key = `${run.projectId}\u0000${run.episodeId}`;
        const current = latestRuns.get(key);
        if (!current || Date.parse(run.updatedAt) > Date.parse(current.updatedAt)) latestRuns.set(key, run);
    }
    const packageProgress = new Map<string, { generated: number; total: number }>();
    for (const item of input.packages || []) {
        const key = `${item.projectId}\u0000${item.episodeId}`;
        const current = packageProgress.get(key) || { generated: 0, total: 0 };
        current.total += 1;
        if (item.generation?.status === "succeeded" || item.canvasStatus === "已生成") current.generated += 1;
        packageProgress.set(key, current);
    }
    return [...input.projects]
        .map((project): AgentProjectView => {
            const episodes = input.episodes
                .filter((episode) => episode.projectId === project.id)
                .sort((a, b) => a.order - b.order)
                .map((episode) => {
                    const progress = packageProgress.get(`${project.id}\u0000${episode.id}`);
                    return buildAgentEpisodeView({ project, episode, run: latestRuns.get(`${project.id}\u0000${episode.id}`), packageCount: progress?.total, generatedCount: progress?.generated });
                });
            const failureCount = episodes.filter((episode) => episode.status === "failed").length;
            const reviewCount = episodes.reduce((total, episode) => total + episode.reviewCount, 0);
            const runningCount = episodes.filter((episode) => episode.status === "running").length;
            const warningCount = episodes.reduce((total, episode) => total + episode.warningCount, 0);
            const progress = episodes.length ? Math.round(episodes.reduce((total, episode) => total + episode.progress, 0) / episodes.length) : 0;
            const latest = [...episodes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
            return {
                id: project.id,
                title: project.title,
                description: project.description,
                status: failureCount ? "failed" : reviewCount ? "review" : runningCount ? "running" : episodes.length && episodes.every((episode) => episode.status === "completed") ? "completed" : episodes.some((episode) => episode.status === "blocked") ? "blocked" : "not_started",
                progress,
                episodeCount: episodes.length,
                runningCount,
                reviewCount,
                warningCount,
                failureCount,
                currentStageLabel: latest?.currentStageLabel || "尚未开始",
                episodes,
                updatedAt: latest?.updatedAt || project.updatedAt,
            };
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function agentEpisodeHref(episode: AgentEpisodeView) {
    const params = new URLSearchParams({ projectId: episode.projectId, episodeId: episode.id, stage: episode.currentStageKey });
    return `/agent?${params.toString()}`;
}

export function filterAgentProjectViews(projects: AgentProjectView[], input: { keyword?: string; status?: AgentAttentionStatus }) {
    const keyword = input.keyword?.trim().toLowerCase() || "";
    return projects.filter((project) => {
        if (input.status && input.status !== "all" && project.status !== input.status) return false;
        return !keyword || `${project.title} ${project.description}`.toLowerCase().includes(keyword);
    });
}

function episodeStatus(stages: AgentStageView[], progress: number, hasRun: boolean): AgentEpisodeView["status"] {
    if (stages.some((stage) => stage.status === "failed")) return "failed";
    if (stages.some((stage) => stage.status === "needs_review")) return "review";
    if (stages.some((stage) => ["queued", "running", "cancel_requested"].includes(stage.status))) return "running";
    if (progress === 100) return "completed";
    if (hasRun && stages.some((stage) => stage.status === "ready" || stage.status === "warning")) return "running";
    if (stages[0].status === "blocked" || stages.some((stage) => stage.status === "rejected")) return "blocked";
    return hasRun ? "blocked" : "not_started";
}

function currentStage(stages: AgentStageView[]) {
    return stages.find((stage) => ["failed", "needs_review", "queued", "running", "cancel_requested", "rejected"].includes(stage.status)) || stages.find((stage) => stage.status === "ready" || stage.status === "warning") || stages.find((stage) => !productionStageComplete(stage.status));
}
