export type ScriptProject = {
    projectId: string;
    outline: string;
    createdAt: string;
    updatedAt: string;
};

export type ScriptEpisode = {
    id: string;
    projectId: string;
    order: number;
    title: string;
    summary: string;
    hook: string;
    turningPoint: string;
    cliffhanger: string;
    sceneIds: string[];
    createdAt: string;
    updatedAt: string;
};

export type ScriptScene = {
    id: string;
    episodeId: string;
    order: number;
    location: string;
    characterIds: string[];
    sceneSettingId?: string;
    beat: string;
    dialogue: string;
    emotion: string;
    durationHint: string;
    storyboardGroupId?: string;
    createdAt: string;
    updatedAt: string;
};

export type ScriptEpisodeWriteInput = Omit<ScriptEpisode, "id" | "sceneIds" | "createdAt" | "updatedAt">;
export type ScriptSceneWriteInput = Omit<ScriptScene, "id" | "createdAt" | "updatedAt">;

export function normalizeScriptEpisode(input: ScriptEpisodeWriteInput): ScriptEpisodeWriteInput {
    return {
        ...input,
        title: input.title.trim() || "未命名集数",
        summary: input.summary.trim(),
        hook: input.hook.trim(),
        turningPoint: input.turningPoint.trim(),
        cliffhanger: input.cliffhanger.trim(),
    };
}

export function normalizeScriptScene(input: ScriptSceneWriteInput): ScriptSceneWriteInput {
    return {
        ...input,
        location: input.location.trim(),
        characterIds: uniqueStrings(input.characterIds.map((id) => id.trim()).filter(Boolean)),
        sceneSettingId: input.sceneSettingId?.trim() || undefined,
        beat: input.beat.trim(),
        dialogue: input.dialogue.trim(),
        emotion: input.emotion.trim(),
        durationHint: input.durationHint.trim(),
        storyboardGroupId: input.storyboardGroupId?.trim() || undefined,
    };
}

export function orderedScriptEpisodes(episodes: ScriptEpisode[], projectId: string) {
    return episodes.filter((episode) => episode.projectId === projectId).sort(compareOrder);
}

export function orderedScriptScenes(scenes: ScriptScene[], episodeId: string) {
    return scenes.filter((scene) => scene.episodeId === episodeId).sort(compareOrder);
}

export function reorderScriptItems<T extends { id: string; order: number }>(items: T[], id: string, direction: "up" | "down") {
    const ordered = [...items].sort(compareOrder);
    const index = ordered.findIndex((item) => item.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return items;
    const current = ordered[index];
    const target = ordered[targetIndex];
    return items.map((item) => {
        if (item.id === current.id) return { ...item, order: target.order };
        if (item.id === target.id) return { ...item, order: current.order };
        return item;
    });
}

export function parseScriptScenesFromText(text: string) {
    return text
        .split(/\n\s*\n/g)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => {
            const lines = paragraph
                .split(/\r?\n/g)
                .map((line) => line.trim())
                .filter(Boolean);
            const titleLine = lines[0] || `场次 ${index + 1}`;
            const body = lines.length > 1 ? lines.slice(1).join("\n") : titleLine;
            return {
                location: extractLabeledValue(body, ["地点", "场景"]) || "",
                beat: body,
                dialogue: extractLabeledValue(body, ["对白", "台词"]) || "",
                emotion: extractLabeledValue(body, ["情绪", "节奏"]) || "",
                durationHint: extractLabeledValue(body, ["时长"]) || "",
            };
        });
}

function extractLabeledValue(text: string, labels: string[]) {
    for (const label of labels) {
        const match = text.match(new RegExp(`${label}[：:]\\s*([^\\n]+)`));
        if (match?.[1]) return match[1].trim();
    }
    return "";
}

function compareOrder<T extends { order: number; createdAt?: string }>(a: T, b: T) {
    if (a.order !== b.order) return a.order - b.order;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
}
