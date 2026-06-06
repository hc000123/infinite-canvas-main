import type { CanvasProject } from "../stores/use-canvas-store.ts";
import type { ScriptEpisode, ScriptEpisodeWriteInput, ScriptScene } from "./script-management.ts";

export type CanvasEpisodeContext = {
    episodeId: string;
    episodeTitle: string;
    scriptId: string;
    scriptSnapshot: string;
};

export type CanvasCreateScriptBinding = { mode: "none" } | { mode: "existing"; episodeId: string; context: CanvasEpisodeContext } | { mode: "import"; title: string; scriptText: string };
export type CanvasImportedEpisodeWriteInput = Omit<ScriptEpisodeWriteInput, "order"> & { order?: number };

export function canvasEpisodeContextFromCanvas(canvas?: Pick<CanvasProject, "episodeId" | "episodeTitle" | "scriptId" | "scriptSnapshot"> | null): CanvasEpisodeContext | undefined {
    if (!canvas?.episodeId || !canvas.episodeTitle) return undefined;
    return {
        episodeId: canvas.episodeId,
        episodeTitle: canvas.episodeTitle,
        scriptId: canvas.scriptId || canvas.episodeId,
        scriptSnapshot: canvas.scriptSnapshot || canvas.episodeTitle,
    };
}

export function canvasEpisodeContextFromEpisode(projectId: string, episode: ScriptEpisode, scenes: ScriptScene[] = []): CanvasEpisodeContext {
    return {
        episodeId: episode.id,
        episodeTitle: episode.title,
        scriptId: projectId,
        scriptSnapshot: buildEpisodeScriptSnapshot(episode, scenes),
    };
}

export function canvasEpisodeContextFromImportedScript(projectId: string, episodeId: string, title: string, scriptText: string): CanvasEpisodeContext {
    return {
        episodeId,
        episodeTitle: normalizeEpisodeTitle(title),
        scriptId: projectId,
        scriptSnapshot: scriptText.trim(),
    };
}

export function buildImportedEpisodeWriteInput(projectId: string, scriptBinding?: CanvasCreateScriptBinding): CanvasImportedEpisodeWriteInput | undefined {
    if (!scriptBinding || scriptBinding.mode !== "import") return undefined;
    return {
        projectId,
        title: normalizeEpisodeTitle(scriptBinding.title),
        summary: scriptBinding.scriptText,
        hook: "",
        turningPoint: "",
        cliffhanger: "",
    };
}

export function canvasEpisodeContextFromCreateBinding(projectId: string, scriptBinding?: CanvasCreateScriptBinding, importedEpisodeId?: string): CanvasEpisodeContext | undefined {
    if (!scriptBinding || scriptBinding.mode === "none") return undefined;
    if (scriptBinding.mode === "existing") return scriptBinding.context;
    if (!importedEpisodeId) return undefined;
    return canvasEpisodeContextFromImportedScript(projectId, importedEpisodeId, scriptBinding.title, scriptBinding.scriptText);
}

export function buildEpisodeScriptSnapshot(episode: ScriptEpisode, scenes: ScriptScene[] = []) {
    const parts = [
        `# ${episode.title}`,
        episode.summary ? `摘要：${episode.summary}` : "",
        episode.hook ? `开场钩子：${episode.hook}` : "",
        episode.turningPoint ? `转折：${episode.turningPoint}` : "",
        episode.cliffhanger ? `结尾悬念：${episode.cliffhanger}` : "",
        ...scenes
            .filter((scene) => scene.episodeId === episode.id)
            .sort((a, b) => a.order - b.order)
            .map((scene) =>
                [`## 场 ${scene.order}${scene.location ? `：${scene.location}` : ""}`, scene.beat, scene.dialogue ? `对白：${scene.dialogue}` : "", scene.emotion ? `情绪：${scene.emotion}` : "", scene.durationHint ? `时长：${scene.durationHint}` : ""]
                    .filter(Boolean)
                    .join("\n"),
            ),
    ];
    return parts.filter(Boolean).join("\n\n");
}

export function normalizeEpisodeTitle(title: string) {
    return title.trim() || "未命名集数";
}

export function canvasEpisodeLabel(canvas?: Pick<CanvasProject, "episodeTitle"> | null) {
    return canvas?.episodeTitle?.trim() || "未绑定集数";
}

export function canvasEpisodeMetadata(context?: CanvasEpisodeContext) {
    if (!context) return {};
    return {
        episodeId: context.episodeId,
        episodeTitle: context.episodeTitle,
        scriptId: context.scriptId,
        scriptSnapshot: context.scriptSnapshot,
    };
}
