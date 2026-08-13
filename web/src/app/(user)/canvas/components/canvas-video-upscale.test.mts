import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbar = await readFile(new URL("./canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const inspector = await readFile(new URL("./canvas-node-inspector.tsx", import.meta.url), "utf8");
const modal = await readFile(new URL("./canvas-video-upscale-modal.tsx", import.meta.url), "utf8");
const overlays = await readFile(new URL("./canvas-page-overlays.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../hooks/use-canvas-node-tool-actions.ts", import.meta.url), "utf8");
const hook = await readFile(new URL("../hooks/use-canvas-video-upscale-actions.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../[id]/canvas-client-page.tsx", import.meta.url), "utf8");

test("only populated video nodes expose the video upscale action", () => {
    assert.match(toolbar, /if \(hasVideo\).*video-upscale/s);
    assert.match(inspector, /CanvasNodeType\.Video && hasMedia.*视频超分/s);
});

test("modal displays source target duration and cloud billing warning", () => {
    for (const text of ["源规格", "目标规格", "时长", "云端付费", "原视频节点不会被替换"]) assert.match(modal, new RegExp(text));
});

test("canvas assembly keeps video upscale in its own hook and modal", () => {
    assert.match(hook, /createVideoUpscaleJob/);
    assert.match(hook, /retryVideoUpscaleJob/);
    assert.match(hook, /getMediaBlob/);
    assert.match(hook, /uploadMediaFile/);
    assert.match(hook, /cacheUploadedCanvasMedia/);
    assert.match(hook, /addCanvasNodeToAssets/);
    assert.match(actions, /node\.type.*Video.*openVideoUpscale/s);
    assert.match(actions, /videoUpscale.*retryVideoUpscale/s);
    assert.match(overlays, /CanvasVideoUpscaleModal/);
    assert.match(page, /useCanvasVideoUpscaleActions/);
});
