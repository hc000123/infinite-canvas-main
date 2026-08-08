import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("freezes the shot coordinate and chooses generation mode from references", () => {
    const source = readFileSync(new URL("./use-storyboard-image-generation.ts", import.meta.url), "utf8");
    assert.match(source, /shot:\s*\{ \.\.\.shot \}/);
    assert.match(source, /snapshot\.references\.length\s*\?\s*await requestEdit/);
    assert.match(source, /:\s*await requestGeneration/);
    assert.match(source, /shotId:\s*snapshot\.shot\.id/);
    assert.match(source, /sourceType:\s*"image_generation"/);
});

test("persists successful slots and retains failed slots for retry", () => {
    const source = readFileSync(new URL("./use-storyboard-image-generation.ts", import.meta.url), "utf8");
    assert.match(source, /addWorkbenchImage\(/);
    assert.match(source, /role:\s*"candidate"/);
    assert.match(source, /status:\s*"failed"/);
    assert.match(source, /snapshots\.current\.get\(slotId\)/);
});
