import type { AgentConfig } from "../../projects/agent-settings.ts";
import { buildAgentTraceMetadata, type AgentDraftOutput, type AgentRunInput, type AgentRunRecord } from "../../projects/agent-runner.ts";
import type { EpisodeWorkbenchCanvas } from "./episode-workbench.ts";
import { buildStoryboardTableDraftsFromScript, type StoryboardTableShotWriteInput } from "./storyboard-management.ts";

export type StoryboardDirectorDraftItem = {
    id: string;
    shotNumber: number;
    sceneId?: string;
    sceneName: string;
    location: string;
    scriptText: string;
    visualDescription: string;
    characterAction: string;
    dialogue: string;
    emotion: string;
    shotSize: string;
    estimatedDuration: number;
    assetNeeds: string[];
    warnings: string[];
};

export type StoryboardDraftWriteMode = "append" | "replace";

export function canRunStoryboardDirector(canvas?: EpisodeWorkbenchCanvas | null) {
    if (!canvas) return { canRun: false, reason: "请先选择画布" };
    if (!canvas.episodeId) return { canRun: false, reason: "请先绑定或导入本集剧本" };
    if (!canvas.scriptSnapshot?.trim()) return { canRun: false, reason: "请先导入本集剧本内容" };
    return { canRun: true, reason: "" };
}

export function shouldAllowStoryboardDirectorRun(config?: AgentConfig) {
    if (!config) return { allowed: false, reason: "没有找到分镜导演 Agent 配置" };
    if (!config.enabled) return { allowed: false, reason: "分镜导演 Agent 已禁用，请先在 Agent 设置中心启用" };
    return { allowed: true, reason: "" };
}

export function buildStoryboardDirectorRunInput(context: { projectId: string; canvas: EpisodeWorkbenchCanvas }): AgentRunInput {
    return {
        projectId: context.projectId,
        canvasId: context.canvas.id,
        episodeId: context.canvas.episodeId,
        episodeTitle: context.canvas.episodeTitle,
        scriptId: context.canvas.scriptId || context.projectId,
        scriptSnapshot: context.canvas.scriptSnapshot || "",
        sourceType: "episode_script",
        sourceId: context.canvas.episodeId,
        variables: {
            episodeTitle: context.canvas.episodeTitle || context.canvas.title,
            scriptSnapshot: context.canvas.scriptSnapshot || "",
        },
    };
}

export function buildLocalStoryboardDirectorDraftOutput(context: { projectId: string; canvas: EpisodeWorkbenchCanvas }): AgentDraftOutput {
    const drafts = buildStoryboardTableDraftsFromScript({
        projectId: context.projectId,
        canvasId: context.canvas.id,
        episodeId: context.canvas.episodeId || "",
        scriptText: context.canvas.scriptSnapshot || "",
        idFactory: (index) => `storyboard-agent-draft-${index}`,
    }).map(
        (shot): StoryboardDirectorDraftItem => ({
            id: shot.id,
            shotNumber: shot.order,
            sceneId: shot.sceneId,
            sceneName: shot.sceneName,
            location: shot.location,
            scriptText: shot.scriptText,
            visualDescription: shot.visualDescription,
            characterAction: shot.action,
            dialogue: shot.dialogue,
            emotion: shot.emotion,
            shotSize: shot.shotSize,
            estimatedDuration: shot.estimatedDuration,
            assetNeeds: shot.assetNeeds || [],
            warnings: [],
        }),
    );
    return {
        summary: `从《${context.canvas.episodeTitle || context.canvas.title}》生成 ${drafts.length} 条分镜草案`,
        items: drafts,
        rawJson: { shots: drafts, sourceType: "episode_script" },
        warnings: drafts.length ? [] : ["本地规则没有拆出分镜草案，可手动新增分镜头。"],
        schemaVersion: "storyboard-director.v1",
    };
}

