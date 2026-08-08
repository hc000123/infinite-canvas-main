import type { WorkflowRunListItem, WorkflowStagePollSummary } from "@/services/api/workflow-runs-contract";
import type { ScriptEpisode } from "../canvas/utils/script-management";
import type { CreativeProject } from "../projects/creative-projects";

export const agentStageDefinitions = [
    { key: "script", label: "剧本确认", description: "确认不可变剧本快照", remoteId: "script-adaptation" },
    { key: "asset-extraction", label: "资产解析", description: "识别并校正资产槽位", remoteId: "asset-extraction" },
    { key: "asset-production", label: "资产生产", description: "生成、上传或保留文字占位", remoteId: "asset-image-prompt" },
    { key: "storyboard", label: "结构化分镜", description: "编排镜头、节奏与连续性", remoteId: "shot-breakdown" },
    { key: "prompt", label: "最终提示词", description: "生成并批准模型执行稿", remoteId: "shot-prompt" },
    { key: "video", label: "视频生成与预览", description: "手动启动并检查每个镜头", remoteId: "" },
] as const;

export type AgentStageKey = (typeof agentStageDefinitions)[number]["key"];
export type AgentStageStatus = "idle" | "ready" | "running" | "needs_review" | "approved" | "applied" | "warning" | "blocked" | "failed" | "cancelled" | "complete";
export type AgentAttentionStatus = "all" | "running" | "review" | "blocked" | "failed" | "completed";

export type AgentStageView = {
    key: AgentStageKey;
    label: string;
    description: string;
    status: AgentStageStatus;
    blockingReason?: string;
    warningCount?: number;
};

export type AgentEpisodeView = {
    id: string;
    projectId: string;
    code: string;
    title: string;
    runId: string;
    status: Exclude<AgentAttentionStatus, "all"> | "not_started";
    progress: number;
    currentStageLabel: string;
    reviewCount: number;
    warningCount: number;
    stages: AgentStageView[];
    updatedAt: string;
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
    const latest = latestRemoteStages(run?.stages || []);
    const scriptReady = Boolean(episode.summary.trim() || episode.structuredScript?.scenes.length);
    const script = remoteOr(latest.get("script-adaptation"), scriptReady ? "ready" : "blocked");
    const extraction = remoteOr(latest.get("asset-extraction"), gateComplete(script) ? "ready" : "blocked");
    const remoteProduction = latest.get("asset-image-prompt");
    let production = remoteOr(remoteProduction, gateComplete(extraction) ? "ready" : "blocked");
    if (run?.warningCount && gateComplete(extraction) && (!remoteProduction || gateComplete(production))) production = "warning";
    const storyboard = remoteOr(latest.get("shot-breakdown"), gateComplete(extraction) ? "ready" : "blocked");
    const prompt = remoteOr(latest.get("shot-prompt"), gateComplete(storyboard) ? "ready" : "blocked");
    const packageCount = input.packageCount || 0;
    const generatedCount = input.generatedCount || 0;
    const video: AgentStageStatus = packageCount > 0 && generatedCount >= packageCount ? "complete" : gateComplete(prompt) ? "ready" : "blocked";
    const statuses: AgentStageStatus[] = [script, extraction, production, storyboard, prompt, video];
    const reasons = [
        scriptReady ? undefined : "本集还没有可确认的剧本",
        gateComplete(script) ? undefined : "请先批准剧本快照",
        gateComplete(extraction) ? undefined : "请先批准资产槽位",
        gateComplete(extraction) ? undefined : "请先批准资产槽位；图片可以稍后补齐",
        gateComplete(storyboard) ? undefined : "请先批准结构化分镜",
        gateComplete(prompt) ? undefined : "请先批准最终提示词",
    ];
    const stages = agentStageDefinitions.map((definition, index): AgentStageView => ({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        status: statuses[index],
        blockingReason: statuses[index] === "blocked" ? reasons[index] : undefined,
        warningCount: definition.key === "asset-production" && production === "warning" ? run?.warningCount : undefined,
    }));
    const completedGates = stages.filter((stage) => gateComplete(stage.status)).length;
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
        currentStageLabel: current?.label || "尚未开始",
        reviewCount: run?.reviewCount || 0,
        warningCount: run?.warningCount || 0,
        stages,
        updatedAt: run?.updatedAt || episode.updatedAt,
    };
}

export function buildAgentProjectViews(input: { projects: CreativeProject[]; episodes: ScriptEpisode[]; runs: WorkflowRunListItem[] }): AgentProjectView[] {
    const latestRuns = new Map<string, WorkflowRunListItem>();
    for (const run of input.runs) {
        const key = `${run.projectId}\u0000${run.episodeId}`;
        const current = latestRuns.get(key);
        if (!current || Date.parse(run.updatedAt) > Date.parse(current.updatedAt)) latestRuns.set(key, run);
    }
    return [...input.projects]
        .map((project): AgentProjectView => {
            const episodes = input.episodes
                .filter((episode) => episode.projectId === project.id)
                .sort((a, b) => a.order - b.order)
                .map((episode) => buildAgentEpisodeView({ project, episode, run: latestRuns.get(`${project.id}\u0000${episode.id}`) }));
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

export function filterAgentProjectViews(projects: AgentProjectView[], input: { keyword?: string; status?: AgentAttentionStatus }) {
    const keyword = input.keyword?.trim().toLowerCase() || "";
    return projects.filter((project) => {
        if (input.status && input.status !== "all" && project.status !== input.status) return false;
        return !keyword || `${project.title} ${project.description}`.toLowerCase().includes(keyword);
    });
}

function latestRemoteStages(stages: WorkflowStagePollSummary[]) {
    const result = new Map<string, WorkflowStagePollSummary>();
    for (const stage of stages) {
        const current = result.get(stage.stageId);
        if (!current || stage.attempt > current.attempt) result.set(stage.stageId, stage);
    }
    return result;
}

function remoteOr(stage: WorkflowStagePollSummary | undefined, fallback: AgentStageStatus): AgentStageStatus {
    if (!stage) return fallback;
    if (stage.status === "queued" || stage.status === "running" || stage.status === "cancel_requested") return "running";
    if (stage.status === "rejected") return "blocked";
    return stage.status;
}

function gateComplete(status: AgentStageStatus) {
    return status === "approved" || status === "applied" || status === "warning" || status === "complete";
}

function episodeStatus(stages: AgentStageView[], progress: number, hasRun: boolean): AgentEpisodeView["status"] {
    if (stages.some((stage) => stage.status === "failed")) return "failed";
    if (stages.some((stage) => stage.status === "needs_review")) return "review";
    if (stages.some((stage) => stage.status === "running")) return "running";
    if (progress === 100) return "completed";
    if (stages[0].status === "blocked") return "blocked";
    return hasRun ? "blocked" : "not_started";
}

function currentStage(stages: AgentStageView[]) {
    return stages.find((stage) => ["failed", "needs_review", "running"].includes(stage.status)) || stages.find((stage) => stage.status === "ready" || stage.status === "warning") || stages.find((stage) => !gateComplete(stage.status));
}
