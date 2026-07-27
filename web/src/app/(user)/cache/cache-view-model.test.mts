import assert from "node:assert/strict";
import test from "node:test";

import { filterProjectCacheFiles, mergeProjectCacheState } from "./cache-view-model.ts";

test("marks disk cache orphaned when the local project is absent", () => {
    const rows = mergeProjectCacheState([{ projectId: "p1", projectName: "A", status: "active", path: "/a", updatedAt: "", bytes: 10, fileCount: 1, missingCount: 0 }], []);
    assert.equal(rows[0].displayStatus, "orphaned");
});

test("filters by episode, category, media kind and keyword", () => {
    const files = [
        { id: "file-1", originalName: "shot-01.mp4", kind: "video", category: "storyboard", context: { episodeId: "e1" } },
        { id: "file-2", originalName: "hero.png", kind: "image", category: "character", context: { episodeId: "e1" } },
    ];
    const result = filterProjectCacheFiles(files, { episodeId: "e1", category: "storyboard", kind: "video", keyword: "shot-01" });
    assert.deepEqual(
        result.map((item) => item.id),
        ["file-1"],
    );
});
