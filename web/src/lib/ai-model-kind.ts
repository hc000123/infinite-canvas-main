export type AiModelKind = "image" | "video" | "text";

const videoKeywords = ["seedance", "video", "veo", "sora", "kling", "hailuo", "runway", "i2v", "t2v", "wan"];
const imageKeywords = ["gpt-image", "image", "imagen", "seedream", "banana", "dall-e", "dalle", "flux", "sdxl", "stable-diffusion", "midjourney"];
const unsupportedTextKeywords = ["embedding", "moderation", "whisper", "tts", "audio", "rerank"];

export function classifyAiModels(models: string[]) {
    const imageModels: string[] = [];
    const videoModels: string[] = [];
    const textModels: string[] = [];
    uniqueModels(models).forEach((model) => {
        const kind = inferAiModelKind(model);
        if (kind === "video") videoModels.push(model);
        else if (kind === "image") imageModels.push(model);
        else if (kind === "text") textModels.push(model);
    });
    return { imageModels, videoModels, textModels };
}

export function modelMatchesAiCapability(model: string, capabilities: string[] | undefined, capability: AiModelKind) {
    const normalizedCapabilities = normalizeAiCapabilities(capabilities);
    if (normalizedCapabilities.length === 1) return normalizedCapabilities[0] === capability;
    const namedKind = inferNamedAiModelKind(model);
    if (namedKind) return (!normalizedCapabilities.length || normalizedCapabilities.includes(namedKind)) && namedKind === capability;
    const inferredKind = inferAiModelKind(model);
    if (normalizedCapabilities.length && inferredKind === "text" && !normalizedCapabilities.includes("text")) return normalizedCapabilities.includes(capability);
    if (inferredKind) return inferredKind === capability;
    return normalizedCapabilities.includes(capability);
}

export function inferAiModelKind(model: string): AiModelKind | "" {
    const namedKind = inferNamedAiModelKind(model);
    if (namedKind) return namedKind;
    const name = model.trim().toLowerCase();
    if (!name || unsupportedTextKeywords.some((keyword) => name.includes(keyword))) return "";
    return "text";
}

function inferNamedAiModelKind(model: string): AiModelKind | "" {
    const name = model.trim().toLowerCase();
    if (!name) return "";
    if (videoKeywords.some((keyword) => name.includes(keyword))) return "video";
    if (imageKeywords.some((keyword) => name.includes(keyword))) return "image";
    return "";
}

function normalizeAiCapabilities(capabilities: string[] | undefined): AiModelKind[] {
    const allowed = new Set<AiModelKind>(["text", "image", "video"]);
    return Array.from(new Set((capabilities || []).map((item) => item.trim().toLowerCase()).filter((item): item is AiModelKind => allowed.has(item as AiModelKind))));
}

function uniqueModels(models: string[]) {
    const seen = new Set<string>();
    return models
        .map((model) => model.trim())
        .filter((model) => {
            if (!model || seen.has(model)) return false;
            seen.add(model);
            return true;
        });
}
