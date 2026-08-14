import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const componentUrl = (name: string) => new URL(`../components/${name}`, import.meta.url);
const topBar = readFileSync(componentUrl("canvas-top-bar.tsx"), "utf8");
const toolbar = readFileSync(componentUrl("canvas-toolbar.tsx"), "utf8");
const floatingControls = readFileSync(componentUrl("canvas-floating-controls.tsx"), "utf8");
const miniMap = readFileSync(componentUrl("canvas-mini-map.tsx"), "utf8");
const toolbarActionsHook = readFileSync(new URL("../hooks/use-canvas-toolbar-actions.ts", import.meta.url), "utf8");
const clientPage = readFileSync(new URL("../[id]/canvas-client-page.tsx", import.meta.url), "utf8");
const createRailUrl = componentUrl("canvas-create-rail.tsx");
const createRail = existsSync(createRailUrl) ? readFileSync(createRailUrl, "utf8") : "";

test("top bar keeps one desktop entry for each primary global action", () => {
    for (const label of ["\u5bfc\u5165", "\u7d20\u6750", "\u6574\u7406\u753b\u5e03", "\u4fdd\u5b58"]) {
        assert.equal(topBar.match(new RegExp(`<TopAction[^>]+label="${label}"`, "g"))?.length || 0, 1, `${label} should have exactly one TopAction`);
    }

    assert.match(topBar, /className="hidden items-center gap-1 md:flex"/);
});

test("top bar keeps the four global actions reachable through one mobile dropdown", () => {
    assert.match(topBar, /import \{[^\n]*Dropdown[^\n]*\} from "antd"/);
    assert.match(topBar, /className="[^"]*\bmd:hidden\b[^"]*"/);
    assert.match(topBar, /aria-label="\u5168\u5c40\u64cd\u4f5c"/);
    assert.match(topBar, /aria-haspopup="menu"/);
    assert.match(topBar, /aria-expanded=\{globalActionsOpen\}/);
    assert.match(topBar, /open=\{globalActionsOpen\}/);
    assert.match(topBar, /onOpenChange=\{setGlobalActionsOpen\}/);

    for (const [key, callback] of [
        ["global-import", "onImportImage"],
        ["global-assets", "onOpenAssets"],
        ["global-organize", "onOrganizeCanvas"],
        ["global-save", "onSaveProject"],
    ]) {
        assert.equal(topBar.match(new RegExp(`key:\\s*"${key}"`, "g"))?.length || 0, 1, `${key} should have exactly one mobile menu item`);
        assert.match(topBar, new RegExp(`key:\\s*"${key}"[^\\n]+onClick:\\s*${callback}`));
    }
});

test("primary canvas menu does not duplicate global action keys", () => {

    for (const key of ["save", "import", "assets", "organize"]) {
        assert.doesNotMatch(topBar, new RegExp(`key:\\s*"${key}"`));
    }
});

test("primary canvas menu keeps one confirmed clear-canvas entry", () => {
    assert.equal(topBar.match(/key:\s*"clear"/g)?.length || 0, 1);
    assert.match(topBar, /key:\s*"clear"[^\n]+danger:\s*true[^\n]+label:\s*"\u6e05\u7a7a\u753b\u5e03"[^\n]+onClick:\s*onClearCanvas/);
    assert.match(topBar, /onClearCanvas:\s*\(\) => void/);
    assert.match(toolbarActionsHook, /setClearConfirmOpen:\s*Dispatch<SetStateAction<boolean>>/);
    assert.match(toolbarActionsHook, /onClear:\s*\(\) => setClearConfirmOpen\(true\)/);
    assert.match(clientPage, /useCanvasToolbarActions\(\{[\s\S]*?setClearConfirmOpen,[\s\S]*?\}\)/);
    assert.match(clientPage, /<CanvasTopBar[\s\S]*?onClearCanvas=\{toolbarActions\.onClear\}/);
});

test("create rail exposes only focused placement actions", () => {
    assert.equal(existsSync(createRailUrl), true, "canvas-create-rail.tsx should exist");
    assert.match(createRail, /aria-label="\u5de6\u4fa7\u521b\u5efa\u680f"/);
    for (const label of ["\u9009\u62e9", "\u6587\u672c", "\u56fe\u7247", "\u89c6\u9891", "\u97f3\u9891", "\u66f4\u591a"]) assert.match(createRail, new RegExp(`label="${label}"`));
    for (const label of ["\u4fdd\u5b58", "\u7d20\u6750", "\u6574\u7406", "\u5220\u9664"]) assert.doesNotMatch(createRail, new RegExp(`label="[^"]*${label}`));
    assert.doesNotMatch(createRail, /\u6e05\u7a7a\u753b\u5e03|onClear/);
});

test("create rail more menu is a controlled accessible dropdown", () => {
    assert.match(createRail, /import \{ Dropdown \} from "antd"/);
    assert.match(createRail, /<Dropdown/);
    assert.match(createRail, /open=\{moreOpen\}/);
    assert.match(createRail, /onOpenChange=\{setMoreOpen\}/);
    assert.match(createRail, /aria-haspopup="menu"/);
    assert.match(createRail, /aria-expanded=\{moreOpen\}/);
    assert.match(createRail, /focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-\[var\(--studio-focus-ring\)\]/);
    assert.match(createRail, /menu=\{\{ items: moreItems \}\}/);
    assert.match(createRail, /key:\s*"config"[^\n]+actions\.onAddConfig\(\)[^\n]+setMoreOpen\(false\)/);
    assert.match(createRail, /key:\s*"upload"[^\n]+actions\.onUpload\(\)[^\n]+setMoreOpen\(false\)/);
});

test("create rail and minimap use separate canvas edges", () => {
    assert.match(createRail, /\bleft-4\b/);
    assert.match(miniMap, /\bright-6\b/);
    assert.doesNotMatch(miniMap, /\bleft-6\b/);
});

test("bottom toolbar public actions stay focused on selection, history, and appearance", () => {
    const actions = toolbar.match(/export type CanvasToolbarActions = \{([\s\S]*?)\n\};/)?.[1] || "";
    for (const name of ["onDeselect", "onUndo", "onRedo", "onDelete", "onBackgroundModeChange", "onShowImageInfoChange"]) assert.match(actions, new RegExp(`\\b${name}:`));
    for (const name of ["onAddImage", "onAddVideo", "onAddAudio", "onAddText", "onAddConfig", "onUpload", "onOpenAssets", "onOpenEpisodeWorkbench"]) assert.doesNotMatch(actions, new RegExp(`\\b${name}:`));
    assert.doesNotMatch(toolbar, /\u6e05\u7a7a\u753b\u5e03/);
});

test("floating controls mount the create rail with reused action callbacks", () => {
    assert.match(floatingControls, /import \{ CanvasCreateRail/);
    assert.match(floatingControls, /<CanvasCreateRail\s+actions=\{toolbarActions\}/);
    assert.doesNotMatch(floatingControls, /createNode\s*\(\s*CanvasNodeType\./);
});
