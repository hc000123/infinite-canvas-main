import assert from "node:assert/strict";
import test from "node:test";

import { canvasAssetReferenceMetadata, syncCanvasNodeAssetTitles } from "./canvas-asset-reference.ts";

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

test("素材改名后按稳定素材 ID 同步画布节点标题", () => {
    const nodes = [
        { id: "image-1", title: "助手图片", metadata: { sourceAssetId: "asset-1" } },
        { id: "image-2", title: "手工命名", metadata: {} },
    ];

    const next = syncCanvasNodeAssetTitles(nodes, new Map([["asset-1", "楚和笙-重伤马甲"]]));

    assert.equal(next[0].title, "楚和笙-重伤马甲");
    assert.equal(next[1], nodes[1]);
});

test("素材标题没有变化时保留原节点数组", () => {
    const nodes = [{ id: "image-1", title: "楚和笙", metadata: { sourceAssetId: "asset-1" } }];

    assert.equal(syncCanvasNodeAssetTitles(nodes, new Map([["asset-1", "楚和笙"]])), nodes);
});
