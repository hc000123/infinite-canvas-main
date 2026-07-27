import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectCacheSnapshot } from "./project-cache-snapshot.ts";

test("builds a package snapshot with only the selected project", () => {
    const snapshot = buildProjectCacheSnapshot({
        projectId: "p1",
        projects: [
            { id: "p1", title: "A" },
            { id: "p2", title: "B" },
        ],
        canvases: [
            { id: "c1", projectId: "p1" },
            { id: "c2", projectId: "p2" },
        ],
        episodes: [
            { id: "e1", projectId: "p1" },
            { id: "e2", projectId: "p2" },
        ],
        scenes: [
            { id: "s1", episodeId: "e1" },
            { id: "s2", episodeId: "e2" },
        ],
        storyboardShots: [
            { id: "sh1", projectId: "p1" },
            { id: "sh2", projectId: "p2" },
        ],
        storyboardGroups: [],
        folders: [{ id: "f1", projectId: "p1" }],
        assets: [
            { id: "a1", metadata: { projectId: "p1" } },
            { id: "a2", metadata: { projectId: "p2" } },
            { id: "a3", folderId: "f1" },
        ],
    });
    assert.equal(snapshot.project?.id, "p1");
    assert.deepEqual(
        snapshot.canvases.map((item) => item.id),
        ["c1"],
    );
    assert.deepEqual(
        snapshot.scripts.episodes.map((item) => item.id),
        ["e1"],
    );
    assert.deepEqual(
        snapshot.scripts.scenes.map((item) => item.id),
        ["s1"],
    );
    assert.deepEqual(
        snapshot.storyboards.shots.map((item) => item.id),
        ["sh1"],
    );
    assert.deepEqual(
        snapshot.assets.map((item) => item.id),
        ["a1", "a3"],
    );
});
