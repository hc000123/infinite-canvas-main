import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";
import { assetVersionMediaSummary, assetVersionRecords, buildAssetVersionedUpdatePatch, buildRestoreAssetVersionPatch } from "./asset-version-history.ts";

const createdAt = "2026-06-05T00:00:00.000Z";
const updatedAt = "2026-06-05T00:10:00.000Z";

test("creates initial and new version when asset content changes", () => {
    const current = imageAsset("asset-1", "image:old", 10);
    const patch = buildAssetVersionedUpdatePatch(current, { data: { dataUrl: "blob:new", storageKey: "image:new", width: 2, height: 2, bytes: 20, mimeType: "image/png" } }, updatedAt);

    const versions = assetVersionRecords({ ...current, metadata: patch.metadata });
    assert.equal(versions.length, 2);
    assert.equal(versions[0]?.versionNumber, 1);
    assert.equal(versions[0]?.data.storageKey, "image:old");
    assert.equal(versions[1]?.versionNumber, 2);
    assert.equal(versions[1]?.data.storageKey, "image:new");
    assert.equal(versions[1]?.isCurrent, true);
});

test("does not create versions for metadata-only edits", () => {
    const current = imageAsset("asset-1", "image:old", 10);
    const patch = buildAssetVersionedUpdatePatch(current, { tags: ["新标签"], metadata: { source: "manual" } }, updatedAt);

    assert.deepEqual(patch, { tags: ["新标签"], metadata: { source: "manual" } });
});

test("restores an older media version by switching current data", () => {
    const current = imageAsset("asset-1", "image:old", 10);
    const versioned = buildAssetVersionedUpdatePatch(current, { data: { dataUrl: "blob:new", storageKey: "image:new", width: 2, height: 2, bytes: 20, mimeType: "image/png" } }, updatedAt);
    const versions = assetVersionRecords({ ...current, metadata: versioned.metadata });
    const restorePatch = buildRestoreAssetVersionPatch(
        { ...current, data: { dataUrl: "blob:new", storageKey: "image:new", width: 2, height: 2, bytes: 20, mimeType: "image/png" }, metadata: versioned.metadata },
        versions[0]!.id,
        "2026-06-05T00:20:00.000Z",
    );

    assert.equal(restorePatch?.data && "storageKey" in restorePatch.data ? restorePatch.data.storageKey : "", "image:old");
    assert.equal(restorePatch?.metadata?.currentAssetVersionId, versions[0]!.id);
});

test("does not persist data urls inside version metadata", () => {
    const current = imageAsset("asset-1", "image:old", 10, "data:image/png;base64,old");
    const patch = buildAssetVersionedUpdatePatch(current, { data: { dataUrl: "data:image/png;base64,new", storageKey: "image:new", width: 2, height: 2, bytes: 20, mimeType: "image/png" } }, updatedAt);
    const versions = assetVersionRecords({ ...current, metadata: patch.metadata });

    assert.equal(versions[0]?.data.dataUrl, "");
    assert.equal(versions[1]?.data.dataUrl, "");
});

test("summarizes text and media versions", () => {
    const text = textAsset("text-1", "hello");
    const textPatch = buildAssetVersionedUpdatePatch(text, { data: { content: "hello world" } }, updatedAt);
    const textVersions = assetVersionRecords({ ...text, metadata: textPatch.metadata });
    assert.equal(assetVersionMediaSummary(textVersions[1]!), "11 字");

    const image = imageAsset("asset-1", "image:old", 1024);
    const imagePatch = buildAssetVersionedUpdatePatch(image, { data: { dataUrl: "blob:new", storageKey: "image:new", width: 2, height: 2, bytes: 2048, mimeType: "image/png" } }, updatedAt);
    const imageVersions = assetVersionRecords({ ...image, metadata: imagePatch.metadata });
    assert.equal(assetVersionMediaSummary(imageVersions[1]!), "2x2 · 2.0 KB · image/png");
});

function textAsset(id: string, content: string): Asset {
    return {
        id,
        kind: "text",
        title: id,
        coverUrl: "",
        tags: [],
        createdAt,
        updatedAt: createdAt,
        data: { content },
    };
}

function imageAsset(id: string, storageKey: string, bytes: number, dataUrl = "blob:old"): Asset {
    return {
        id,
        kind: "image",
        title: id,
        coverUrl: dataUrl,
        tags: [],
        createdAt,
        updatedAt: createdAt,
        data: { dataUrl, storageKey, width: 1, height: 1, bytes, mimeType: "image/png" },
    };
}
