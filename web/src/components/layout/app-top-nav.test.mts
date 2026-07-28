import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workspace pages do not render a second global top navigation", () => {
    const source = readFileSync(new URL("./app-top-nav.tsx", import.meta.url), "utf8");
    assert.match(source, /\["\/image", "\/video", "\/prompts", "\/assets", "\/cache"\]/);
});
