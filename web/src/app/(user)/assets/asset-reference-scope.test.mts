import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { filterReferenceAssets } from "./asset-workbench.ts";

test("defaults reference browsing to the active project and expands only on explicit all-project scope", () => {
    const assets = [imageAsset("a", "project-a"), imageAsset("b", "project-b")];
    assert.deepEqual(filterReferenceAssets(assets, "project-a", "project").map((asset) => asset.id), ["a"]);
    assert.deepEqual(filterReferenceAssets(assets, "project-a", "all").map((asset) => asset.id), ["a", "b"]);
});

test("adds a private picker with current-project and all-project controls", () => {
    const picker = new URL("./[subjectId]/components/asset-reference-picker.tsx", import.meta.url);
    assert.equal(existsSync(picker), true);
    const source = readFileSync(picker, "utf8");
    assert.match(source, /当前项目/);
    assert.match(source, /全部项目/);
    assert.match(source, /filterReferenceAssets/);
    assert.match(source, /来源项目/);
});

test("persists uploads and formal-asset references as recoverable workbench snapshots", () => {
    const source = readFileSync(new URL("./[subjectId]/page.tsx", import.meta.url), "utf8");
    assert.match(source, /uploadImage\(file\)/);
    assert.match(source, /source: "asset"/);
    assert.match(source, /sourceAssetId: asset\.id/);
    assert.match(source, /referenceImageIds: \[\.\.\.activeVariant\.referenceImageIds/);
    assert.match(source, /sourceMissing/);
});

function imageAsset(id: string, projectId: string): Asset {
    return {
        id,
        kind: "image",
        title: id,
        coverUrl: `blob:${id}`,
        tags: [],
        assetBinding: { projectId, subjectId: `subject-${id}`, category: "character", variantName: "基础形象", allEpisodes: true, episodeIds: [] },
        data: { dataUrl: `blob:${id}`, width: 1, height: 1, bytes: 1, mimeType: "image/png" },
        createdAt: "",
        updatedAt: "",
    };
}
