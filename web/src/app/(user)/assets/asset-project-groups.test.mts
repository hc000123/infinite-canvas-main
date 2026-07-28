import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { buildAssetProjectResultGroups, resolveAssetProjectId } from "./asset-project-groups.ts";

test("uses the selected project as the result group instead of re-resolving another lineage", () => {
    const asset: Asset = {
        id: "asset-1",
        kind: "text",
        title: "素材",
        coverUrl: "",
        tags: [],
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        metadata: { generation: { projectId: "older-project" } },
        data: { content: "素材" },
    };

    const groups = buildAssetProjectResultGroups({
        assets: [asset],
        folderMap: new Map(),
        forcedProjectId: "selected-project",
        productionBibleItems: [],
        projectOrder: ["selected-project"],
        projectReferencedAssetIdsByProject: new Map(),
        projectTitles: { "selected-project": "当前项目" },
    });

    assert.deepEqual(groups.map((group) => [group.id, group.title, group.assets.length]), [["selected-project", "当前项目", 1]]);
});

test("resolves workflow video and tail-frame assets from their project metadata", () => {
    const referencedAssets = new Map<string, Set<string>>();
    const folderMap = new Map();
    const workflowVideo = workflowAsset("workflow-video", "video");
    const tailFrame = workflowAsset("tail-frame", "image");

    assert.equal(resolveAssetProjectId(workflowVideo, folderMap, referencedAssets), "project-1");
    assert.equal(resolveAssetProjectId(tailFrame, folderMap, referencedAssets), "project-1");
});

function workflowAsset(id: string, kind: "image" | "video"): Asset {
    const data = kind === "video" ? { url: "blob:video", width: 720, height: 1280, bytes: 1, mimeType: "video/mp4" } : { dataUrl: "blob:image", width: 720, height: 1280, bytes: 1, mimeType: "image/jpeg" };
    return {
        id,
        kind,
        title: id,
        coverUrl: "",
        tags: [],
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
        data,
        metadata: { originalWorkflow: { projectId: "project-1", episodeId: "episode-1", sourceShotId: "shot-001" } },
    } as Asset;
}
