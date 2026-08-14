import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spine = readFileSync(new URL("./app-workspace-spine.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../app/(user)/user-layout-client.tsx", import.meta.url), "utf8");

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
    assert.match(spine, /aria-expanded=\{!collapsed\}/);
    assert.match(spine, /data-collapsed=\{collapsed\}/);
    assert.match(spine, /hideVersion=\{collapsed\}/);
    assert.match(spine, /compactVersion/);
});

test("resource child pages keep the resource entry active", () => {
    assert.match(spine, /slug === "resources"/);
    assert.match(spine, /pathname\.startsWith\("\/prompts"\)/);
    assert.match(spine, /pathname\.startsWith\("\/cache"\)/);
});

test("immersive canvas remains outside the global spine", () => {
    assert.match(layout, /immersiveCanvas/);
    assert.match(layout, /import \{ AppWorkspaceSpine \} from "@\/components\/layout\/app-workspace-spine"/);
    assert.match(layout, /<AppWorkspaceSpine/);
    assert.match(layout, /immersiveCanvas \? null : <AppWorkspaceSpine/);
});
