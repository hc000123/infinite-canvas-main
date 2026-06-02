export type CanvasReferenceMentionOption = {
    id: string;
    label: string;
    detail?: string;
    previewType?: "image" | "video" | "audio";
    previewUrl?: string;
};

export type CanvasReferenceMentionInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: { dataUrl?: string; url?: string };
    video?: { url?: string };
    audio?: { url?: string };
};

export type CanvasReferenceMentionTrigger = {
    start: number;
    query: string;
};

export function findReferenceMentionTrigger(text: string, caret: number): CanvasReferenceMentionTrigger | null {
    const safeCaret = Math.max(0, Math.min(text.length, caret));
    const beforeCaret = text.slice(0, safeCaret);
    const atIndex = beforeCaret.lastIndexOf("@");
    if (atIndex < 0) return null;
    const query = beforeCaret.slice(atIndex + 1);
    if (/\s/.test(query)) return null;
    return { start: atIndex, query };
}

export function filterReferenceMentions(options: CanvasReferenceMentionOption[], query: string) {
    const normalizedQuery = normalizeReferenceMentionText(query);
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeReferenceMentionText(`${option.label}${option.detail || ""}`).includes(normalizedQuery));
}

export function buildReferenceMentionOptions(inputs: CanvasReferenceMentionInput[]): CanvasReferenceMentionOption[] {
    const images = inputs.filter((input) => input.type === "image" && input.image);
    const videos = inputs.filter((input) => input.type === "video" && input.video);
    const audios = inputs.filter((input) => input.type === "audio" && input.audio);
    return [
        ...images.map((input, index) => ({
            id: input.nodeId,
            label: `图片 ${index + 1}`,
            detail: input.title,
            previewType: "image" as const,
            previewUrl: input.image?.dataUrl || input.image?.url,
        })),
        ...videos.map((input, index) => ({
            id: input.nodeId,
            label: `视频 ${index + 1}`,
            detail: input.title,
            previewType: "video" as const,
            previewUrl: input.video?.url,
        })),
        ...audios.map((input, index) => ({
            id: input.nodeId,
            label: `音频 ${index + 1}`,
            detail: input.title,
            previewType: "audio" as const,
            previewUrl: input.audio?.url,
        })),
    ];
}

export function applyReferenceMention(text: string, caret: number, label: string) {
    const trigger = findReferenceMentionTrigger(text, caret);
    if (!trigger) return { text, caret };
    const nextText = `${text.slice(0, trigger.start)}${label}${text.slice(caret)}`;
    return { text: nextText, caret: trigger.start + label.length };
}

function normalizeReferenceMentionText(value: string) {
    return value.replace(/[@\s]/g, "").toLowerCase();
}
