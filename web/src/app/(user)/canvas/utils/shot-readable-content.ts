import type { StoryboardTableShot } from "./storyboard-management";

export type ShotReadablePart = {
    title: string;
    text: string;
};

export type ShotReadableContent = {
    main: ShotReadablePart[];
    raw: ShotReadablePart[];
    recovered: boolean;
};

type ShotReadableFields = Partial<Record<"title" | "scriptText" | "visualDescription" | "dialogue" | "action" | "emotion" | "cameraMovement" | "shotSize" | "prompt", string>>;

export function buildShotReadableContent(shot: StoryboardTableShot, sourceShots: StoryboardTableShot[] = []): ShotReadableContent {
    const recoveredFields = recoverReadableShotFields(shot, sourceShots);
    const candidates: ShotReadablePart[] = [
        { title: "完整脚本", text: recoveredFields.scriptText || shot.scriptText },
        { title: "分镜描述", text: recoveredFields.visualDescription || shot.visualDescription },
        { title: "对白", text: recoveredFields.dialogue || shot.dialogue },
        { title: "表演与镜头", text: shotPerformanceText(shot, recoveredFields) },
        { title: "恢复提示词", text: recoveredFields.prompt || "" },
    ];
    const main: ShotReadablePart[] = [];
    const raw: ShotReadablePart[] = [];
    const seen = new Set<string>();

    candidates.forEach((candidate) => {
        const text = candidate.text.trim();
        const key = shotTextDedupeKey(text);
        if (!text || seen.has(key)) return;
        seen.add(key);
        if (isRawShotText(text)) {
            raw.push({ ...candidate, text });
            return;
        }
        main.push({ ...candidate, text });
    });

    raw.push(...rawSourceParts(shot).filter((part) => !seen.has(shotTextDedupeKey(part.text))));
    return { main, raw, recovered: Boolean(Object.values(recoveredFields).some(Boolean)) };
}

