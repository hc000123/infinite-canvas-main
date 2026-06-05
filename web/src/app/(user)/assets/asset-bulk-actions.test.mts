import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";

import { assetsForVolcengineRefresh, assetsForVolcengineSubmit, buildBulkMoveAssetPatches, buildBulkTagAssetPatches, normalizeTags } from "./asset-bulk-actions.ts";

const now = "2026-06-05T00:00:00.000Z";

test("normalizes tags by trimming and deduping case-insensitively", () => {
    assert.deepEqual(normalizeTags([" 主角 ", "主角", "MAIN", "main", ""]), ["主角", "MAIN"]);
});

test("builds folder move patches for selected assets", () => {
    assert.deepEqual(buildBulkMoveAssetPatches([asset("a"), asset("b")], "folder-1"), [
        { id: "a", patch: { folderId: "folder-1" } },
        { id: "b", patch: { folderId: "folder-1" } },
    ]);
    assert.deepEqual(buildBulkMoveAssetPatches([asset("a")], ""), [{ id: "a", patch: { folderId: undefined } }]);
});

test("builds tag patches without losing existing tags", () => {
    assert.deepEqual(
        buildBulkTagAssetPatches([asset("a", ["毕业", "女主"]), asset("b", ["毕业"])], ["女主", "操场"]).map((item) => item.patch.tags),
        [
            ["毕业", "女主", "操场"],
            ["毕业", "女主", "操场"],
        ],
    );
});

test("selects assets for batch Volcengine submit and refresh", () => {
    const assets = [asset("text"), mediaAsset("image-new", "image"), mediaAsset("video-failed", "video", "Failed", "ark-1"), mediaAsset("image-active", "image", "Active", "ark-2"), mediaAsset("video-processing", "video", "Processing", "ark-3")];

    assert.deepEqual(
        assetsForVolcengineSubmit(assets).map((item) => item.id),
        ["image-new", "video-failed"],
    );
    assert.deepEqual(
        assetsForVolcengineRefresh(assets).map((item) => item.id),
        ["video-failed", "image-active", "video-processing"],
    );
});

function asset(id: string, tags: string[] = []): Asset {
    return {
        id,
        kind: "text",
        title: id,
        coverUrl: "",
        tags,
        createdAt: now,
        updatedAt: now,
        data: { content: id },
    };
}

function mediaAsset(id: string, kind: "image" | "video", status?: string, assetId?: string): Asset {
    return {
        id,
        kind,
        title: id,
        coverUrl: "",
        tags: [],
        createdAt: now,
        updatedAt: now,
        metadata: assetId
            ? {
                  volcengineAsset: {
                      assetId,
                      groupId: "group",
                      projectName: "project",
                      status: status || "Processing",
                      publicUrl: "",
                      submittedAt: now,
                      updatedAt: now,
                  },
              }
            : {},
        data: kind === "image" ? { dataUrl: "", storageKey: "image:1", width: 1, height: 1, bytes: 1, mimeType: "image/png" } : { url: "", storageKey: "video:1", width: 1, height: 1, bytes: 1, mimeType: "video/mp4" },
    };
}
