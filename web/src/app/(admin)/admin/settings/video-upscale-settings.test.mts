import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(root, "components/video-upscale-settings-section.tsx"), "utf8");
const page = readFileSync(join(root, "page.tsx"), "utf8");
const api = readFileSync(join(root, "../../../../services/api/admin.ts"), "utf8");

test("video upscale uses its private setting path and LAS credential flag", () => {
	assert.match(component, /\["private",\s*"videoUpscale",\s*"enabled"\]/);
	assert.match(component, /apiKeyConfigured/);
	assert.match(component, /Input\.Password/);
	assert.match(page, /privateVideoUpscale/);
});

test("video upscale exposes LAS and Beijing TOS settings", () => {
	assert.match(component, /\["private",\s*"videoUpscale",\s*"outputTosPath"\]/);
	assert.match(component, /LAS/);
	assert.match(component, /tos:\/\//);
	assert.match(component, /compatible/);
	assert.match(component, /1080p/);
	assert.match(component, /2K/);
	assert.match(component, /operator\.las\.cn-beijing\.volces\.com/);
});

test("admin API reserves a safe video upscale connection-test route", () => {
    assert.match(api, /AdminPrivateVideoUpscaleSettings/);
    assert.match(api, /\/api\/admin\/settings\/video-upscale-test/);
});
