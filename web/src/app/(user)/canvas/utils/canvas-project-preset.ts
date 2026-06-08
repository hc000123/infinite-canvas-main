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

export type CanvasProjectPresetModelKind = "image" | "video" | "text";

export const canvasProjectPresetOptions = [
    { key: "vertical-drama", label: "竖屏短剧", preset: { resolution: "720", ratio: "9:16", fps: "24", defaultDuration: "8", defaultVideoProvider: "volcengine-ark" } },
    { key: "landscape-film", label: "横屏短片", preset: { resolution: "720", ratio: "16:9", fps: "24", defaultDuration: "8", defaultVideoProvider: "volcengine-ark" } },
    { key: "square-social", label: "方形社媒", preset: { resolution: "720", ratio: "1:1", fps: "24", defaultDuration: "6", defaultVideoProvider: "openai" } },
    { key: "hd-landscape", label: "高清横屏", preset: { resolution: "1080", ratio: "16:9", fps: "30", defaultDuration: "6", defaultVideoProvider: "volcengine-ark" } },
    { key: "hd-vertical", label: "高清竖屏", preset: { resolution: "1080", ratio: "9:16", fps: "30", defaultDuration: "6", defaultVideoProvider: "volcengine-ark" } },
] satisfies Array<{ key: string; label: string; preset: CanvasProjectPreset }>;

export function buildCanvasProjectPresetFromConfig(config: AiConfig, patch: CanvasProjectPreset = {}): CanvasProjectPreset {
    const provider = config.channelMode === "local" ? "openai" : patch.defaultVideoProvider || config.videoProtocol || "openai";
    return {
        resolution: patch.resolution || config.vquality || "720",
        ratio: normalizeCanvasProjectPresetRatio(patch.ratio || config.size || "16:9"),
        fps: patch.fps || "24",
        defaultDuration: patch.defaultDuration || config.videoSeconds || "6",
        defaultImageModel: patch.defaultImageModel || config.imageModel || config.model,
        defaultVideoModel: normalizeVisibleVideoModel(patch.defaultVideoModel) || (provider === "volcengine-ark" ? normalizeVisibleVideoModel(config.seedanceModel) || firstVisibleSeedanceModel(config) : config.videoModel) || config.model,
        defaultTextModel: patch.defaultTextModel || config.textModel || config.model,
        defaultVideoProvider: provider,
    };
}

export function applyCanvasProjectPresetToConfig(config: AiConfig, preset?: CanvasProjectPreset): AiConfig {
    if (!preset) return config;
    const provider = config.channelMode === "local" ? "openai" : preset.defaultVideoProvider || config.videoProtocol;
    const videoModel = preset.defaultVideoModel || (provider === "volcengine-ark" ? config.seedanceEndpointId || config.seedanceModel : config.videoModel);
    return {
        ...config,
        size: normalizeCanvasProjectPresetRatio(preset.ratio || config.size),
        vquality: preset.resolution || config.vquality,
        videoSeconds: preset.defaultDuration || config.videoSeconds,
        imageModel: preset.defaultImageModel || config.imageModel,
        textModel: preset.defaultTextModel || config.textModel,
        videoProtocol: provider,
        videoModel: provider === "openai" ? videoModel || config.videoModel : config.videoModel,
        seedanceModel: provider === "volcengine-ark" && !isSeedanceEndpointModel(videoModel) ? videoModel || config.seedanceModel : config.seedanceModel,
        seedanceEndpointId: provider === "volcengine-ark" && isSeedanceEndpointModel(videoModel) ? videoModel : config.seedanceEndpointId,
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

export function normalizeCanvasProjectPresetRatio(value?: string) {
    const ratio = (value || "").trim();
    if (ratio === "16:9" || ratio === "9:16" || ratio === "1:1" || ratio === "4:3" || ratio === "3:4") return ratio;
    const match = ratio.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (!match) return "16:9";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "16:9";
    const actual = width / height;
    const candidates = [
        { ratio: "16:9", value: 16 / 9 },
        { ratio: "9:16", value: 9 / 16 },
        { ratio: "1:1", value: 1 },
        { ratio: "4:3", value: 4 / 3 },
        { ratio: "3:4", value: 3 / 4 },
    ];
    return candidates.reduce((best, item) => (Math.abs(item.value - actual) < Math.abs(best.value - actual) ? item : best), candidates[0]).ratio;
}

export function canvasProjectPresetModelOptions(config: AiConfig, kind: CanvasProjectPresetModelKind, provider: AiConfig["videoProtocol"] = "openai") {
    if (kind === "image") return uniqueStrings(config.imageModels?.length ? [...config.imageModels, config.imageModel] : [config.imageModel, config.model]).filter(Boolean);
    if (kind === "text") return uniqueStrings(config.textModels?.length ? [...config.textModels, config.textModel] : [config.textModel, config.model]).filter(Boolean);
    if (provider === "volcengine-ark") {
        const visible = uniqueStrings([...(config.videoModels || []), config.seedanceModel]).filter((model) => Boolean(model) && !isSeedanceEndpointModel(model));
        const seedanceModels = visible.filter((model) => model.toLowerCase().includes("seedance") || model === config.seedanceModel);
        return seedanceModels.length ? seedanceModels : visible;
    }
    return uniqueStrings([...(config.videoModels || []), config.videoModel, config.model]).filter((model) => Boolean(model) && !isSeedanceEndpointModel(model));
}

export function isSeedanceEndpointModel(model?: string) {
    return model?.trim().toLowerCase().startsWith("ep-") || false;
}

function normalizeVisibleVideoModel(model?: string) {
    return isSeedanceEndpointModel(model) ? "" : (model || "").trim();
}

function firstVisibleSeedanceModel(config: AiConfig) {
    return canvasProjectPresetModelOptions(config, "video", "volcengine-ark")[0] || config.seedanceModel || config.videoModel || config.model;
}

function uniqueStrings(values: string[]) {
    const seen = new Set<string>();
    return values
        .map((value) => (value || "").trim())
        .filter((value) => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}
