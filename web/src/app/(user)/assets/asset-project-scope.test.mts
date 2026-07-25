import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { assetMatchesSourceScope, assetProjectIds, projectAssetIds } from "./asset-project-scope.ts";

const context = {
    folderProjectIdByFolderId: new Map([["folder-a", "project-a"]]),
    canvasProjectIdByCanvasId: new Map([["canvas-a", "project-a"], ["canvas-b", "project-b"]]),
    referencedAssetIdsByProject: new Map([["project-a", new Set(["referenced-a"])]]),
};

test("resolves project membership from folders, project libraries, generations, workflow metadata, canvases and references", () => {
    const cases: Array<[Asset, string]> = [
        [videoAsset("folder-a", { folderId: "folder-a" }), "project-a"],
        [videoAsset("library-a", { metadata: { projectLibraries: [{ projectId: "project-a" }] } }), "project-a"],
        [videoAsset("generation-a", { metadata: { generation: { projectId: "project-a" } } }), "project-a"],
        [videoAsset("workflow-a", { metadata: { originalWorkflow: { sourceProjectId: "project-a" } } }), "project-a"],
        [videoAsset("canvas-a", { metadata: { canvasSource: { canvasId: "canvas-a" } } }), "project-a"],
        [videoAsset("referenced-a"), "project-a"],
    ];

    cases.forEach(([asset, projectId]) => assert.equal(assetProjectIds(asset, context).has(projectId), true, asset.id));
    assert.deepEqual(Array.from(projectAssetIds(cases.map(([asset]) => asset), "project-a", context)), cases.map(([asset]) => asset.id));
});

test("filters a selected project by workflow, all canvases, or one child canvas", () => {
    const workflow = videoAsset("workflow", { metadata: { originalWorkflow: { sourceProjectId: "project-a" } } });
    const canvasA = videoAsset("canvas-a", { metadata: { generation: { source: "canvas", canvasId: "canvas-a" } } });
    const canvasB = videoAsset("canvas-b", { metadata: { canvasLibraries: [{ canvasId: "canvas-b" }] } });
    const projectCanvasIds = new Set(["canvas-a", "canvas-b"]);

    assert.equal(assetMatchesSourceScope(workflow, "workflow", projectCanvasIds, ""), true);
    assert.equal(assetMatchesSourceScope(canvasA, "canvas", projectCanvasIds, ""), true);
    assert.equal(assetMatchesSourceScope(canvasB, "canvas", projectCanvasIds, "canvas-a"), false);
    assert.equal(assetMatchesSourceScope(canvasA, "canvas", projectCanvasIds, "canvas-a"), true);
    assert.equal(assetMatchesSourceScope(workflow, "all", projectCanvasIds, ""), true);
});

function videoAsset(id: string, patch: Partial<Asset> = {}): Asset {
    return {
        id,
        kind: "video",
        title: id,
        coverUrl: "",
        tags: [],
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        data: { url: "blob:video", width: 1, height: 1, bytes: 1, mimeType: "video/mp4" },
        ...patch,
    } as Asset;
}
