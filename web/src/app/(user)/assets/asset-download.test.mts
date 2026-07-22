import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { resolveAssetDownloadTarget } from "./asset-download.ts";

test("downloads the persisted blob without changing the asset", async () => {
    const asset = {
        id: "asset-1",
        kind: "image",
        title: "测试图片",
        coverUrl: "blob:preview",
        tags: [],
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
        data: { dataUrl: "blob:preview", storageKey: "image:1", width: 100, height: 100, bytes: 4, mimeType: "image/png" },
    } satisfies Asset;
    const snapshot = structuredClone(asset);
    const blob = new Blob(["test"], { type: "image/png" });

    const target = await resolveAssetDownloadTarget(asset, {
        getImageBlob: async () => blob,
        getMediaBlob: async () => null,
    });

    assert.equal(target, blob);
    assert.deepEqual(asset, snapshot);
});
