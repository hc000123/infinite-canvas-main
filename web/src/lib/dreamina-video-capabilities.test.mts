import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDreaminaVideoSettings, resolveDreaminaVideoCapability, validateDreaminaReferences } from "./dreamina-video-capabilities.ts";

test("describes Seedance 2.5 generation capabilities", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "jimeng-cli", model: "seedance2.5", mode: "multimodal2video" });

    assert.deepEqual(capability?.duration, { min: 4, max: 30 });
    assert.deepEqual(capability?.resolutions, ["480", "720"]);
    assert.deepEqual(capability?.references, { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true });
    assert.equal(capability?.label, "2.5 · 4–30s · 多模态");
});

test("describes Ark Seedance 2.5 generation capabilities", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "volcengine-ark", model: "doubao_seedance 2.5", mode: "multimodal2video" });

    assert.equal(capability?.label, "2.5 · 4–30s · 多模态");
    assert.deepEqual(capability?.duration, { min: 4, max: 30 });
    assert.deepEqual(capability?.resolutions, ["480", "720"]);
    assert.equal(capability?.fallbackResolution, "720");
    assert.deepEqual(capability?.references, { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true });
    assert.equal(capability?.fixedModel, false);
});

test("describes Xinglian SD2.5 duration, resolution, and reference limits", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "xinglian-cloud", model: "sd2.5-480p-ax2", mode: "multimodal2video" });

    assert.deepEqual(capability?.duration, { min: 4, max: 30 });
    assert.deepEqual(capability?.resolutions, ["480"]);
    assert.deepEqual(capability?.references, { images: 30, videos: 9, audios: 9, total: 48, allowAudioOnly: false });
    assert.equal(capability?.label, "SD2.5 · 4–30s · 多模态");
});

test("locks Xinglian fixed-duration models to 20 seconds", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "xinglian-cloud", model: "sd2.5-720p-ax2-20s", mode: "text2video" });

    assert.deepEqual(capability?.duration, { min: 20, max: 20 });
    assert.deepEqual(capability?.resolutions, ["720"]);
    assert.equal(capability?.label, "SD2.5 · 固定 20s");
    assert.deepEqual(
        normalizeDreaminaVideoSettings({ protocol: "xinglian-cloud", model: "sd2.5-720p-ax2-20s", mode: "text2video", seconds: "4", resolution: "1080" }),
        { seconds: "20", resolution: "720" },
    );
});

test("describes Xinglian DS models as 10 or 15 second generation", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "xinglian-cloud", model: "sd2-720p-ds-fast", mode: "multimodal2video" });

    assert.deepEqual(capability?.duration, { min: 10, max: 15 });
    assert.deepEqual(capability?.durationOptions, [10, 15]);
    assert.deepEqual(capability?.references, { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: false });
});

test("describes MiniMax H3 generation capabilities", () => {
    const base = { protocol: "minimax" as const, model: "MiniMax-H3", mode: "multimodal2video" as const };
    const capability = resolveDreaminaVideoCapability(base);

    assert.equal(capability?.label, "H3 · 4–15s · 多模态");
    assert.deepEqual(capability?.duration, { min: 4, max: 15 });
    assert.deepEqual(capability?.resolutions, ["768", "2160"]);
    assert.equal(capability?.fallbackResolution, "768");
    assert.deepEqual(capability?.references, { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: true });
    assert.equal(validateDreaminaReferences({ ...base, images: 0, videos: 0, audios: 1 }).error, "");
    assert.deepEqual(normalizeDreaminaVideoSettings({ ...base, seconds: "20", resolution: "720" }), { seconds: "15", resolution: "768" });
    assert.match(validateDreaminaReferences({ ...base, mode: "multiframe2video", images: 2, videos: 0, audios: 0 }).error, /不支持多帧故事/);
});

test("allows GeekNow manxue-2.5 durations from 4 to 29 seconds", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "openai", model: "manxue-2.5", mode: "multimodal2video" });

    assert.equal(capability?.label, "manxue 2.5 · 4–29s · 多模态");
    assert.deepEqual(capability?.duration, { min: 4, max: 29 });
    assert.deepEqual(capability?.resolutions, ["480", "720"]);
    assert.deepEqual(capability?.references, { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true });
    assert.deepEqual(
        normalizeDreaminaVideoSettings({ protocol: "openai", model: "manxue-2.5", mode: "multimodal2video", seconds: "30", resolution: "1080" }),
        { seconds: "29", resolution: "720" },
    );
});

test("does not treat longer Seedance version names as 2.5", () => {
    const ark = resolveDreaminaVideoCapability({ protocol: "volcengine-ark", model: "doubao-seedance-2-50", mode: "multimodal2video" });
    const jimeng = resolveDreaminaVideoCapability({ protocol: "jimeng-cli", model: "seedance2.50", mode: "multimodal2video" });
    const jimengAlias = resolveDreaminaVideoCapability({ protocol: "jimeng-cli", model: "seedance-2-5", mode: "multimodal2video" });

    assert.equal(ark?.label, "");
    assert.deepEqual(ark?.duration, { min: 4, max: 15 });
    assert.deepEqual(ark?.resolutions, ["720", "1080"]);
    assert.equal(jimeng?.label, "");
    assert.deepEqual(jimeng?.duration, { min: 4, max: 15 });
    assert.equal(jimengAlias?.label, "");
});

