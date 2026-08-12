import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the legacy image route as a non-generating asset redirect", async () => {
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /legacyImageDestination/);
    assert.match(page, /router\.replace\(destination\)/);
    assert.match(page, /正在转到资产生图/);
    assert.doesNotMatch(page, /AssetImageWorkbench/);
    assert.doesNotMatch(page, /StoryboardImageWorkbench/);
    assert.doesNotMatch(page, /requestGeneration|requestEdit|ImageSettingsPanel|ModelPicker/);
});
