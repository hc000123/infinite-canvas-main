import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("prompt page keeps the Zustand project snapshot stable", () => {
    assert.match(source, /const allProjects = useCreativeProjectStore\(\(state\) => state\.projects\);/);
    assert.match(source, /const projects = useMemo\(\(\) => allProjects\.filter\(\(project\) => project\.status === "active"\), \[allProjects\]\);/);
    assert.doesNotMatch(source, /useCreativeProjectStore\(\(state\) => state\.projects\.filter/);
});
