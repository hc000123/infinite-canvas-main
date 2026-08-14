import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spine = readFileSync(new URL("./app-workspace-spine.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("./user-status-actions.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../app/(user)/user-layout-client.tsx", import.meta.url), "utf8");
const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("application spine reuses route context and exposes stable navigation", () => {
    assert.match(spine, /navigationTools/);
    assert.match(spine, /contextualToolHref/);
    assert.match(spine, /workspaceProjectId/);
    assert.match(spine, /aria-label="全局工作区"/);
    assert.match(spine, /aria-current=/);
    assert.match(spine, /UserStatusActions/);
});

test("application spine persists collapse state and remains accessible", () => {
    assert.match(spine, /workspace-spine-collapsed/);
    assert.match(spine, /localStorage\.getItem/);
    assert.match(spine, /localStorage\.setItem/);
    assert.match(spine, /function readCollapsedPreference\(\)/);
    assert.match(spine, /function writeCollapsedPreference\(collapsed: boolean\)/);
    assert.match(spine, /try \{/);
    assert.match(spine, /catch \{/);
    assert.match(spine, /setCollapsed\(readCollapsedPreference\(\)\)/);
    assert.match(spine, /writeCollapsedPreference\(next\)/);
    assert.match(spine, /matchMedia\("\(max-width: 899px\)"\)/);
    assert.match(spine, /const effectiveCollapsed = collapsed \|\| compactViewport/);
    assert.match(spine, /aria-expanded=\{!effectiveCollapsed\}/);
    assert.match(spine, /data-collapsed=\{effectiveCollapsed\}/);
    assert.match(spine, /hideVersion=\{effectiveCollapsed\}/);
    assert.match(spine, /disabled=\{compactViewport\}/);
});

test("version compact styling stays private to the application spine", () => {
    assert.doesNotMatch(actions, /compactVersion/);
    assert.doesNotMatch(spine, /compactVersion/);
    assert.match(globals, /\.studio-spine-footer button\[title="查看版本更新"\]/);
});

test("resource child pages keep the resource entry active", () => {
    assert.match(spine, /slug === "resources"/);
    assert.match(spine, /pathname\.startsWith\("\/prompts"\)/);
    assert.match(spine, /pathname\.startsWith\("\/cache"\)/);
});

test("immersive canvas remains outside the global spine", () => {
    assert.match(layout, /immersiveCanvas/);
    assert.match(layout, /import \{ AppWorkspaceSpine \} from "@\/components\/layout\/app-workspace-spine"/);
    assert.match(layout, /import \{ AppConfigModal \} from "@\/components\/layout\/app-config-modal"/);
    assert.match(layout, /<AppWorkspaceSpine/);
    assert.match(layout, /immersiveCanvas \? null : <AppWorkspaceSpine/);
    assert.match(layout, /<AppConfigModal \/>/);
    assert.equal(layout.match(/<AppConfigModal \/>/g)?.length, 1);
});
