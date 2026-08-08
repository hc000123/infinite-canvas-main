import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../[id]/canvas-client-page.tsx", import.meta.url), "utf8");
const toolbar = await readFile(new URL("./canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const inspector = await readFile(new URL("./canvas-node-inspector.tsx", import.meta.url), "utf8");
const overlays = await readFile(new URL("./canvas-page-overlays.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../hooks/use-canvas-image-upscale-actions.ts", import.meta.url), "utf8");
const modal = await readFile(new URL("./canvas-image-upscale-modal.tsx", import.meta.url), "utf8");

test("wires the upscale action through canvas assembly and image-only controls", () => {
    assert.match(page, /useCanvasImageUpscaleActions\(/);
    assert.match(page, /onUpscaleImageNode=\{imageUpscale\.submit\}/);
    assert.match(page, /upscaleNode=\{imageUpscale\.node\}/);
    assert.match(toolbar, /key: "upscale"/);
    assert.match(toolbar, /label: "超分"/);
    assert.match(toolbar, /if \(hasImage\).*onUpscale/s);
    assert.match(inspector, /label="超分"/);
    assert.match(overlays, /CanvasImageUpscaleModal/);
});

test("recovers existing jobs without creating a second paid task", () => {
    assert.match(actions, /imageUpscaleJobActive/);
    assert.match(actions, /getImageUpscaleJob/);
    assert.match(actions, /pollingJobIdsRef/);
    assert.match(actions, /upscale\.status === "succeeded"/);
    assert.doesNotMatch(actions, /createImageUpscaleJob\([^)]*imageUpscaleJobActive/s);
    assert.match(actions, /retryImageUpscaleJob/);
    assert.match(actions, /addCanvasNodeToAssets/);
    assert.match(actions, /submittingRef/);
    assert.match(modal, /capabilities\?\.enabled === true/);
});

test("uses asset terminology for the touched canvas save actions", () => {
    assert.doesNotMatch(toolbar, /我的素材/);
    assert.match(toolbar, /加入资产/);
});
