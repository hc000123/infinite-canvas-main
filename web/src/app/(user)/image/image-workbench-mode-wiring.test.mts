import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("routes bare image entry to storyboard mode and keeps asset mode", async () => {
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /isAssetImageWorkbenchContext\(searchParams\)/);
    assert.match(page, /<AssetImageWorkbench\s*\/>/);
    assert.match(page, /<StoryboardImageWorkbench\s*\/>/);
    assert.match(page, /function AssetImageWorkbench/);
    assert.doesNotMatch(page, /export function AssetImageWorkbench/);
});

test("preserves asset result writeback coordinates", async () => {
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /sourceContext\.libraryAssetId/);
    assert.match(page, /addBriefResultAsset\(sourceContext\.briefId, assetId\)/);
    assert.match(page, /updateProductionBibleItem/);
    assert.match(page, /parseImageWorkbenchSourceContext/);
});
