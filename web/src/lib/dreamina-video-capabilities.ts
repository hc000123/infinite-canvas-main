import type { VideoReferenceMode } from "../services/api/video-reference.ts";
import { isSeedance25Model } from "../services/api/video-normalizers.ts";

export type DreaminaVideoMode = Exclude<VideoReferenceMode, "auto">;
export type DreaminaVideoProtocol = "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud" | "minimax";

export type DreaminaVideoCapability = {
    label: string;
    notice: string;
    duration: { min: number; max: number };
    durationOptions?: number[];
    segmentDuration?: { min: number; max: number };
    resolutions: string[];
    fallbackResolution: string;
    references: { images: number; videos: number; audios: number; total: number; allowAudioOnly: boolean };
    fixedModel: boolean;
};

type DreaminaCapabilityInput = {
    protocol: DreaminaVideoProtocol;
    model: string;
    mode: DreaminaVideoMode;
};

type DreaminaReferenceInput = DreaminaCapabilityInput & {
    images: number;
    videos: number;
    audios: number;
};

export function resolveDreaminaVideoCapability(input: DreaminaCapabilityInput): DreaminaVideoCapability | null {
    if (input.protocol === "openai" && input.model.trim().toLowerCase() === "manxue-2.5") {
        return {
            label: "manxue 2.5 · 4–29s · 多模态",
            notice: "",
            duration: { min: 4, max: 29 },
            resolutions: ["480", "720"],
            fallbackResolution: "720",
            references: { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true },
            fixedModel: false,
        };
    }
    if (input.protocol === "xinglian-cloud") return resolveXinglianVideoCapability(input.model);
    if (input.protocol === "minimax") {
        return {
            label: "H3 · 4–15s · 多模态",
            notice: "",
            duration: { min: 4, max: 15 },
            resolutions: ["768", "2160"],
            fallbackResolution: "768",
            references: { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: true },
            fixedModel: false,
        };
    }
    if (input.protocol !== "jimeng-cli" && input.protocol !== "volcengine-ark") return null;
    if (input.protocol === "jimeng-cli" && input.mode === "multiframe2video") {
        return {
            label: "多帧故事 · 固定模型",
            notice: "多帧故事使用固定模型，不受当前 2.5 选择影响",
            duration: { min: 4, max: 15 },
            segmentDuration: { min: 1, max: 8 },
            resolutions: ["720", "1080"],
            fallbackResolution: "720",
            references: { images: 20, videos: 0, audios: 0, total: 20, allowAudioOnly: false },
            fixedModel: true,
        };
    }
    const seedance25 = input.protocol === "volcengine-ark" ? isSeedance25Model(input.model) : input.model === "seedance2.5";
    if (input.protocol === "volcengine-ark") {
        return {
            label: seedance25 ? "2.5 · 4–30s · 多模态" : "",
            notice: "",
            duration: { min: 4, max: seedance25 ? 30 : 15 },
            resolutions: seedance25 ? ["480", "720"] : ["720", "1080"],
            fallbackResolution: "720",
            references: seedance25
                ? { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true }
                : { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: false },
            fixedModel: false,
        };
    }
    const vip = input.model === "seedance2.0_vip";
    return {
        label: seedance25 ? "2.5 · 4–30s · 多模态" : "",
        notice: "",
        duration: { min: 4, max: seedance25 ? 30 : 15 },
        resolutions: seedance25 ? ["480", "720"] : vip ? ["720", "1080", "2160"] : ["720"],
        fallbackResolution: "720",
        references: seedance25
            ? { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true }
            : { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: false },
        fixedModel: false,
    };
}

export function normalizeDreaminaVideoSettings(input: DreaminaCapabilityInput & { seconds: string; resolution: string }) {
    const capability = resolveDreaminaVideoCapability(input);
    if (!capability) return { seconds: input.seconds, resolution: input.resolution };
    const requestedSeconds = Math.floor(Number(input.seconds) || 6);
    const seconds = capability.durationOptions?.length
        ? capability.durationOptions.reduce((nearest, value) => (Math.abs(value - requestedSeconds) < Math.abs(nearest - requestedSeconds) ? value : nearest))
        : requestedSeconds;
    const resolution = normalizeResolutionValue(input.resolution);
    return {
        seconds: String(Math.max(capability.duration.min, Math.min(capability.duration.max, seconds))),
        resolution: capability.resolutions.includes(resolution) ? resolution : capability.fallbackResolution,
    };
}

