import type { AiConfig } from "@/stores/use-config-store";
import { modelsForCapability, protocolForModel, resolveGenerationModel } from "../../../../lib/ai-model-catalog.ts";

export type CanvasProjectPreset = {
    resolution?: string;
    ratio?: string;
    fps?: string;
    defaultDuration?: string;
    defaultImageModel?: string;
    defaultVideoModel?: string;
    defaultTextModel?: string;
    /** Legacy display field. Model routing always comes from the backend catalog. */
    defaultVideoProvider?: AiConfig["videoProtocol"];
};

export type CanvasProjectPresetModelKind = "image" | "video" | "text";

export const canvasProjectPresetOptions = [
    { key: "vertical-drama", label: "竖屏短剧", preset: { resolution: "720", ratio: "9:16", fps: "24", defaultDuration: "6" } },
    { key: "landscape-film", label: "横屏短片", preset: { resolution: "720", ratio: "16:9", fps: "24", defaultDuration: "6" } },
    { key: "square-social", label: "方形社媒", preset: { resolution: "720", ratio: "1:1", fps: "24", defaultDuration: "6" } },
    { key: "hd-landscape", label: "高清横屏", preset: { resolution: "1080", ratio: "16:9", fps: "30", defaultDuration: "6" } },
    { key: "hd-vertical", label: "高清竖屏", preset: { resolution: "1080", ratio: "9:16", fps: "30", defaultDuration: "6" } },
] satisfies Array<{ key: string; label: string; preset: CanvasProjectPreset }>;

export function buildCanvasProjectPresetFromConfig(config: AiConfig, patch: CanvasProjectPreset = {}): CanvasProjectPreset {
    return {
        resolution: patch.resolution || config.vquality || "720",
        ratio: normalizeCanvasProjectPresetRatio(patch.ratio || config.size || "16:9"),
        fps: patch.fps || "24",
        defaultDuration: normalizeCanvasProjectPresetDuration(patch.defaultDuration || config.videoSeconds),
        defaultImageModel: patch.defaultImageModel || config.imageModel || config.model,
        defaultVideoModel: resolveGenerationModel({ config, capability: "video", projectModel: normalizeVisibleVideoModel(patch.defaultVideoModel) }),
        defaultTextModel: patch.defaultTextModel || config.textModel || config.model,
    };
}

export function applyCanvasProjectPresetToConfig(config: AiConfig, preset?: CanvasProjectPreset): AiConfig {
    if (!preset) return config;
    const imageModel = resolveGenerationModel({ config, capability: "image", projectModel: preset.defaultImageModel });
    const videoModel = resolveGenerationModel({ config, capability: "video", projectModel: normalizeVisibleVideoModel(preset.defaultVideoModel) });
    const textModel = resolveGenerationModel({ config, capability: "text", projectModel: preset.defaultTextModel });
    const provider = protocolForModel(config, videoModel);
    return {
        ...config,
        size: normalizeCanvasProjectPresetRatio(preset.ratio || config.size),
        vquality: preset.resolution || config.vquality,
        videoSeconds: normalizeCanvasProjectPresetDuration(preset.defaultDuration || config.videoSeconds),
        imageModel,
        textModel,
        videoProtocol: provider,
        videoModel,
        seedanceModel: provider === "volcengine-ark" ? videoModel : config.seedanceModel,
        seedanceEndpointId: "",
    };
}

function normalizeCanvasProjectPresetDuration(value?: string) {
    const duration = String(value || "").trim();
    return duration === "10" ? "6" : duration || "6";
}

export function canvasProjectPresetSummary(preset?: CanvasProjectPreset) {
    if (!preset) return "未设置预设";
    return [presetResolutionLabel(preset.resolution), preset.ratio, preset.fps ? `${preset.fps}fps` : "", preset.defaultDuration ? `${preset.defaultDuration}s` : ""].filter(Boolean).join(" · ") || "未设置预设";
}

function presetResolutionLabel(value?: string) {
    const resolution = value?.trim();
    if (!resolution) return "";
    return resolution.toLowerCase().endsWith("p") ? resolution : `${resolution}p`;
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
    void provider;
    return modelsForCapability(config, kind).filter((model) => !isSeedanceEndpointModel(model));
}

export function isSeedanceEndpointModel(model?: string) {
    return model?.trim().toLowerCase().startsWith("ep-") || false;
}

function normalizeVisibleVideoModel(model?: string) {
    return isSeedanceEndpointModel(model) ? "" : (model || "").trim();
}
