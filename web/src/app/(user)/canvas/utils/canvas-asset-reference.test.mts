import assert from "node:assert/strict";
import test from "node:test";

import { canvasAssetReferenceMetadata } from "./canvas-asset-reference.ts";

const assetVersion = {
    assetId: "asset-1",
    assetVersionId: "version-1",
    versionNumber: 1,
    mode: "fixed-version" as const,
};

test("builds fixed-version node metadata from source asset and asset version", () => {
    const metadata = canvasAssetReferenceMetadata({ sourceAssetId: "asset-1", assetVersion });

    assert.equal(metadata.sourceAssetId, "asset-1");
    assert.equal(metadata.assetVersion?.assetVersionId, "version-1");
    assert.equal(metadata.assetReferenceMode, "fixed-version");
});

test("uses asset version asset id when source asset id is omitted", () => {
    const metadata = canvasAssetReferenceMetadata({ assetVersion });

    assert.equal(metadata.sourceAssetId, "asset-1");
    assert.equal(metadata.assetReferenceMode, "fixed-version");
});

test("keeps unversioned references free of fixed-version mode", () => {
    const metadata = canvasAssetReferenceMetadata({ sourceAssetId: "asset-1" });

    assert.deepEqual(metadata, { sourceAssetId: "asset-1" });
});
