import type { EpisodeAssetRow } from "./components/episode-assets-module-types";

export type EpisodeAssetImagePreset = {
    label: string;
    size: string;
    description: string;
};

export type EpisodeAssetImagePresetOption = EpisodeAssetImagePreset & {
    value: string;
};

export function episodeAssetImagePreset(type: EpisodeAssetRow["type"]): EpisodeAssetImagePreset {
    if (type === "角色") return { label: "角色设定板 21:9", size: "2016x864", description: "适合正面特写、三视图、色板和配饰信息同屏。" };
    if (type === "场景") return { label: "场景规划 16:9", size: "2048x1152", description: "适合空间布局和多角度环境参考。" };
    if (type === "服装") return { label: "服装设定 3:2", size: "1536x1024", description: "适合全身服化、材质和配饰展示。" };
    return { label: "道具白底 1:1", size: "1024x1024", description: "适合单个互动道具的清晰资产图。" };
}

export function episodeAssetImagePresetOptions(type: EpisodeAssetRow["type"]): EpisodeAssetImagePresetOption[] {
    const preset = episodeAssetImagePreset(type);
    const options: EpisodeAssetImagePresetOption[] = [
        { ...preset, value: preset.size },
        { label: "只发比例 21:9", size: "21:9", value: "21:9", description: "适合支持比例参数的模型，避免非标准像素被降级。" },
        { label: "横图 16:9", size: "2048x1152", value: "2048x1152", description: "通用宽屏场景和画面参考。" },
        { label: "横图 3:2", size: "1536x1024", value: "1536x1024", description: "兼容多数 OpenAI 风格生图接口的横图尺寸。" },
        { label: "方图 1:1", size: "1024x1024", value: "1024x1024", description: "适合道具、头像和普通素材图。" },
        { label: "竖图 9:16", size: "1024x1792", value: "1024x1792", description: "适合竖屏人物或移动端构图。" },
        { label: "自动", size: "auto", value: "auto", description: "不发送尺寸参数，交给模型默认处理。" },
    ];
    return options.filter((item, index) => options.findIndex((option) => option.value === item.value) === index);
}