export function readableShotTitle(shot: StoryboardTableShot, sourceShots: StoryboardTableShot[] = []) {
    const recoveredTitle = recoverReadableShotFields(shot, sourceShots).title;
    if (recoveredTitle) return recoveredTitle;
    const title = shot.title.trim();
    if (!title) return "";
    if (title.length > 120) return "";
    if (/^(```|[{[])/.test(title)) return "";
    if (/workflow_|workflowId|workflowVersion|stageId|agentId/.test(title)) return "";
    return title;
}

function recoverReadableShotFields(shot: StoryboardTableShot, sourceShots: StoryboardTableShot[]): ShotReadableFields {
    const sources = uniqueStrings([shot.workflowSource?.createdFromText || "", ...sourceShots.map((item) => item.workflowSource?.createdFromText || "")]);
    for (const source of sources) {
        const value = parseLooseJson(source);
        const matched = findShotRecord(value, shot);
        const fields = matched ? fieldsFromRecord(matched) : fieldsFromRecord(value);
        if (hasUsefulReadableFields(fields)) return fields;
        if (isReadableFreeText(source)) return { visualDescription: source.trim() };
    }
    return {};
}

function parseLooseJson(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const candidates = [trimmed, stripMarkdownFence(trimmed), extractJsonBlock(trimmed)].filter(Boolean);
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
            // Keep trying narrower candidates.
        }
    }
    return null;
}

function stripMarkdownFence(text: string) {
    return text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function extractJsonBlock(text: string) {
    const start = text.search(/[{[]/);
    if (start < 0) return "";
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    return end > start ? text.slice(start, end + 1).trim() : "";
}

function findShotRecord(value: unknown, shot: StoryboardTableShot): Record<string, unknown> | null {
    const records = collectRecords(value);
    return (
        records.find((record) => stringValue(record.previewItemId) === shot.workflowSource?.previewItemId) ||
        records.find((record) => numberValue(record.order) === shot.order || numberValue(record.shotIndex) === shot.order || numberValue(record.index) === shot.order) ||
        records[shot.order - 1] ||
        null
    );
}

function collectRecords(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.flatMap(collectRecords);
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    const direct = hasReadableRecordFields(record) ? [record] : [];
    const nested = ["shots", "shotList", "storyboard", "storyboardTable", "items", "data", "result", "output"].flatMap((key) => collectRecords(record[key]));
    return [...direct, ...nested];
}

function fieldsFromRecord(value: unknown): ShotReadableFields {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    return {
        title: firstString(record, ["shotTitle", "title", "name"]),
        scriptText: firstString(record, ["scriptText", "script", "text", "line", "story", "content"]),
        visualDescription: firstString(record, ["visualDescription", "description", "imageDescription", "pictureDescription", "sceneDescription"]),
        dialogue: firstString(record, ["dialogue", "dialog", "lines"]),
        action: firstString(record, ["action", "characterAction", "performance"]),
        emotion: firstString(record, ["emotion", "mood"]),
        cameraMovement: firstString(record, ["cameraMovement", "camera", "movement"]),
        shotSize: firstString(record, ["shotSize", "size", "framing"]),
        prompt: firstString(record, ["prompt", "videoPrompt", "finalPrompt", "effectivePrompt"]),
    };
}

function hasReadableRecordFields(record: Record<string, unknown>) {
    return Boolean(firstString(record, ["shotTitle", "title", "scriptText", "visualDescription", "description", "prompt", "videoPrompt", "action"]));
}

function hasUsefulReadableFields(fields: ShotReadableFields) {
    return Object.values(fields).some((value) => Boolean(value && !isRawShotText(value)));
}

function isReadableFreeText(text: string) {
    const trimmed = text.trim();
    return Boolean(trimmed && trimmed.length > 8 && /[\u4e00-\u9fa5]/.test(trimmed) && !isRawShotText(trimmed));
}

function firstString(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value !== "string" && typeof value !== "number") continue;
        const text = String(value).trim();
        if (text && !isRawShotText(text)) return text;
    }
    return "";
}

function rawSourceParts(shot: StoryboardTableShot): ShotReadablePart[] {
    const parts: ShotReadablePart[] = [
        { title: "原始标题", text: shot.title },
        { title: "完整脚本", text: shot.scriptText },
        { title: "分镜描述", text: shot.visualDescription },
        { title: "对白", text: shot.dialogue },
        { title: "表演与镜头", text: shotPerformanceText(shot, {}) },
        { title: "映射来源", text: shot.workflowSource?.createdFromText || "" },
    ];
    const seen = new Set<string>();
    return parts
        .map((part) => ({ ...part, text: part.text.trim() }))
        .filter((part) => {
            const key = shotTextDedupeKey(part.text);
            if (!part.text || seen.has(key) || !isRawShotText(part.text)) return false;
            seen.add(key);
            return true;
        });
}

function shotPerformanceText(shot: StoryboardTableShot, recovered: ShotReadableFields) {
    return [
        recovered.action || shot.action ? `动作：${recovered.action || shot.action}` : "",
        recovered.emotion || shot.emotion ? `情绪：${recovered.emotion || shot.emotion}` : "",
        recovered.cameraMovement || shot.cameraMovement ? `镜头运动：${recovered.cameraMovement || shot.cameraMovement}` : "",
    ]
        .filter(Boolean)
        .join("\n\n");
}

function isRawShotText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (/^```(?:json)?/i.test(trimmed)) return true;
    if (/^[{[]\s*$/.test(trimmed)) return true;
    if (/^(动作|情绪|镜头运动)：\s*[{[]\s*$/.test(trimmed)) return true;
    if (/^[{[]/.test(trimmed) && /["']?(workflow|stage|agent|qualityGate|preview|sourceOutput|metadata)["']?/i.test(trimmed)) return true;
    if (/^(动作|情绪|镜头运动)：\s*[{[]/.test(trimmed) && /["']?(workflow|stage|agent|qualityGate|preview|sourceOutput|metadata)["']?/i.test(trimmed)) return true;
    return /workflow_|workflowId|workflowVersion|workflowRunId|stageId|stageName|agentId|sourceOutputId|qualityGateIds|previewItemId|createdFromText/.test(trimmed);
}

function shotTextDedupeKey(text: string) {
    return text.trim().replace(/^(动作|情绪|镜头运动)：\s*/, "");
}

function stringValue(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function numberValue(value: unknown) {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
