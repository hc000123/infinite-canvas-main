import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, AssetWriteInput } from "@/stores/use-asset-store.ts";
import { generatedSourceAssetId, inheritGeneratedAssetBinding, shouldWriteGeneratedAsset } from "./canvas-generated-asset-writeback.ts";

function generatedAsset(kind: "image" | "video", generation: Record<string, unknown> = {}): AssetWriteInput {
    return kind === "image"
        ? { kind, title: "图片", coverUrl: "blob:image", tags: [], data: { dataUrl: "blob:image", width: 1, height: 1, bytes: 1, mimeType: "image/png" }, metadata: { generation } }
        : { kind, title: "视频", coverUrl: "", tags: [], data: { url: "blob:video", width: 1, height: 1, bytes: 1, mimeType: "video/mp4" }, metadata: { generation } };
}

test("keeps ordinary canvas image and video results cache-only", () => {
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("image", { canvasId: "canvas-1", nodeId: "node-1" })), false);
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("video", { canvasId: "canvas-1", nodeId: "node-2" })), false);
});

test("writes image results with an explicit asset destination", () => {
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("image", { briefId: "brief-1" })), true);
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("image", { assetBreakdownItemId: "breakdown-1" })), true);
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("image", { productionBibleItemId: "bible-1" })), true);
});

test("writes storyboard and shot-group video results", () => {
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("video", { storyboardShotId: "shot-1" })), true);
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("video", { shotGroupId: "group-1" })), true);
    assert.equal(shouldWriteGeneratedAsset(generatedAsset("video", { productionVideoVersionId: "version-1" })), true);
});

test("writes results that already carry an explicit asset binding", () => {
    const bound = generatedAsset("image") as Extract<AssetWriteInput, { kind: "image" }>;
    bound.assetBinding = { projectId: "project-1", subjectId: "subject-1", category: "character", variantName: "基础形象", allEpisodes: true, episodeIds: [] };
    assert.equal(shouldWriteGeneratedAsset(bound), true);
});

test("inherits a bound source asset without guessing from an unbound source", () => {
    const result = generatedAsset("image");
    const boundSource = {
        ...(result as Extract<AssetWriteInput, { kind: "image" }>),
        id: "asset-1",
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
        title: "林夏 · 基础形象",
        folderId: "folder-1",
        assetBinding: { projectId: "project-1", subjectId: "subject-1", category: "character" as const, variantId: "variant-1", variantName: "基础形象", allEpisodes: true, episodeIds: [] },
    } as Asset;
    const inherited = inheritGeneratedAssetBinding(result, boundSource);
    assert.equal(inherited.title, boundSource.title);
    assert.deepEqual(inherited.assetBinding, boundSource.assetBinding);
    assert.equal(inherited.metadata?.sourceAssetId, boundSource.id);
    assert.equal(shouldWriteGeneratedAsset(inherited), true);
    assert.equal(inheritGeneratedAssetBinding(result, { ...boundSource, assetBinding: undefined }).assetBinding, undefined);
    assert.equal(generatedSourceAssetId({ ...result, metadata: { generation: { sourceAssetId: boundSource.id } } }), boundSource.id);
});
