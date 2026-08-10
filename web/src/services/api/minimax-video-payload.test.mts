import assert from "node:assert/strict";
import test from "node:test";

import { buildMiniMaxVideoPayload } from "./minimax-video-payload.ts";

const base = {
    model: "MiniMax-H3",
    prompt: "海边运镜",
    duration: "6",
    ratio: "16:9",
    resolution: "2160",
    watermark: false,
    references: [],
} as const;

test("builds H3 text-to-video with a concrete ratio", () => {
    assert.deepEqual(buildMiniMaxVideoPayload({ ...base, ratio: "adaptive" }), {
        model: "MiniMax-H3",
        content: [{ type: "text", text: "海边运镜" }],
        resolution: "2K",
        duration: 6,
        ratio: "16:9",
        aigc_watermark: false,
    });
});

test("forces adaptive and preserves first-last frame order", () => {
    const payload = buildMiniMaxVideoPayload({
        ...base,
        prompt: "自然过渡",
        duration: "5",
        ratio: "9:16",
        resolution: "768p",
        watermark: true,
        references: [
            { type: "image", url: "data:image/png;base64,AA==", role: "first_frame" },
            { type: "image", url: "https://example.com/end.png", role: "last_frame" },
        ],
    });

    assert.equal(payload.ratio, "adaptive");
    assert.equal(payload.resolution, "768P");
    assert.equal(payload.aigc_watermark, true);
    assert.deepEqual(payload.content.slice(1), [
        { type: "image_url", image_url: { url: "data:image/png;base64,AA==" }, role: "first_frame" },
        { type: "image_url", image_url: { url: "https://example.com/end.png" }, role: "last_frame" },
    ]);
});

test("supports audio-only multimodal references and selected adaptive ratio", () => {
    const payload = buildMiniMaxVideoPayload({ ...base, ratio: "auto", references: [{ type: "audio", url: "data:audio/mp3;base64,AA==", role: "reference_audio" }] });

    assert.equal(payload.ratio, "adaptive");
    assert.deepEqual(payload.content[1], { type: "audio_url", audio_url: { url: "data:audio/mp3;base64,AA==" }, role: "reference_audio" });
});

test("clamps duration and normalizes supported ratios", () => {
    assert.equal(buildMiniMaxVideoPayload({ ...base, duration: "1", ratio: "21:9" }).duration, 4);
    assert.equal(buildMiniMaxVideoPayload({ ...base, duration: "99", ratio: "3:4" }).duration, 15);
    assert.equal(buildMiniMaxVideoPayload({ ...base, ratio: "not-a-ratio" }).ratio, "16:9");
});

test("rejects invalid H3 prompts and reference role mixes", () => {
    assert.throws(() => buildMiniMaxVideoPayload({ ...base, prompt: " " }), /提示词/);
    assert.throws(
        () => buildMiniMaxVideoPayload({ ...base, references: [
            { type: "image", url: "https://example.com/start.png", role: "first_frame" },
            { type: "audio", url: "https://example.com/ref.mp3", role: "reference_audio" },
        ] }),
        /不能混用/,
    );
    assert.throws(
        () => buildMiniMaxVideoPayload({ ...base, references: [
            { type: "image", url: "https://example.com/a.png", role: "first_frame" },
            { type: "image", url: "https://example.com/b.png", role: "first_frame" },
        ] }),
        /首帧不能重复/,
    );
});

test("enforces H3 per-kind and total reference limits", () => {
    const images = Array.from({ length: 10 }, (_, index) => ({ type: "image" as const, url: `https://example.com/${index}.png`, role: "reference_image" as const }));
    const videos = Array.from({ length: 4 }, (_, index) => ({ type: "video" as const, url: `https://example.com/${index}.mp4`, role: "reference_video" as const }));
    const audios = Array.from({ length: 4 }, (_, index) => ({ type: "audio" as const, url: `https://example.com/${index}.mp3`, role: "reference_audio" as const }));
    const total = [
        ...Array.from({ length: 7 }, (_, index) => ({ type: "image" as const, url: `https://example.com/${index}.png`, role: "reference_image" as const })),
        ...Array.from({ length: 3 }, (_, index) => ({ type: "video" as const, url: `https://example.com/${index}.mp4`, role: "reference_video" as const })),
        ...Array.from({ length: 3 }, (_, index) => ({ type: "audio" as const, url: `https://example.com/${index}.mp3`, role: "reference_audio" as const })),
    ];

    assert.throws(() => buildMiniMaxVideoPayload({ ...base, references: images }), /最多支持 9 张图片/);
    assert.throws(() => buildMiniMaxVideoPayload({ ...base, references: videos }), /最多支持 3 个视频/);
    assert.throws(() => buildMiniMaxVideoPayload({ ...base, references: audios }), /最多支持 3 个音频/);
    assert.throws(() => buildMiniMaxVideoPayload({ ...base, references: total }), /最多支持 12 个参考素材/);
});

test("rejects payloads over the MiniMax 64 MB request limit", () => {
    const huge = `data:image/png;base64,${"A".repeat(64 * 1024 * 1024)}`;
    assert.throws(() => buildMiniMaxVideoPayload({ ...base, references: [{ type: "image", url: huge, role: "reference_image" }] }), /超过 64 MB/);
});
