import assert from "node:assert/strict";
import test from "node:test";

import { buildXinglianVideoPayload } from "./xinglian-video-payload.ts";

test("builds a JSON SD2 request for HTTPS reference media", () => {
    const payload = buildXinglianVideoPayload({
        model: "sd2-720p-fast",
        prompt: "让人物缓缓转头微笑",
        duration: "6",
        ratio: "9:16",
        generateAudio: true,
        images: ["https://files.example.com/reference.png"],
        videos: [],
        audios: ["https://files.example.com/voice.mp3"],
    });

    assert.deepEqual(payload, {
        model: "sd2-720p-fast",
        prompt: "让人物缓缓转头微笑",
        duration: 6,
        ratio: "9:16",
        generate_audio: true,
        images: ["https://files.example.com/reference.png"],
        audios: ["https://files.example.com/voice.mp3"],
    });
});
