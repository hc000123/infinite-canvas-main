export type ScriptProject = {
    projectId: string;
    outline: string;
    createdAt: string;
    updatedAt: string;
};

export type ScriptEpisode = {
    id: string;
    projectId: string;
    code: string;
    order: number;
    title: string;
    summary: string;
    sourceSummary?: string;
    structuredScript?: StructuredEpisodeScript;
    hook: string;
    turningPoint: string;
    cliffhanger: string;
    sceneIds: string[];
    createdAt: string;
    updatedAt: string;
};

export type StructuredScriptBeat = {
    type: "action" | "dialogue" | "visual" | "note";
    text: string;
    speaker?: string;
};

export type StructuredScriptSceneAssets = {
    characters: string[];
    locations: string[];
    props: string[];
    costumes: string[];
    mood: string[];
};

export type StructuredScriptScene = {
    sceneId: string;
    location: string;
    timeOfDay: string;
    space: string;
    characters: string[];
    sceneNote: string;
    beats: StructuredScriptBeat[];
    assets: StructuredScriptSceneAssets;
};

export type StructuredEpisodeScript = {
    schemaVersion: "episode-script.v1";
    episodeTitle: string;
    summary: string;
    characters: string[];
    scenes: StructuredScriptScene[];
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
    const code = normalizeEpisodeCode(input.code);
    if (!isValidEpisodeCode(code)) throw new Error("请输入 EP01 这类标准集号");
    return {
        ...input,
        code,
        title: input.title.trim() || "未命名集数",
        summary: input.summary.trim(),
        sourceSummary: input.sourceSummary?.trim() || undefined,
        structuredScript: normalizeStructuredEpisodeScript(input.structuredScript),
        hook: input.hook.trim(),
        turningPoint: input.turningPoint.trim(),
        cliffhanger: input.cliffhanger.trim(),
    };
}

export function normalizeEpisodeCode(value: string) {
    return value.trim().toUpperCase();
}

export function isValidEpisodeCode(value: string) {
    return /^EP\d{2,}$/.test(normalizeEpisodeCode(value));
}

export function defaultEpisodeCode(order: number) {
    return `EP${String(Math.max(1, order || 1)).padStart(2, "0")}`;
}

export function episodeProductionName(code: string, title: string) {
    const safeCode =
        normalizeEpisodeCode(code)
            .normalize("NFKC")
            .replace(/[^\p{L}\p{N}_-]+/gu, "-")
            .replace(/^[-_]+|[-_]+$/g, "") || "EP00";
    const safeTitle =
        title
            .normalize("NFKC")
            .trim()
            .replace(/[^\p{L}\p{N}_-]+/gu, "-")
            .replace(/-+/g, "-")
            .replace(/^[-_]+|[-_]+$/g, "") || "未命名集数";
    return `${safeCode}-${safeTitle}`;
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

export function normalizeStructuredEpisodeScript(value: unknown): StructuredEpisodeScript | undefined {
    if (!value || typeof value !== "object") return undefined;
    const payload = value as Record<string, unknown>;
    const scenes = Array.isArray(payload.scenes) ? payload.scenes.map(normalizeStructuredScriptScene).filter((scene): scene is StructuredScriptScene => Boolean(scene)) : [];
    if (!scenes.length) return undefined;
    return {
        schemaVersion: "episode-script.v1",
        episodeTitle: stringValue(payload.episodeTitle || payload.title),
        summary: stringValue(payload.summary),
        characters: uniqueStrings([...arrayStrings(payload.characters), ...scenes.flatMap((scene) => scene.characters)]),
        scenes,
    };
}

export function structuredEpisodeScriptToText(script: StructuredEpisodeScript) {
    return [`# ${script.episodeTitle || "结构化剧本"}`, script.summary ? `摘要：${script.summary}` : "", ...script.scenes.map(structuredScriptSceneToText)].filter(Boolean).join("\n\n");
}

export function structuredScriptSceneToText(scene: StructuredScriptScene) {
    const title = [scene.sceneId, scene.location, scene.timeOfDay, scene.space, scene.characters.join("、")].filter(Boolean).join(" / ");
    const beats = scene.beats
        .map((beat) => {
            if (beat.type === "dialogue" && beat.speaker) return `${beat.speaker}：${beat.text}`;
            return beat.text;
        })
        .filter(Boolean)
        .join("\n");
    return [`## ${title || "未命名场次"}`, scene.sceneNote ? `场记：${scene.sceneNote}` : "", beats].filter(Boolean).join("\n");
}

function normalizeStructuredScriptScene(value: unknown, index: number): StructuredScriptScene | undefined {
    if (!value || typeof value !== "object") return undefined;
    const payload = value as Record<string, unknown>;
    const beats = Array.isArray(payload.beats) ? payload.beats.map(normalizeStructuredScriptBeat).filter((beat): beat is StructuredScriptBeat => Boolean(beat)) : [];
    const sceneNote = stringValue(payload.sceneNote || payload.note || payload.description);
    if (!beats.length && !sceneNote) return undefined;
    return {
        sceneId: stringValue(payload.sceneId || payload.id || payload.sceneKey) || `scene-${index + 1}`,
        location: stringValue(payload.location),
        timeOfDay: stringValue(payload.timeOfDay || payload.time),
        space: stringValue(payload.space || payload.interiorExterior),
        characters: arrayStrings(payload.characters),
        sceneNote,
        beats,
        assets: normalizeStructuredScriptSceneAssets(payload.assets),
    };
}

function normalizeStructuredScriptBeat(value: unknown): StructuredScriptBeat | undefined {
    if (!value || typeof value !== "object") return undefined;
    const payload = value as Record<string, unknown>;
    const text = stringValue(payload.text || payload.content);
    if (!text) return undefined;
    return {
        type: normalizeBeatType(stringValue(payload.type)),
        text,
        speaker: stringValue(payload.speaker) || undefined,
    };
}

function normalizeStructuredScriptSceneAssets(value: unknown): StructuredScriptSceneAssets {
    const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
        characters: arrayStrings(payload.characters),
        locations: arrayStrings(payload.locations || payload.scenes),
        props: arrayStrings(payload.props),
        costumes: arrayStrings(payload.costumes),
        mood: arrayStrings(payload.mood),
    };
}

function normalizeBeatType(value: string): StructuredScriptBeat["type"] {
    if (value === "dialogue" || value === "visual" || value === "note") return value;
    return "action";
}

function stringValue(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function arrayStrings(value: unknown) {
    if (!Array.isArray(value)) return [];
    return uniqueStrings(value.map(stringValue).filter(Boolean));
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
