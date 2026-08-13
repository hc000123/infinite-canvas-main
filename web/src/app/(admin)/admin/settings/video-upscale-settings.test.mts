import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(root, "components/video-upscale-settings-section.tsx"), "utf8");
const page = readFileSync(join(root, "page.tsx"), "utf8");
const api = readFileSync(join(root, "../../../../services/api/admin.ts"), "utf8");

test("video upscale uses its private setting path and shared Volcengine credential flags", () => {
    assert.match(component, /\["private",\s*"videoUpscale",\s*"enabled"\]/);
    assert.match(component, /accessKeyConfigured/);
    assert.match(component, /secretKeyConfigured/);
    assert.doesNotMatch(component, /Input\.Password/);
    assert.match(page, /privateVolcengineAsset/);
    assert.match(page, /privateVideoUpscale/);
});

test("video upscale exposes fixed VOD settings and the official console link", () => {
    assert.match(component, /\["private",\s*"videoUpscale",\s*"spaceName"\]/);
    assert.match(component, /AIGC/);
    assert.match(component, /Standard/);
    assert.match(component, /1080p/);
    assert.match(component, /2K/);
    assert.match(component, /console\.volcengine\.com\/vod/);
});

test("admin API reserves a safe video upscale connection-test route", () => {
    assert.match(api, /AdminPrivateVideoUpscaleSettings/);
    assert.match(api, /\/api\/admin\/settings\/video-upscale-test/);
});
