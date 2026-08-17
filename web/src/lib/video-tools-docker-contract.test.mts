import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");
const runtimeStage = dockerfile.split("# 运行镜像")[1] || "";

test("production Docker runtime installs ffprobe for video validation", () => {
    assert.match(runtimeStage, /apt-get update[\s\S]*apt-get install[\s\S]*ffmpeg/);
    assert.match(runtimeStage, /rm -rf \/var\/lib\/apt\/lists\/\*/);
});
