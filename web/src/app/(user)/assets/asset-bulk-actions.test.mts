import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";

import { buildBulkMoveAssetPatches, buildBulkTagAssetPatches, normalizeTags } from "./asset-bulk-actions.ts";

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
