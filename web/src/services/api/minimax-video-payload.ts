export type MiniMaxImageRole = "first_frame" | "last_frame" | "reference_image";
export type MiniMaxVideoReference =
    | { type: "image"; url: string; role: MiniMaxImageRole }
    | { type: "video"; url: string; role: "reference_video" }
    | { type: "audio"; url: string; role: "reference_audio" };

export type MiniMaxVideoPayloadInput = {
    model: string;
    prompt: string;
    duration: string;
    ratio: string;
    resolution: string;
    watermark: boolean;
    references: MiniMaxVideoReference[];
};

const maxRequestBytes = 64 * 1024 * 1024;

export function buildMiniMaxVideoPayload(input: MiniMaxVideoPayloadInput) {
    const model = input.model.trim();
    const prompt = input.prompt.trim();
    if (!model) throw new Error("缺少模型名称");
    if (!prompt) throw new Error("缺少视频提示词");
    input.references.forEach((item) => {
        if (!item.url.trim()) throw new Error("MiniMax H3 参考素材缺少可读取地址");
    });
    const images = input.references.filter((item) => item.type === "image");
    const videos = input.references.filter((item) => item.type === "video");
    const audios = input.references.filter((item) => item.type === "audio");
    if (images.length > 9) throw new Error("MiniMax H3 最多支持 9 张图片");
    if (videos.length > 3) throw new Error("MiniMax H3 最多支持 3 个视频");
    if (audios.length > 3) throw new Error("MiniMax H3 最多支持 3 个音频");
    if (input.references.length > 12) throw new Error("MiniMax H3 最多支持 12 个参考素材");
    const firstFrames = images.filter((item) => item.role === "first_frame");
    const lastFrames = images.filter((item) => item.role === "last_frame");
    if (firstFrames.length > 1) throw new Error("MiniMax H3 首帧不能重复");
    if (lastFrames.length > 1) throw new Error("MiniMax H3 尾帧不能重复");
    const hasFrames = firstFrames.length > 0 || lastFrames.length > 0;
    const hasReferences = input.references.some((item) => item.type !== "image" || item.role === "reference_image");
    if (hasFrames && hasReferences) throw new Error("MiniMax H3 首尾帧与全能参考不能混用");
    const content = [
        { type: "text" as const, text: prompt },
        ...input.references.map(miniMaxContentItem),
    ];
    const payload = {
        model,
        content,
        resolution: normalizeMiniMaxResolution(input.resolution),
        duration: Math.max(4, Math.min(15, Math.floor(Number(input.duration) || 6))),
        ratio: hasFrames ? "adaptive" : normalizeMiniMaxRatio(input.ratio, input.references.length === 0),
        aigc_watermark: input.watermark,
    };
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > maxRequestBytes) throw new Error("MiniMax H3 请求体超过 64 MB");
    return payload;
}

function miniMaxContentItem(item: MiniMaxVideoReference) {
    if (item.type === "image") return { type: "image_url" as const, image_url: { url: item.url }, role: item.role };
    if (item.type === "video") return { type: "video_url" as const, video_url: { url: item.url }, role: item.role };
    return { type: "audio_url" as const, audio_url: { url: item.url }, role: item.role };
}

function normalizeMiniMaxResolution(value: string) {
    const normalized = value.trim().toLowerCase();
    return normalized === "2k" || normalized === "2160" || normalized === "2160p" ? "2K" : "768P";
}

function normalizeMiniMaxRatio(value: string, textOnly: boolean) {
    const normalized = value === "auto" ? "adaptive" : value;
    const ratio = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(normalized) ? normalized : "16:9";
    return textOnly && ratio === "adaptive" ? "16:9" : ratio;
}
