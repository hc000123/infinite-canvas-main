import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readProjectFile = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project detail omits the project-level asset reference tab", () => {
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");
    const page = readProjectFile("./[id]/page.tsx");

    assert.doesNotMatch(board, /label="素材引用"/);
    assert.doesNotMatch(board, /"asset-references"/);
    assert.doesNotMatch(board, /ProjectAssetReferencePanel/);
    assert.doesNotMatch(page, /assetReferenceFilters|filteredAssetReferenceRows/);
});
