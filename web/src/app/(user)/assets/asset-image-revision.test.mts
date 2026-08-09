import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AssetVariant, ImageAsset } from "../../../stores/use-asset-store.ts";
import { assetImageGenerationSnapshot, assetImageReference, boundVariantId, buildAssetImageRevisionHref, revisedImageAssetInput } from "./asset-image-revision.ts";

const now = "2026-08-08T00:00:00.000Z";
const sourceImage: ImageAsset = {
    id: "image-a",
    kind: "image",
    title: "林夏 · 基础形象",
    coverUrl: "blob:old",
    folderId: "folder-a",
    tags: ["角色"],
    note: "旧提示词",
    source: "资产工作台",
    createdAt: now,
    updatedAt: now,
    assetBinding: { projectId: "project-a", subjectId: "subject-a", category: "character", variantId: "variant-a", variantName: "基础形象", allEpisodes: true, episodeIds: [] },
    data: { dataUrl: "blob:old", storageKey: "image:old", width: 1024, height: 1024, bytes: 1, mimeType: "image/png" },
    metadata: { projectId: "project-a", generation: { prompt: "正面站立", model: "image-model", quality: "high", size: "1024x1024" }, assetVersions: [{ id: "old-version" }], volcengineAsset: { assetId: "ark-a", groupId: "group-a", projectName: "项目 A", status: "Active", publicUrl: "https://example.com/a.png", submittedAt: now, updatedAt: now } },
};

test("builds image revision context and reference", () => {
    const href = buildAssetImageRevisionHref(sourceImage, "/assets?projectId=project-a");
    const params = new URL(href, "http://local").searchParams;
    assert.equal(params.get("source"), "asset-revision");
    assert.equal(params.get("libraryAssetId"), sourceImage.id);
    assert.equal(params.get("projectId"), "project-a");
    assert.equal(params.get("prompt"), "正面站立");
    assert.equal(assetImageReference(sourceImage).storageKey, "image:old");
    assert.deepEqual(assetImageGenerationSnapshot(sourceImage), { prompt: "正面站立", model: "image-model", quality: "high", size: "1024x1024", capabilityTrace: undefined });
});

test("creates a new bound image version without copying stale file metadata", () => {
    const input = revisedImageAssetInput(sourceImage, { url: "blob:new", storageKey: "image:new", width: 1024, height: 1024, bytes: 2, mimeType: "image/png" }, { prompt: "新版提示词", model: "image-model", quality: "high", size: "1024x1024" });
    assert.deepEqual(input.assetBinding, sourceImage.assetBinding);
    assert.equal(input.metadata?.sourceAssetId, sourceImage.id);
    assert.equal((input.metadata?.generation as { prompt: string }).prompt, "新版提示词");
    assert.equal(input.metadata?.assetVersions, undefined);
    assert.equal(input.metadata?.volcengineAsset, undefined);
    assert.equal(sourceImage.data.dataUrl, "blob:old");
});

test("resolves stable and legacy bound variants", () => {
    const variants: AssetVariant[] = [{ id: "variant-a", subjectId: "subject-a", name: "基础形象", prompt: "", referenceImageIds: [], createdAt: now, updatedAt: now }];
    assert.equal(boundVariantId(sourceImage, variants), "variant-a");
    assert.equal(boundVariantId({ ...sourceImage, assetBinding: { ...sourceImage.assetBinding!, variantId: undefined } }, variants), "variant-a");
    assert.equal(boundVariantId({ ...sourceImage, assetBinding: undefined }, variants), undefined);
});

test("wires image revision into the workbench and asset cards", () => {
    const imagePage = readFileSync(new URL("../image/page.tsx", import.meta.url), "utf8");
    const assetPage = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const mediaCard = readFileSync(new URL("./components/compact-media-asset-card.tsx", import.meta.url), "utf8");
    const versionPanel = readFileSync(new URL("./[subjectId]/components/asset-version-panel.tsx", import.meta.url), "utf8");
    assert.match(imagePage, /assetImageReference/);
    assert.match(imagePage, /revisedImageAssetInput/);
    assert.match(imagePage, /setVariantCurrentAsset/);
    assert.match(imagePage, /await autoSaveAssetRevisionResults\(logImages\)/);
    assert.match(imagePage, /buildWorkflowGeneratedImagePatch/);
    assert.match(assetPage, /buildAssetImageRevisionHref/);
    assert.match(mediaCard, /进入生图修改/);
    assert.match(versionPanel, /继续修改/);
});
