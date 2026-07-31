import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("project Skill management can recover after deleting its only draft", () => {
    assert.match(page, /const sourceVersion = activeVersion \|\| item\.versions\[0\]/);
    assert.match(page, /sourceVersion \? nextPatch\(sourceVersion\.version\) : "1\.0\.0"/);
    assert.doesNotMatch(page, /disabled=\{!detailQuery\.data\}/);
});

test("archived project Skill versions are view-only", () => {
    assert.match(page, /activeVersion\.status === "archived"/);
});
