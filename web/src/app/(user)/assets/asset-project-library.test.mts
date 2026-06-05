import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";
import { assetInProjectLibrary, assetProjectLibraryEntries, buildProjectLibraryAssetPatch, buildRemoveProjectLibraryAssetPatch, projectLibrarySearchText } from "./asset-project-library.ts";

const now = "2026-06-05T00:00:00.000Z";

test("adds project library metadata without losing existing metadata", () => {
    const patch = buildProjectLibraryAssetPatch(asset("asset-1", { source: "manual" }), "project-1", now);

    assert.deepEqual(patch.metadata.source, "manual");
    assert.deepEqual(patch.metadata.projectLibraries, [
        {
            projectId: "project-1",
            visibility: "project",
            role: "editor",
            syncStatus: "local",
            addedAt: now,
            updatedAt: now,
        },
    ]);
});

test("updates existing project library membership idempotently", () => {
    const original = asset("asset-1", {
        projectLibraries: [{ projectId: "project-1", visibility: "project", role: "viewer", syncStatus: "synced", addedAt: "old", updatedAt: "old", remoteAssetId: "remote-asset" }],
    });
    const patch = buildProjectLibraryAssetPatch(original, "project-1", now, "owner");

    assert.deepEqual(assetProjectLibraryEntries({ metadata: patch.metadata }), [
        {
            projectId: "project-1",
            visibility: "project",
            role: "owner",
            syncStatus: "synced",
            addedAt: "old",
            updatedAt: now,
            remoteAssetId: "remote-asset",
            remoteFileId: undefined,
            error: undefined,
        },
    ]);
});

test("removes project library membership and keeps other project entries", () => {
    const original = asset("asset-1", {
        projectLibraries: [
            { projectId: "project-1", visibility: "project", role: "editor", syncStatus: "local", addedAt: now, updatedAt: now },
            { projectId: "project-2", visibility: "project", role: "viewer", syncStatus: "pending", addedAt: now, updatedAt: now },
        ],
    });
    const patch = buildRemoveProjectLibraryAssetPatch(original, "project-1");

    assert.equal(assetInProjectLibrary({ metadata: patch.metadata }, "project-1"), false);
    assert.equal(assetInProjectLibrary({ metadata: patch.metadata }, "project-2"), true);
});

test("builds searchable text for project library metadata", () => {
    const item = asset("asset-1", {
        projectLibraries: [{ projectId: "project-1", visibility: "project", role: "editor", syncStatus: "pending", addedAt: now, updatedAt: now, remoteAssetId: "remote-asset", remoteFileId: "remote-file" }],
    });

    assert.equal(projectLibrarySearchText(item), "project-1 editor pending remote-asset remote-file");
});

function asset(id: string, metadata?: Asset["metadata"]): Asset {
    return {
        id,
        kind: "text",
        title: id,
        coverUrl: "",
        tags: [],
        createdAt: now,
        updatedAt: now,
        metadata,
        data: { content: id },
    };
}
