import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, AssetSubject, AssetVariant, ImageAsset } from "../../../stores/use-asset-store.ts";
import { buildAssetSubjectSummary, isGalleryMediaAsset, visibleGallerySubjectGroups } from "./asset-gallery.ts";

const now = "2026-08-08T00:00:00.000Z";
const subject: AssetSubject = { id: "subject-a", projectId: "project-a", category: "character", code: "CHAR-001", name: "林夏", tags: ["女主"], createdAt: now, updatedAt: now };
const image = (id: string, updatedAt = now): ImageAsset => ({
    id,
    kind: "image",
    title: id,
    coverUrl: `blob:${id}`,
    tags: [],
    createdAt: now,
    updatedAt,
    assetBinding: { projectId: "project-a", subjectId: subject.id, category: "character", variantId: "variant-a", variantName: "基础形象", allEpisodes: true, episodeIds: [] },
    data: { dataUrl: `blob:${id}`, width: 1024, height: 1024, bytes: 1, mimeType: "image/png" },
});

test("builds one subject summary and prefers the current formal image", () => {
    const variants: AssetVariant[] = [
        { id: "variant-a", subjectId: subject.id, name: "基础形象", prompt: "", referenceImageIds: [], currentAssetId: "current", createdAt: now, updatedAt: now },
        { id: "variant-b", subjectId: subject.id, name: "战损", prompt: "", referenceImageIds: [], createdAt: now, updatedAt: now },
    ];
    const summary = buildAssetSubjectSummary(subject, [image("old"), image("current", "2026-08-08T01:00:00.000Z")], variants);
    assert.equal(summary.coverAsset?.id, "current");
    assert.equal(summary.variantCount, 2);
    assert.equal(summary.formalImageCount, 2);
});

test("accepts image video and audio but rejects text", () => {
    assert.equal(isGalleryMediaAsset({ kind: "image" } as Asset), true);
    assert.equal(isGalleryMediaAsset({ kind: "video" } as Asset), true);
    assert.equal(isGalleryMediaAsset({ kind: "audio" } as Asset), true);
    assert.equal(isGalleryMediaAsset({ kind: "text" } as Asset), false);
});

test("keeps empty subjects only in image browsing or matching subject search", () => {
    const groups = [{ subject, assets: [] }];
    assert.equal(visibleGallerySubjectGroups({ groups, kindFilter: "all", keyword: "", hasScopedAssetFilter: false }).length, 1);
    assert.equal(visibleGallerySubjectGroups({ groups, kindFilter: "video", keyword: "", hasScopedAssetFilter: false }).length, 0);
    assert.equal(visibleGallerySubjectGroups({ groups, kindFilter: "all", keyword: "女主", hasScopedAssetFilter: false }).length, 1);
    assert.equal(visibleGallerySubjectGroups({ groups, kindFilter: "all", keyword: "", hasScopedAssetFilter: true }).length, 0);
});
