import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { collectAssetPackageFiles, remapAssetPackageStorageKeys } from "./asset-transfer-files.ts";

test("collects current and historical version files once", () => {
    const asset = {
        id: "asset-1",
        kind: "image",
        title: "角色参考",
        coverUrl: "blob:current",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        data: { dataUrl: "blob:current", storageKey: "image:current", width: 1024, height: 768, bytes: 20, mimeType: "image/png" },
        metadata: {
            assetVersions: [
                { id: "v1", versionNumber: 1, kind: "image", data: { storageKey: "image:old", bytes: 10, mimeType: "image/jpeg" } },
                { id: "v2", versionNumber: 2, kind: "image", data: { storageKey: "image:current", bytes: 20, mimeType: "image/png" } },
            ],
        },
    } as Asset;

    assert.deepEqual(collectAssetPackageFiles([asset]), [
        { storageKey: "image:current", kind: "image", bytes: 20, mimeType: "image/png" },
        { storageKey: "image:old", kind: "image", bytes: 10, mimeType: "image/jpeg" },
    ]);
});

test("remaps current and historical storage keys without mutating the package", () => {
    const asset = {
        id: "asset-1",
        kind: "image",
        title: "角色参考",
        coverUrl: "blob:old",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        data: { dataUrl: "blob:old", storageKey: "image:current", width: 1, height: 1, bytes: 20, mimeType: "image/png" },
        metadata: { assetVersions: [{ id: "v1", versionNumber: 1, kind: "image", data: { storageKey: "image:old", bytes: 10, mimeType: "image/jpeg" } }] },
    } as Asset;

    const [remapped] = remapAssetPackageStorageKeys(
        [asset],
        new Map([
            ["image:current", "image:new-current"],
            ["image:old", "image:new-old"],
        ]),
    );

    assert.equal(remapped.kind === "image" ? remapped.data.storageKey : "", "image:new-current");
    assert.equal((remapped.metadata?.assetVersions as Array<{ data: { storageKey: string } }>)[0].data.storageKey, "image:new-old");
    assert.equal(asset.data.storageKey, "image:current");
});
