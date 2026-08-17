import assert from "node:assert/strict";
import test from "node:test";

import { filterProjectCacheFiles, mergeProjectCacheState, pruneCacheSelection, toggleVisibleCacheSelection } from "./cache-view-model.ts";

test("marks disk cache orphaned when the local project is absent", () => {
    const rows = mergeProjectCacheState([{ projectId: "p1", projectName: "A", status: "active", path: "/a", updatedAt: "", bytes: 10, fileCount: 1, missingCount: 0 }], []);
    assert.equal(rows[0].displayStatus, "orphaned");
});

test("filters by episode, category, media kind and keyword", () => {
    const files = [
        { id: "file-1", originalName: "shot-01.mp4", kind: "video", category: "storyboard", status: "ready", favorite: false, context: { episodeId: "e1" } },
        { id: "file-2", originalName: "hero.png", kind: "image", category: "character", status: "ready", favorite: false, context: { episodeId: "e1" } },
    ];
    const result = filterProjectCacheFiles(files, { episodeId: "e1", category: "storyboard", kind: "video", keyword: "shot-01" });
    assert.deepEqual(
        result.map((item) => item.id),
        ["file-1"],
    );
});

test("favorite filter returns only ready favorite videos and composes with other filters", () => {
    const files = [
        { id: "favorite-video", originalName: "shot-01.mp4", kind: "video", category: "storyboard", status: "ready", favorite: true, context: { episodeId: "e1" } },
        { id: "plain-video", originalName: "shot-02.mp4", kind: "video", category: "storyboard", status: "ready", favorite: false, context: { episodeId: "e1" } },
        { id: "favorite-image", originalName: "hero.png", kind: "image", category: "character", status: "ready", favorite: true, context: { episodeId: "e1" } },
        { id: "missing-video", originalName: "lost.mp4", kind: "video", category: "storyboard", status: "missing", favorite: true, context: { episodeId: "e1" } },
    ];
    const result = filterProjectCacheFiles(files, { favoriteOnly: true, episodeId: "e1", category: "storyboard", keyword: "shot" });
    assert.deepEqual(result.map((item) => item.id), ["favorite-video"]);
});

test("toggles only the visible cache selection while preserving hidden items", () => {
    const selected = toggleVisibleCacheSelection(new Set(["hidden"]), ["a", "b"]);
    assert.deepEqual([...selected].sort(), ["a", "b", "hidden"]);
    assert.deepEqual([...toggleVisibleCacheSelection(selected, ["a", "b"])], ["hidden"]);
});

test("prunes cache selection against the current manifest", () => {
    assert.deepEqual([...pruneCacheSelection(new Set(["a", "gone"]), ["a", "b"])], ["a"]);
});
