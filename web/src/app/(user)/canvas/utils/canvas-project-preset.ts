import type { AiConfig } from "@/stores/use-config-store";

export type CanvasProjectPreset = {
    resolution?: string;
    ratio?: string;
    fps?: string;
    defaultDuration?: string;
    defaultImageModel?: string;
    defaultVideoModel?: string;
    defaultTextModel?: string;
    defaultVideoProvider?: AiConfig["videoProtocol"];
};

export const canvasProjectPresetOptions = [
    { key: "vertical-drama", label: "竖屏短剧", preset: { resolution: "720", ratio: "9:16", fps: "24", defaultDuration: "8", defaultVideoProvider: "volcengine-ark" } },
    { key: "landscape-film", label: "横屏短片", preset: { resolution: "720", ratio: "16:9", fps: "24", defaultDuration: "8", defaultVideoProvider: "volcengine-ark" } },
    { key: "square-social", label: "方形社媒", preset: { resolution: "720", ratio: "1:1", fps: "24", defaultDuration: "6", defaultVideoProvider: "openai" } },
    { key: "hd-landscape", label: "高清横屏", preset: { resolution: "1080", ratio: "16:9", fps: "30", defaultDuration: "10", defaultVideoProvider: "volcengine-ark" } },
    { key: "hd-vertical", label: "高清竖屏", preset: { resolution: "1080", ratio: "9:16", fps: "30", defaultDuration: "10", defaultVideoProvider: "volcengine-ark" } },
] satisfies Array<{ key: string; label: string; preset: CanvasProjectPreset }>;

export function buildCanvasProjectPresetFromConfig(config: AiConfig, patch: CanvasProjectPreset = {}): CanvasProjectPreset {
    return {
        resolution: patch.resolution || config.vquality || "720",
        ratio: patch.ratio || config.size || "1:1",
        fps: patch.fps || "24",
        defaultDuration: patch.defaultDuration || config.videoSeconds || "6",
        defaultImageModel: patch.defaultImageModel || config.imageModel || config.model,
        defaultVideoModel:
            patch.defaultVideoModel || (patch.defaultVideoProvider === "volcengine-ark" || config.videoProtocol === "volcengine-ark" ? config.seedanceEndpointId || config.seedanceModel || config.videoModel : config.videoModel) || config.model,
        defaultTextModel: patch.defaultTextModel || config.textModel || config.model,
        defaultVideoProvider: patch.defaultVideoProvider || config.videoProtocol || "openai",
    };
}

export function applyCanvasProjectPresetToConfig(config: AiConfig, preset?: CanvasProjectPreset): AiConfig {
    if (!preset) return config;
    const provider = preset.defaultVideoProvider || config.videoProtocol;
    const videoModel = preset.defaultVideoModel || (provider === "volcengine-ark" ? config.seedanceEndpointId || config.seedanceModel : config.videoModel);
    return {
        ...config,
        size: preset.ratio || config.size,
        vquality: preset.resolution || config.vquality,
        videoSeconds: preset.defaultDuration || config.videoSeconds,
        imageModel: preset.defaultImageModel || config.imageModel,
        textModel: preset.defaultTextModel || config.textModel,
        videoProtocol: provider,
        videoModel: provider === "openai" ? videoModel || config.videoModel : config.videoModel,
        seedanceModel: provider === "volcengine-ark" ? videoModel || config.seedanceModel : config.seedanceModel,
        seedanceEndpointId: provider === "volcengine-ark" && videoModel?.toLowerCase().startsWith("ep-") ? videoModel : config.seedanceEndpointId,
    };
}

export function canvasProjectPresetSummary(preset?: CanvasProjectPreset) {
    if (!preset) return "未设置预设";
    return [preset.resolution ? `${preset.resolution}p` : "", preset.ratio, preset.fps ? `${preset.fps}fps` : "", preset.defaultDuration ? `${preset.defaultDuration}s` : ""].filter(Boolean).join(" · ") || "未设置预设";
}

export function canvasProjectPresetConfig(preset?: CanvasProjectPreset) {
    if (!preset) return undefined;
    return Object.fromEntries(
        Object.entries({
            resolution: preset.resolution,
            ratio: preset.ratio,
            fps: preset.fps,
            defaultDuration: preset.defaultDuration,
            defaultImageModel: preset.defaultImageModel,
            defaultVideoModel: preset.defaultVideoModel,
            defaultTextModel: preset.defaultTextModel,
            defaultVideoProvider: preset.defaultVideoProvider,
        }).filter(([, value]) => value !== undefined && value !== ""),
    );
}
