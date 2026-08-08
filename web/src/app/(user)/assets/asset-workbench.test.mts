import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, AssetSubject } from "../../../stores/use-asset-store.ts";
import { candidateAssetInput, defaultVariantName, filterReferenceAssets, validateVariantName, workbenchImageReference } from "./asset-workbench.ts";

const subject: AssetSubject = {
    id: "subject-1",
    projectId: "project-a",
    category: "character",
    code: "CHAR-001",
    name: "小也",
    tags: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
};

const variant = {
    id: "variant-1",
    subjectId: subject.id,
    name: "战损形态",
    prompt: "雨夜中的战损角色",
    referenceImageIds: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
};

const candidate = {
    id: "candidate-1",
    subjectId: subject.id,
    variantId: variant.id,
    role: "candidate" as const,
    source: "generated" as const,
    title: "候选 1",
    dataUrl: "blob:candidate-1",
    storageKey: "candidate-1",
    width: 1920,
    height: 1080,
    bytes: 200,
    mimeType: "image/png",
    generation: {
        prompt: variant.prompt,
        model: "image-model",
        quality: "high",
        size: "16:9",
        createdAt: "2026-08-08T00:00:00.000Z",
    },
    createdAt: "2026-08-08T00:00:00.000Z",
};

test("uses category-specific defaults and rejects duplicate variant names", () => {
    assert.equal(defaultVariantName("character"), "基础形象");
    assert.equal(defaultVariantName("scene"), "基础状态");
    assert.equal(validateVariantName(" 战损形态 ", [variant]), "形态名称已存在");
    assert.equal(validateVariantName("夜景", [variant]), "");
    assert.equal(validateVariantName("  ", [variant]), "请输入形态名称");
});

test("filters reference assets to the current project unless all projects are requested", () => {
    const assets = [imageAsset("current", "project-a"), imageAsset("other", "project-b"), imageAsset("unbound", "")];
    assert.deepEqual(filterReferenceAssets(assets, "project-a", "project").map((asset) => asset.id), ["current"]);
    assert.deepEqual(filterReferenceAssets(assets, "project-a", "all").map((asset) => asset.id), ["current", "other", "unbound"]);
});

test("builds a formally bound image asset from a candidate", () => {
    const input = candidateAssetInput(subject, variant, candidate);
    assert.equal(input.kind, "image");
    assert.equal(input.assetBinding?.variantId, variant.id);
    assert.equal(input.assetBinding?.variantName, variant.name);
    assert.equal(input.assetBinding?.projectId, subject.projectId);
    assert.equal(input.metadata?.source, "asset-workbench");
    assert.deepEqual(input.metadata?.generation, candidate.generation);
});

test("converts a candidate snapshot into an image-generation reference", () => {
    assert.deepEqual(workbenchImageReference(candidate), {
        id: candidate.id,
        name: candidate.title,
        type: candidate.mimeType,
        dataUrl: candidate.dataUrl,
        storageKey: candidate.storageKey,
    });
});

function imageAsset(id: string, projectId: string): Asset {
    return {
        id,
        kind: "image",
        title: id,
        coverUrl: `blob:${id}`,
        tags: [],
        assetBinding: projectId
            ? { projectId, subjectId: `${id}-subject`, category: "character", variantName: "基础形象", allEpisodes: true, episodeIds: [] }
            : undefined,
        data: { dataUrl: `blob:${id}`, width: 1, height: 1, bytes: 1, mimeType: "image/png" },
        createdAt: "",
        updatedAt: "",
    };
}
