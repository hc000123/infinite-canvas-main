import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const themeSource = readFileSync(new URL("./app-theme.ts", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("production theme uses neutral surfaces and one selective action accent", () => {
    assert.match(cssSource, /--studio-app-bg:/);
    assert.match(cssSource, /--studio-work-surface:/);
    assert.match(cssSource, /--studio-spine-bg:/);
    assert.match(cssSource, /--studio-accent:/);
    assert.match(cssSource, /--studio-border-subtle:/);
    assert.doesNotMatch(cssSource, /\.studio-shell\s*\{[^}]*linear-gradient/s);
    assert.match(themeSource, /primaryShadow:\s*"none"/);
});

test("production controls do not animate vertical card lift", () => {
    const workspaceRules = cssSource.slice(cssSource.indexOf(".workspace-top-button"), cssSource.indexOf(".studio-workspace :where"));
    assert.doesNotMatch(workspaceRules, /translateY/);
});
