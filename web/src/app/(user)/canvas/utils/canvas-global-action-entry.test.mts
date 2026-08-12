import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const componentUrl = (name: string) => new URL(`../components/${name}`, import.meta.url);
const topBar = readFileSync(componentUrl("canvas-top-bar.tsx"), "utf8");
const toolbar = readFileSync(componentUrl("canvas-toolbar.tsx"), "utf8");
const floatingControls = readFileSync(componentUrl("canvas-floating-controls.tsx"), "utf8");
const createRailUrl = componentUrl("canvas-create-rail.tsx");
const createRail = existsSync(createRailUrl) ? readFileSync(createRailUrl, "utf8") : "";

test("top bar keeps one primary import, assets, organize, and save entry outside the menu", () => {
    for (const label of ["\u5bfc\u5165", "\u7d20\u6750", "\u6574\u7406\u753b\u5e03", "\u4fdd\u5b58"]) {
        assert.equal(topBar.match(new RegExp(`<TopAction[^>]+label="${label}"`, "g"))?.length || 0, 1, `${label} should have exactly one TopAction`);
    }

    for (const key of ["save", "import", "assets", "organize"]) {
        assert.doesNotMatch(topBar, new RegExp(`key:\\s*"${key}"`));
    }
});

test("create rail exposes only focused placement actions", () => {
    assert.equal(existsSync(createRailUrl), true, "canvas-create-rail.tsx should exist");
    assert.match(createRail, /aria-label="\u5de6\u4fa7\u521b\u5efa\u680f"/);
    for (const label of ["\u9009\u62e9", "\u6587\u672c", "\u56fe\u7247", "\u89c6\u9891", "\u97f3\u9891", "\u66f4\u591a"]) assert.match(createRail, new RegExp(`label="${label}"`));
    for (const label of ["\u4fdd\u5b58", "\u7d20\u6750", "\u6574\u7406", "\u5220\u9664"]) assert.doesNotMatch(createRail, new RegExp(`label="[^"]*${label}`));
});

test("bottom toolbar public actions stay focused on selection, history, and appearance", () => {
    const actions = toolbar.match(/export type CanvasToolbarActions = \{([\s\S]*?)\n\};/)?.[1] || "";
    for (const name of ["onDeselect", "onUndo", "onRedo", "onDelete", "onBackgroundModeChange", "onShowImageInfoChange"]) assert.match(actions, new RegExp(`\\b${name}:`));
    for (const name of ["onAddImage", "onAddVideo", "onAddAudio", "onAddText", "onAddConfig", "onUpload", "onOpenAssets", "onOpenEpisodeWorkbench", "onClear"]) assert.doesNotMatch(actions, new RegExp(`\\b${name}:`));
});

test("floating controls mount the create rail with reused action callbacks", () => {
    assert.match(floatingControls, /import \{ CanvasCreateRail/);
    assert.match(floatingControls, /<CanvasCreateRail\s+actions=\{toolbarActions\}/);
    assert.doesNotMatch(floatingControls, /createNode\s*\(\s*CanvasNodeType\./);
});
