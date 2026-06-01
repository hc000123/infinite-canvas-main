export type SeedanceContentItem =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string }; role: "reference_image" }
    | { type: "video_url"; video_url: { url: string }; role: "reference_video" };

type SeedanceVideoTaskConfig = {
    model?: string;
    seedanceModel?: string;
    videoModel?: string;
    videoSeconds?: string;
    size?: string;
    vquality?: string;
    videoGenerateAudio?: string;
    videoWatermark?: string;
    videoSeed?: string;
};

export function buildSeedanceContent(prompt: string, imageUrls: string[], videoUrls: string[]): SeedanceContentItem[] {
    const images = imageUrls.filter(Boolean).slice(0, 9);
    const videos = videoUrls.filter(Boolean).slice(0, Math.max(0, 12 - images.length)).slice(0, 3);
    return [
        { type: "text", text: prompt },
        ...images.map((url) => ({ type: "image_url" as const, image_url: { url }, role: "reference_image" as const })),
        ...videos.map((url) => ({ type: "video_url" as const, video_url: { url }, role: "reference_video" as const })),
    ];
}

export function buildSeedanceVideoTaskPayload(config: SeedanceVideoTaskConfig, prompt: string, imageUrls: string[], videoUrls: string[]) {
    const payload: Record<string, unknown> = {
        model: config.model || config.seedanceModel || config.videoModel,
        content: buildSeedanceContent(prompt, imageUrls, videoUrls),
        duration: normalizeSeedanceDuration(config.videoSeconds || ""),
        ratio: normalizeSeedanceRatio(config.size || ""),
        resolution: normalizeSeedanceResolution(config.vquality || ""),
        generate_audio: config.videoGenerateAudio === "true",
        watermark: config.videoWatermark === "true",
    };
    const seed = normalizeSeedanceSeed(config.videoSeed || "");
    if (seed !== undefined) payload.seed = seed;
    return payload;
}

function normalizeSeedanceDuration(value: string) {
    const seconds = Math.floor(Number(value) || 5);
    if (seconds <= 5) return 5;
    if (seconds <= 10) return 10;
    return 15;
}

function normalizeSeedanceRatio(value: string) {
    if (value === "auto" || value === "adaptive") return "adaptive";
    if (["16:9", "9:16", "1:1", "4:3", "3:4"].includes(value)) return value;
    if (value === "1024x1024") return "1:1";
    if (value === "720x1280" || value === "1024x1792") return "9:16";
    if (value === "1280x720" || value === "1792x1024") return "16:9";
    return value.includes("x") && Number(value.split("x")[0]) < Number(value.split("x")[1]) ? "9:16" : "16:9";
}

function normalizeSeedanceResolution(value: string) {
    const resolution = Number(value.replace(/p$/i, "")) || 720;
    return resolution >= 1080 ? "1080p" : "720p";
}

function normalizeSeedanceSeed(value: string) {
    const seed = Math.floor(Number(value));
    return Number.isFinite(seed) && value.trim() ? seed : undefined;
}
