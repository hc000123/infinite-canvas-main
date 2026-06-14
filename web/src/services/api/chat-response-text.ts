export function parseChatCompletionStreamChunk(chunk: string) {
    let text = "";
    for (const data of streamDataItems(chunk)) {
        if (data === "[DONE]") continue;
        const payload = parseJsonValue(data);
        if (!payload) continue;
        text += collectChatCompletionDeltaText(payload) || collectChatCompletionText(payload);
    }
    return text;
}

export function collectChatCompletionTextFromRawResponse(value: string) {
    const text = value.trim();
    if (!text) return "";
    const payload = parseJsonValue(text);
    if (payload) return collectChatCompletionText(payload);
    const streamed = parseChatCompletionStreamChunk(text);
    if (streamed) return streamed;
    return text.startsWith("data:") ? "" : text;
}

export function collectChatCompletionText(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const payload = value as Record<string, unknown>;
    if (typeof payload.output_text === "string") return payload.output_text;
    if (Array.isArray(payload.choices)) {
        return payload.choices
            .map((choice) => {
                if (!choice || typeof choice !== "object") return "";
                const item = choice as Record<string, unknown>;
                return contentText((item.message as Record<string, unknown> | undefined)?.content) || contentText((item.delta as Record<string, unknown> | undefined)?.content) || contentText(item.text);
            })
            .join("");
    }
    return contentText(payload.content) || contentText(payload.message) || "";
}

function collectChatCompletionDeltaText(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const payload = value as Record<string, unknown>;
    if (!Array.isArray(payload.choices)) return "";
    return payload.choices
        .map((choice) => {
            if (!choice || typeof choice !== "object") return "";
            const delta = (choice as Record<string, unknown>).delta;
            return delta && typeof delta === "object" ? contentText((delta as Record<string, unknown>).content) : "";
        })
        .join("");
}

function streamDataItems(chunk: string) {
    return chunk
        .split("\n\n")
        .flatMap((eventBlock) =>
            eventBlock
                .split("\n")
                .filter((line) => line.startsWith("data: "))
                .map((line) => line.slice(6).trim()),
        )
        .filter(Boolean);
}

function contentText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(contentText).join("");
    if (!value || typeof value !== "object") return "";
    const payload = value as Record<string, unknown>;
    if (typeof payload.text === "string") return payload.text;
    if (typeof payload.content === "string" || Array.isArray(payload.content)) return contentText(payload.content);
    return "";
}

function parseJsonValue(value: string): unknown | undefined {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return undefined;
    }
}
