import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, AssetSubject, AssetVariant, AssetWorkbenchImage } from "../../../stores/use-asset-store.ts";
import { buildAssetCenterSubjects, unorganizedAssets } from "./asset-gallery.ts";

const now = "2026-08-10T00:00:00.000Z";
const subject: AssetSubject = { id: "subject-1", projectId: "project-1", category: "character", code: "CHAR-001", name: "林默", tags: [], createdAt: now, updatedAt: now };
const variants: AssetVariant[] = [
    { id: "variant-night", subjectId: subject.id, name: "夜行", prompt: "", referenceImageIds: [], currentAssetId: "night-image", createdAt: "2026-08-10T00:01:00.000Z", updatedAt: now },
    { id: "variant-base", subjectId: subject.id, name: "基础形象", prompt: "", referenceImageIds: [], currentAssetId: "current-image", createdAt: now, updatedAt: now },
];
const binding = (variantId: string, variantName: string) => ({ projectId: "project-1", subjectId: subject.id, category: "character" as const, variantId, variantName, allEpisodes: true, episodeIds: [] });
const image = (id: string, variantId?: string, variantName = "基础形象"): Asset => ({
    id,
    kind: "image",
    title: id,
    coverUrl: `blob:${id}`,
    tags: [],
    ...(variantId ? { assetBinding: binding(variantId, variantName) } : {}),
    metadata: { projectLibraries: [{ projectId: "project-1" }] },
    data: { dataUrl: `blob:${id}`, width: 1024, height: 1024, bytes: 1, mimeType: "image/png" },
    createdAt: now,
    updatedAt: now,
});
const assets: Asset[] = [
    image("current-image", "variant-base"),
    image("night-image", "variant-night", "夜行"),
    image("loose-image"),
    { id: "related-video", kind: "video", title: "动作参考", coverUrl: "", tags: [], assetBinding: binding("variant-base", "基础形象"), data: { url: "blob:video", width: 1280, height: 720, bytes: 1, mimeType: "video/mp4" }, createdAt: now, updatedAt: now },
];
const workbenchImages: AssetWorkbenchImage[] = [
    { id: "candidate-1", subjectId: subject.id, variantId: "variant-base", role: "candidate", source: "generated", title: "候选一", dataUrl: "blob:one", width: 1, height: 1, bytes: 1, mimeType: "image/png", createdAt: now },
    { id: "candidate-2", subjectId: subject.id, variantId: "variant-base", role: "candidate", source: "generated", title: "候选二", dataUrl: "blob:two", width: 1, height: 1, bytes: 1, mimeType: "image/png", createdAt: now },
    { id: "selected", subjectId: subject.id, variantId: "variant-base", role: "candidate", source: "generated", title: "已转正", dataUrl: "blob:selected", width: 1, height: 1, bytes: 1, mimeType: "image/png", selectedAssetId: "current-image", createdAt: now },
];

test("builds subject summaries from variants, pending results, versions and related media", () => {
    const summaries = buildAssetCenterSubjects({ subjects: [subject], variants, assets, workbenchImages, projectId: "project-1" });
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].primaryVariant.id, "variant-base");
    assert.equal(summaries[0].coverAsset?.id, "current-image");
    assert.equal(summaries[0].pendingCount, 2);
    assert.equal(summaries[0].versionCount, 2);
    assert.equal(summaries[0].relatedMediaCount, 1);
    assert.equal(summaries[0].readiness, "ready");
});

test("keeps only unbound project assets in the inbox", () => {
    assert.deepEqual(unorganizedAssets(assets, "project-1").map((asset) => asset.id), ["loose-image"]);
    assert.deepEqual(unorganizedAssets(assets, "project-2"), []);
});
