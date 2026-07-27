import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../projects/[id]/episodes/[episodeId]/workflow/use-workflow-video-actions.ts", import.meta.url), "utf8");

test("archives generated workflow videos and tail frames into the project cache", () => {
    assert.match(source, /archiveLocalMediaToProjectCache/);
    assert.ok((source.match(/await cacheWorkflowAsset\(/g) || []).length >= 2);
    assert.match(source, /item\.generation\?\.assetId/);
    assert.match(source, /item\.lastFrameAssetId/);
    assert.match(source, /category: "storyboard"/);
});
