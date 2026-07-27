import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("image Skill writeback renders Runtime renditions and preserves per-image Artifact trace", async () => {
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    assert.match(page, /imageRenditionsFromArtifacts/);
    assert.match(page, /runtimeRenditions\.map[\s\S]*uploadImage\(rendition\.mediaRef\)/);
    assert.match(page, /capabilityTrace:\s*rendition\.trace/);
    assert.match(page, /image\.capabilityTrace \|\| capabilityTrace/);
});
