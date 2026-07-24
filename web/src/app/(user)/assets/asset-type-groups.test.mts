import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { buildAssetTypeGroups } from "./asset-type-groups.ts";

test("groups generated asset versions by media kind instead of the v3 title suffix", () => {
    const groups = buildAssetTypeGroups([videoAsset("video-1", "47-1-节点027-v3")]);

    assert.deepEqual(groups.map((group) => [group.title, group.assets.length]), [["视频", 1]]);
});

test("keeps explicit workflow asset types as the group title", () => {
    const asset = videoAsset("video-1", "工作流素材");
    asset.metadata = { originalWorkflow: { importKey: "workflow-1", prompt: "提示词", type: "角色" } };

    assert.equal(buildAssetTypeGroups([asset])[0]?.title, "角色");
});

function videoAsset(id: string, title: string): Asset {
    return {
        id,
        kind: "video",
        title,
        coverUrl: "blob:cover",
        tags: [],
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        data: { url: "blob:video", width: 720, height: 1280, bytes: 1, mimeType: "video/mp4" },
    };
}
