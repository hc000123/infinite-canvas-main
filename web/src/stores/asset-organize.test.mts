import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, AssetSubject, AssetVariant } from "./use-asset-store.ts";
import { createSubjectFromAssetCollections, organizeAssetCollections } from "./asset-workbench-state.ts";

const now = "2026-08-10T00:00:00.000Z";
const subject: AssetSubject = { id: "subject-1", projectId: "project-1", category: "character", code: "CHAR-001", name: "林默", tags: [], createdAt: now, updatedAt: now };
const variants: AssetVariant[] = [{ id: "variant-1", subjectId: subject.id, name: "基础形象", prompt: "", referenceImageIds: [], currentAssetId: "image-current", createdAt: now, updatedAt: now }];
const assetBase = { coverUrl: "", tags: [], createdAt: now, updatedAt: now };
const assets: Asset[] = [
    { ...assetBase, id: "image-1", kind: "image", title: "新形象", data: { dataUrl: "blob:image", width: 1, height: 1, bytes: 1, mimeType: "image/png" } },
    { ...assetBase, id: "video-1", kind: "video", title: "动作参考", data: { url: "blob:video", width: 1280, height: 720, bytes: 1, mimeType: "video/mp4" } },
];

test("organizes an image as the current formal version", () => {
    const result = organizeAssetCollections({ assets, variants, assetId: "image-1", subject, variantId: "variant-1", allEpisodes: true, episodeIds: [], setCurrent: true, now });
    assert.equal(result.assets[0].assetBinding?.subjectId, subject.id);
    assert.equal(result.assets[0].assetBinding?.variantId, "variant-1");
    assert.equal(result.variants[0].currentAssetId, "image-1");
});

test("organizes related media without replacing the current image", () => {
    const result = organizeAssetCollections({ assets, variants, assetId: "video-1", subject, variantId: "variant-1", allEpisodes: true, episodeIds: [], setCurrent: true, now });
    assert.equal(result.assets[1].assetBinding?.subjectId, subject.id);
    assert.equal(result.variants[0].currentAssetId, "image-current");
});

test("creates a subject and base variant while organizing an existing image", () => {
    const result = createSubjectFromAssetCollections({ assets, subjects: [], variants: [], assetId: "image-1", projectId: "project-1", category: "character", name: " 林默 ", subjectId: "subject-new", variantId: "variant-new", now });
    assert.equal(result.subjects[0].name, "林默");
    assert.equal(result.subjects[0].code, "CHAR-001");
    assert.equal(result.variants[0].name, "基础形象");
    assert.equal(result.variants[0].currentAssetId, "image-1");
    assert.equal(result.assets[0].assetBinding?.subjectId, "subject-new");
});

test("rejects assets and variants outside the selected subject", () => {
    assert.throws(() => organizeAssetCollections({ assets, variants, assetId: "missing", subject, variantId: "variant-1", allEpisodes: true, episodeIds: [], setCurrent: true, now }), /待整理内容不存在/);
    assert.throws(() => organizeAssetCollections({ assets, variants, assetId: "image-1", subject, variantId: "other", allEpisodes: true, episodeIds: [], setCurrent: true, now }), /请选择这个资产主体下的形态/);
});
