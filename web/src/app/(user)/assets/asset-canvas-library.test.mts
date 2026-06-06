import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { assetCanvasLibraryEntries, assetInCanvasLibrary, buildAddCanvasLibraryAssetPatch, buildRemoveCanvasLibraryAssetPatch } from "./asset-canvas-library.ts";

function asset(metadata?: Asset["metadata"]): Asset {
    return {
        id: "asset-1",
        kind: "image",
        title: "素材",
        url: "blob:test",
        coverUrl: "blob:test",
        tags: [],
        source: "",
        note: "",
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
        metadata,
    };
}

test("normalizes canvas library entries", () => {
    const entries = assetCanvasLibraryEntries(
        asset({
            canvasLibraries: [{ canvasId: "canvas-1", addedAt: "old", updatedAt: "old" }, { canvasId: "" }, null],
        }),
    );

    assert.deepEqual(entries, [{ canvasId: "canvas-1", addedAt: "old", updatedAt: "old" }]);
    assert.equal(assetInCanvasLibrary(asset({ canvasLibraries: entries }), "canvas-1"), true);
});

test("adds and removes canvas library entries while preserving metadata", () => {
    const source = asset({ generation: { source: "canvas" }, canvasLibraries: [{ canvasId: "canvas-1", addedAt: "old", updatedAt: "old" }] });
    const added = buildAddCanvasLibraryAssetPatch(source, ["canvas-1", "canvas-2", "canvas-2"], "now");

    assert.equal(added.metadata.generation?.source, "canvas");
    assert.deepEqual(added.metadata.canvasLibraries, [
        { canvasId: "canvas-1", addedAt: "old", updatedAt: "now" },
        { canvasId: "canvas-2", addedAt: "now", updatedAt: "now" },
    ]);

    const removed = buildRemoveCanvasLibraryAssetPatch({ ...source, metadata: added.metadata }, ["canvas-1"]);
    assert.deepEqual(removed.metadata.canvasLibraries, [{ canvasId: "canvas-2", addedAt: "now", updatedAt: "now" }]);
});
