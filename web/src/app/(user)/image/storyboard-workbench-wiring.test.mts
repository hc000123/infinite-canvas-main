import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pageUrl = new URL("./storyboard-image-workbench.tsx", import.meta.url);

test("builds a project and episode scoped storyboard workspace", () => {
    assert.equal(existsSync(pageUrl), true);
    const source = readFileSync(pageUrl, "utf8");
    assert.match(source, /useCreativeProjectStore/);
    assert.match(source, /useScriptStore/);
    assert.match(source, /episodeMainCanvas/);
    assert.match(source, /<StoryboardShotRail/);
    assert.match(source, /<StoryboardShotEditor/);
    assert.match(source, /<StoryboardCandidateGrid/);
});

test("keeps shot edits on the shared storyboard table", () => {
    const source = readFileSync(pageUrl, "utf8");
    assert.match(source, /updateTableShot/);
    assert.match(source, /addTableShot/);
    assert.match(source, /removeTableShot/);
    assert.match(source, /reorderTableShot/);
});

test("provides empty project, episode and shot states", () => {
    const source = readFileSync(pageUrl, "utf8");
    assert.match(source, /还没有可用项目/);
    assert.match(source, /当前项目还没有集数/);
    assert.match(source, /当前集还没有分镜槽位/);
});

test("exposes storyboard production from its own route", () => {
    const route = readFileSync(new URL("../storyboard/page.tsx", import.meta.url), "utf8");
    const source = readFileSync(pageUrl, "utf8");
    assert.match(route, /StoryboardImageWorkbench/);
    assert.match(route, /return <StoryboardImageWorkbench\s*\/>/);
    assert.match(source, /router\.replace\(`\/storyboard\?\$\{nextQuery\}`/);
    assert.doesNotMatch(source, /router\.replace\(`\/image\?\$\{nextQuery\}`/);
});
