import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { buildAssetProjectResultGroups } from "./asset-project-groups.ts";

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
