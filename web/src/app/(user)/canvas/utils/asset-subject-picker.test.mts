import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, AssetSubject, AssetVariant } from "../../../../stores/use-asset-store.ts";
import { buildAssetSubjectPickerItems, resolveSubjectPickerAsset } from "./asset-subject-picker.ts";
import { readFileSync } from "node:fs";

const now = "2026-08-10T00:00:00.000Z";
const subjects: AssetSubject[] = [
    { id: "subject-ready", projectId: "project-1", category: "character", code: "CHAR-001", name: "林默", tags: [], createdAt: now, updatedAt: now },
    { id: "subject-empty", projectId: "project-1", category: "prop", code: "PROP-001", name: "钥匙", tags: [], createdAt: now, updatedAt: now },
];
const variants: AssetVariant[] = [
    { id: "night", subjectId: "subject-ready", name: "夜行", prompt: "", referenceImageIds: [], currentAssetId: "night-current", createdAt: "2026-08-10T00:01:00.000Z", updatedAt: now },
    { id: "base", subjectId: "subject-ready", name: "基础形象", prompt: "", referenceImageIds: [], currentAssetId: "base-current", createdAt: now, updatedAt: now },
    { id: "empty-base", subjectId: "subject-empty", name: "基础状态", prompt: "", referenceImageIds: [], createdAt: now, updatedAt: now },
];
const image = (id: string, variantId: string, variantName: string, allEpisodes = true): Asset => ({ id, kind: "image", title: id, coverUrl: `blob:${id}`, tags: [], assetBinding: { projectId: "project-1", subjectId: "subject-ready", category: "character", variantId, variantName, allEpisodes, episodeIds: allEpisodes ? [] : ["ep-1"] }, data: { dataUrl: `blob:${id}`, width: 100, height: 100, bytes: 1, mimeType: "image/png" }, createdAt: now, updatedAt: now });
const assets = [image("base-current", "base", "基础形象"), image("night-current", "night", "夜行", false), image("night-old", "night", "夜行", false)];

test("builds subject-first picker items with the earliest base variant", () => {
    const items = buildAssetSubjectPickerItems({ subjects, variants, assets, projectId: "project-1", episodeId: "ep-1" });
    assert.equal(items[0].primaryVariant.id, "base");
    assert.equal(items[0].currentAsset?.id, "base-current");
    assert.equal(items[0].status, "ready");
    assert.equal(items[1].status, "incomplete");
});

test("resolves an explicit shape or historical version without accepting unrelated assets", () => {
    const items = buildAssetSubjectPickerItems({ subjects, variants, assets, projectId: "project-1", episodeId: "ep-1" });
    assert.equal(resolveSubjectPickerAsset(items[0], { variantId: "night", assetId: "night-old" })?.id, "night-old");
    assert.equal(resolveSubjectPickerAsset(items[0], { variantId: "night" })?.id, "night-current");
    assert.equal(resolveSubjectPickerAsset(items[0], { assetId: "missing" }), undefined);
});

test("excludes unbound inbox media from formal subject items", () => {
    const loose = { ...image("loose", "base", "基础形象"), assetBinding: undefined } as Asset;
    const items = buildAssetSubjectPickerItems({ subjects, variants, assets: [...assets, loose], projectId: "project-1" });
    assert.equal(items[0].assets.some((asset) => asset.id === "loose"), false);
});

test("keeps the all-assets tab inside the current project when context exists", () => {
    const picker = readFileSync(new URL("../components/asset-picker-modal.tsx", import.meta.url), "utf8");
    assert.match(picker, /key: "my-assets"[^\n]+<SubjectAssetsTab projectId=\{projectId\}/);
});