test("keeps Ark Seedance 2.0 duration, resolution, and audio-only limits", () => {
    const base = { protocol: "volcengine-ark" as const, model: "doubao-seedance-2-0", mode: "multimodal2video" as const };
    const capability = resolveDreaminaVideoCapability(base);

    assert.deepEqual(capability?.duration, { min: 4, max: 15 });
    assert.deepEqual(capability?.resolutions, ["720", "1080"]);
    assert.deepEqual(capability?.references, { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: false });
    assert.match(validateDreaminaReferences({ ...base, images: 0, videos: 0, audios: 1 }).error, /至少添加图片或视频/);
});

test("allows Ark Seedance 2.5 audio-only all-reference input", () => {
    const result = validateDreaminaReferences({ protocol: "volcengine-ark", model: "seedance2.5", mode: "multimodal2video", images: 0, videos: 0, audios: 1 });

    assert.equal(result.error, "");
    assert.equal(result.usageLabel, "1 / 50");
});

test("marks multi-frame as a fixed-model mode", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "jimeng-cli", model: "seedance2.5", mode: "multiframe2video" });

    assert.equal(capability?.fixedModel, true);
    assert.equal(capability?.label, "多帧故事 · 固定模型");
    assert.equal(capability?.notice, "多帧故事使用固定模型，不受当前 2.5 选择影响");
    assert.deepEqual(capability?.segmentDuration, { min: 1, max: 8 });
    assert.deepEqual(capability?.resolutions, ["720", "1080"]);
});

test("normalizes Dreamina settings for the selected model", () => {
    assert.deepEqual(
        normalizeDreaminaVideoSettings({ protocol: "jimeng-cli", model: "seedance2.0fast", mode: "multimodal2video", seconds: "30", resolution: "480" }),
        { seconds: "15", resolution: "720" },
    );
    assert.deepEqual(
        normalizeDreaminaVideoSettings({ protocol: "jimeng-cli", model: "seedance2.5", mode: "multimodal2video", seconds: "24", resolution: "480" }),
        { seconds: "24", resolution: "480" },
    );
    assert.deepEqual(
        normalizeDreaminaVideoSettings({ protocol: "xinglian-cloud", model: "sd2.5-720p-ax2", mode: "multimodal2video", seconds: "30", resolution: "1080" }),
        { seconds: "30", resolution: "720" },
    );
    assert.deepEqual(
        normalizeDreaminaVideoSettings({ protocol: "openai", model: "video-model", mode: "text2video", seconds: "20", resolution: "1080" }),
        { seconds: "20", resolution: "1080" },
    );
});

test("accepts the Seedance 2.5 reference boundary and rejects per-kind overflow", () => {
    const base = { protocol: "jimeng-cli" as const, model: "seedance2.5", mode: "multimodal2video" as const };

    assert.equal(validateDreaminaReferences({ ...base, images: 30, videos: 10, audios: 10 }).error, "");
    assert.match(validateDreaminaReferences({ ...base, images: 31, videos: 0, audios: 0 }).error, /最多支持 30 张图片/);
    assert.match(validateDreaminaReferences({ ...base, images: 0, videos: 11, audios: 0 }).error, /最多支持 10 个视频/);
    assert.match(validateDreaminaReferences({ ...base, images: 0, videos: 0, audios: 11 }).error, /最多支持 10 个音频/);
});

test("allows Seedance 2.5 audio-only all-reference input", () => {
    const result = validateDreaminaReferences({ protocol: "jimeng-cli", model: "seedance2.5", mode: "multimodal2video", images: 0, videos: 0, audios: 1 });

    assert.equal(result.error, "");
    assert.equal(result.usageLabel, "1 / 50");
});

test("returns compact usage details and rejects total overflow", () => {
    const result = validateDreaminaReferences({ protocol: "jimeng-cli", model: "seedance2.5", mode: "multimodal2video", images: 8, videos: 2, audios: 2 });
    const overflow = validateDreaminaReferences({ protocol: "jimeng-cli", model: "seedance2.5", mode: "multimodal2video", images: 30, videos: 10, audios: 11 });

    assert.equal(result.usageLabel, "12 / 50");
    assert.equal(result.detailLabel, "图 8/30 · 视频 2/10 · 音频 2/10");
    assert.match(overflow.error, /最多支持 10 个音频/);
});

test("keeps Seedance 2.0 audio-only restriction", () => {
    const result = validateDreaminaReferences({ protocol: "jimeng-cli", model: "seedance2.0fast", mode: "multimodal2video", images: 0, videos: 0, audios: 1 });

    assert.match(result.error, /至少添加图片或视频/);
});

test("validates fixed-model multi-frame inputs", () => {
    const base = { protocol: "jimeng-cli" as const, model: "seedance2.5", mode: "multiframe2video" as const };

    assert.equal(validateDreaminaReferences({ ...base, images: 2, videos: 0, audios: 0 }).error, "");
    assert.match(validateDreaminaReferences({ ...base, images: 1, videos: 0, audios: 0 }).error, /2–20 张图片/);
    assert.match(validateDreaminaReferences({ ...base, images: 2, videos: 1, audios: 0 }).error, /不能包含视频或音频/);
});
