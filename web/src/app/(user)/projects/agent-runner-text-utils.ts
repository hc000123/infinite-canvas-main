export function normalizeStringList(value: unknown) {
    const list = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    return Array.from(new Set(list.map((item) => item.trim())));
}

export function tryParseTextOutput(rawText: string) {
    const trimmed = rawText.trim();
    const parsed = parseWorkflowTextJson(trimmed) || parseWorkflowTextJson(extractCodeBlock(trimmed));
    if (parsed !== undefined) return { format: "json" as const, value: parsed };
    return { format: "text" as const, value: undefined };
}

export function parseWorkflowTextJson(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

export function extractCodeBlock(text: string) {
    const match = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
    return match?.[1]?.trim() || "";
}

export function summarizeWorkflowTextOutput(value: unknown, rawText: string) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record.summary === "string" && record.summary.trim()) return record.summary;
        if (typeof record.text === "string" && record.text.trim()) return record.text;
        if (typeof record.output === "string" && record.output.trim()) return record.output;
    }
    const preview = rawText.trim();
    return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview || "模型返回空文本";
}
