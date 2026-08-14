import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8").catch(() => "");
const toolbar = await source("./canvas-node-hover-toolbar.tsx");
const inspector = await source("./canvas-node-inspector.tsx");
const progress = await source("../utils/canvas-video-progress.ts");
const info = await source("./canvas-node-info-modal.tsx");
const modal = await source("./canvas-video-subtitle-erase-modal.tsx");
const overlays = await source("./canvas-page-overlays.tsx");
const actions = await source("../hooks/use-canvas-node-tool-actions.ts");
const hook = await source("../hooks/use-canvas-video-subtitle-erase-actions.ts");
const page = await source("../[id]/canvas-client-page.tsx");

test("only populated video nodes expose an independent subtitle erase action", () => {
    assert.match(toolbar, /onSubtitleErase/);
    assert.match(toolbar, /if \(hasVideo\).*subtitle-erase.*擦字幕.*onSubtitleErase/s);
    assert.match(inspector, /CanvasNodeType\.Video && hasMedia.*擦字幕.*onSubtitleErase/s);
});

test("modal explains price limits suitability and paid submission", () => {
    for (const text of ["0.4 元/分钟", "最高 2K", "最高 1080P", "竖屏白色字幕效果更佳", "复杂背景可能模糊", "云端付费", "原视频节点不会被替换"]) {
        assert.match(modal, new RegExp(text));
    }
    assert.match(modal, /duration.*60.*unitPriceCny/s);
    assert.match(modal, /toFixed\(2\)/);
});

test("canvas assembly uses a dedicated lifecycle and retry precedence", () => {
    assert.match(hook, /createVideoSubtitleEraseJob/);
    assert.match(hook, /retryVideoSubtitleEraseJob/);
    assert.match(hook, /getMediaBlob/);
    assert.match(hook, /uploadMediaFile/);
    assert.match(hook, /cacheUploadedCanvasMedia/);
    assert.match(hook, /addCanvasNodeToAssets/);
    assert.match(actions, /onSubtitleErase:.*openVideoSubtitleErase/s);
    assert.match(actions, /subtitleErase.*retryVideoSubtitleErase.*videoUpscale.*retryVideoUpscale/s);
    assert.match(overlays, /CanvasVideoSubtitleEraseModal/);
    assert.match(page, /useCanvasVideoSubtitleEraseActions/);
    assert.match(page, /onSubtitleEraseNode=\{videoSubtitleErase\.submit\}/);
});

test("subtitle erase progress and diagnostics never reuse video upscale metadata", () => {
    assert.match(progress, /subtitleErase.*字幕擦除/s);
    assert.match(info, /subtitleErase.*字幕擦除任务/s);
    assert.doesNotMatch(hook, /metadata\?\.videoUpscale/);
    assert.doesNotMatch(modal, /metadata\?\.videoUpscale/);
});