export function buildStoryboardTableShotInputsFromAgentRun(run: AgentRunRecord, context: { projectId: string; canvas: EpisodeWorkbenchCanvas }): StoryboardTableShotWriteInput[] {
    if (run.status !== "approved") throw new Error("分镜导演 run 必须先批准，才能写入分镜头表");
    const trace = buildStoryboardDraftTraceMetadata(run, run.input.scriptSnapshot || context.canvas.scriptSnapshot || "");
    return normalizeStoryboardDirectorDraftItems(run.draftOutput.items).map((item, index) => ({
        projectId: context.projectId,
        canvasId: context.canvas.id,
        episodeId: context.canvas.episodeId || "",
        sceneId: item.sceneId,
        sceneName: item.sceneName,
        location: item.location,
        timeOfDay: "",
        order: item.shotNumber || index + 1,
        title: `镜头 ${item.shotNumber || index + 1} · ${item.sceneName}`,
        scriptText: item.scriptText,
        visualDescription: item.visualDescription,
        characters: [],
        dialogue: item.dialogue,
        action: item.characterAction,
        emotion: item.emotion,
        shotSize: item.shotSize,
        cameraMovement: "",
        estimatedDuration: item.estimatedDuration,
        assetNeeds: item.assetNeeds,
        assetRefs: [],
        productionBibleRefs: [],
        ...trace,
    }));
}

export function buildStoryboardDraftTraceMetadata(run: AgentRunRecord, scriptSnapshot: string) {
    const trace = buildAgentTraceMetadata(run);
    return {
        agentRunId: trace.agentRunId,
        agentConfigId: trace.agentConfigId,
        agentConfigVersion: trace.agentConfigVersion,
        inputScriptSnapshotHash: inputScriptSnapshotHash(scriptSnapshot),
        sourceType: "agent_storyboard_director",
    };
}

export function summarizeStoryboardDraftRun(run: AgentRunRecord) {
    return {
        status: run.status,
        itemCount: normalizeStoryboardDirectorDraftItems(run.draftOutput.items).length,
        warningCount: run.draftOutput.warnings.length,
        summary: run.draftOutput.summary,
    };
}

export function normalizeStoryboardDirectorDraftItems(items: unknown[]): StoryboardDirectorDraftItem[] {
    return items.map((item, index) => normalizeStoryboardDirectorDraftItem(item, index)).filter((item): item is StoryboardDirectorDraftItem => Boolean(item));
}

export function storyboardDraftWriteModeRequired(existingShotCount: number) {
    return existingShotCount > 0;
}

export function validateStoryboardDraftWriteMode(input: { existingShotCount: number; mode?: StoryboardDraftWriteMode }) {
    if (input.existingShotCount > 0 && input.mode !== "append" && input.mode !== "replace") return { valid: false, reason: "当前已有分镜头表，请选择追加或覆盖" };
    return { valid: true, reason: "" };
}

export function inputScriptSnapshotHash(value: string) {
    let hash = 2166136261;
    for (const char of value) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeStoryboardDirectorDraftItem(value: unknown, index: number): StoryboardDirectorDraftItem | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const sceneName = String(record.sceneName || record.location || "未命名场次").trim();
    const scriptText = String(record.scriptText || "").trim();
    const visualDescription = String(record.visualDescription || record.description || scriptText).trim();
    if (!scriptText && !visualDescription) return null;
    return {
        id: String(record.id || `storyboard-draft-${index + 1}`),
        shotNumber: Math.max(1, Math.round(Number(record.shotNumber || index + 1) || index + 1)),
        sceneId: typeof record.sceneId === "string" ? record.sceneId.trim() || undefined : undefined,
        sceneName,
        location: String(record.location || sceneName).trim(),
        scriptText,
        visualDescription,
        characterAction: String(record.characterAction || record.action || visualDescription).trim(),
        dialogue: String(record.dialogue || "").trim(),
        emotion: String(record.emotion || "").trim(),
        shotSize: String(record.shotSize || "").trim(),
        estimatedDuration: Math.max(1, Math.min(15, Math.round(Number(record.estimatedDuration || 5) || 5))),
        assetNeeds: Array.isArray(record.assetNeeds) ? uniqueStrings(record.assetNeeds.map(String)) : [],
        warnings: Array.isArray(record.warnings) ? record.warnings.map(String).filter(Boolean) : [],
    };
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
