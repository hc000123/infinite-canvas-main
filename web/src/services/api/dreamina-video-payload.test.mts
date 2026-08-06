import assert from "node:assert/strict";
import test from "node:test";

import { buildDreaminaVideoPayload } from "./dreamina-video-payload.ts";

function file(name: string, type: string) {
    return new File([name], name, { type });
}

test("builds Dreamina multipart fields and keeps image roles in order", () => {
    const payload = buildDreaminaVideoPayload({
        model: "seedance2.0_vip",
        prompt: "镜头缓慢推进",
        duration: "6",
        ratio: "9:16",
        resolution: "1080p",
        mode: "frames2video",
        images: [
            { file: file("first.png", "image/png"), role: "first_frame" },
            { file: file("last.png", "image/png"), role: "last_frame" },
        ],
        videos: [],
        audios: [],
    });

    assert.equal(payload.get("model"), "seedance2.0_vip");
    assert.equal(payload.get("prompt"), "镜头缓慢推进");
    assert.equal(payload.get("duration"), "6");
    assert.equal(payload.get("ratio"), "9:16");
    assert.equal(payload.get("resolution"), "1080p");
    assert.equal(payload.get("dreamina_mode"), "frames2video");
    assert.deepEqual(payload.getAll("input_image_role[]"), ["first_frame", "last_frame"]);
    assert.deepEqual(payload.getAll("input_image[]").map((entry) => (entry as File).name), ["first.png", "last.png"]);
});

test("infers all five Dreamina modes from auto", () => {
    const modeFor = (images: number, videos = 0, audios = 0, roles: Array<"reference_image" | "first_frame" | "last_frame"> = []) =>
        buildDreaminaVideoPayload({
            model: "seedance2.0fast",
            prompt: "test",
            duration: "4",
            ratio: "16:9",
            resolution: "720p",
            mode: "auto",
            images: Array.from({ length: images }, (_, index) => ({ file: file(`${index}.png`, "image/png"), role: roles[index] || "reference_image" })),
            videos: Array.from({ length: videos }, (_, index) => file(`${index}.mp4`, "video/mp4")),
            audios: Array.from({ length: audios }, (_, index) => file(`${index}.mp3`, "audio/mpeg")),
        }).get("dreamina_mode");

    assert.equal(modeFor(0), "text2video");
    assert.equal(modeFor(1, 0, 0, ["first_frame"]), "image2video");
    assert.equal(modeFor(2, 0, 0, ["first_frame", "last_frame"]), "frames2video");
    assert.equal(modeFor(3), "multiframe2video");
    assert.equal(modeFor(1, 1, 1), "multimodal2video");
});

test("rejects media combinations that the selected Dreamina mode cannot accept", () => {
    const common = { model: "seedance2.0fast", prompt: "test", duration: "4", ratio: "16:9", resolution: "720p" } as const;

    assert.throws(
        () => buildDreaminaVideoPayload({ ...common, mode: "image2video", images: [], videos: [], audios: [] }),
        /图生视频需要恰好 1 张图片/,
    );
    assert.throws(
        () => buildDreaminaVideoPayload({ ...common, mode: "multimodal2video", images: [], videos: [], audios: [file("voice.mp3", "audio/mpeg")] }),
        /至少添加图片或视频/,
    );
});

test("adds video and audio files to multimodal requests", () => {
    const payload = buildDreaminaVideoPayload({
        model: "seedance2.0fast",
        prompt: "test",
        duration: "4",
        ratio: "16:9",
        resolution: "720p",
        mode: "multimodal2video",
        images: [{ file: file("image.png", "image/png"), role: "reference_image" }],
        videos: [file("clip.mp4", "video/mp4")],
        audios: [file("voice.mp3", "audio/mpeg")],
    });

    assert.equal((payload.get("input_video[]") as File).name, "clip.mp4");
    assert.equal((payload.get("input_audio[]") as File).name, "voice.mp3");
});

test("allows Seedance 2.5 audio-only multimodal requests", () => {
    const payload = buildDreaminaVideoPayload({
        model: "seedance2.5",
        prompt: "跟随音乐生成画面",
        duration: "30",
        ratio: "16:9",
        resolution: "480p",
        mode: "multimodal2video",
        images: [],
        videos: [],
        audios: [file("music.mp3", "audio/mpeg")],
    });

    assert.equal(payload.get("model"), "seedance2.5");
    assert.equal(payload.get("duration"), "30");
    assert.equal(payload.get("resolution"), "480p");
    assert.equal((payload.get("input_audio[]") as File).name, "music.mp3");
});