function resolveXinglianVideoCapability(model: string): DreaminaVideoCapability {
    const normalized = model.trim().toLowerCase();
    const sd25 = normalized.startsWith("sd2.5-");
    const fixed20 = sd25 && normalized.endsWith("-20s");
    const ds = /^sd2-720p-ds(?:-|$)/.test(normalized);
    const resolution = normalized.includes("1080p") ? "1080" : normalized.includes("480p") ? "480" : "720";
    return {
        label: fixed20 ? "SD2.5 · 固定 20s" : sd25 ? "SD2.5 · 4–30s · 多模态" : ds ? "SD2 · 仅 10/15s" : "",
        notice: ds ? "DS 模型只支持 10 秒或 15 秒" : fixed20 ? "当前模型固定生成 20 秒" : "",
        duration: fixed20 ? { min: 20, max: 20 } : ds ? { min: 10, max: 15 } : { min: 4, max: sd25 ? 30 : 15 },
        durationOptions: fixed20 ? [20] : ds ? [10, 15] : undefined,
        resolutions: [resolution],
        fallbackResolution: resolution,
        references: sd25
            ? { images: 30, videos: 9, audios: 9, total: 48, allowAudioOnly: false }
            : ds
              ? { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: false }
              : { images: 9, videos: 3, audios: 3, total: 15, allowAudioOnly: false },
        fixedModel: false,
    };
}

export function validateDreaminaReferences(input: DreaminaReferenceInput) {
    const empty = { error: "", usageLabel: "", detailLabel: "" };
    const capability = resolveDreaminaVideoCapability(input);
    if (!capability) return empty;
    const total = input.images + input.videos + input.audios;
    if (input.mode === "text2video") return total ? { ...empty, error: "文生视频不能携带参考素材" } : empty;
    if (input.mode === "image2video") return input.images === 1 && !input.videos && !input.audios ? empty : { ...empty, error: "图生视频需要恰好 1 张图片" };
    if (input.mode === "frames2video") return input.images === 2 && !input.videos && !input.audios ? empty : { ...empty, error: "首尾帧需要恰好 2 张图片" };
    if (input.protocol === "minimax" && input.mode === "multiframe2video") return { ...empty, error: "MiniMax H3 不支持多帧故事" };
    if (input.mode === "multiframe2video" && capability.fixedModel) return input.images >= 2 && input.images <= 20 && !input.videos && !input.audios ? empty : { ...empty, error: "多帧故事需要 2–20 张图片，且不能包含视频或音频" };
    const usage = {
        usageLabel: `${total} / ${capability.references.total}`,
        detailLabel: `图 ${input.images}/${capability.references.images} · 视频 ${input.videos}/${capability.references.videos} · 音频 ${input.audios}/${capability.references.audios}`,
    };
    if (!total) return { ...usage, error: "全能参考至少添加一种参考素材" };
    if (!capability.references.allowAudioOnly && !input.images && !input.videos) return { ...usage, error: "全能参考至少添加图片或视频" };
    if (input.images > capability.references.images) return { ...usage, error: `全能参考最多支持 ${capability.references.images} 张图片` };
    if (input.videos > capability.references.videos) return { ...usage, error: `全能参考最多支持 ${capability.references.videos} 个视频` };
    if (input.audios > capability.references.audios) return { ...usage, error: `全能参考最多支持 ${capability.references.audios} 个音频` };
    if (total > capability.references.total) return { ...usage, error: `当前素材 ${total} / ${capability.references.total}，请断开 ${total - capability.references.total} 个参考` };
    return { ...usage, error: "" };
}

function normalizeResolutionValue(value: string) {
    const resolution = value.trim().toLowerCase();
    if (resolution === "4k") return "2160";
    return resolution.replace(/p$/, "");
}
