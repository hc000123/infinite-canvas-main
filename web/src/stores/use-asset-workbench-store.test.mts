import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, AssetVariant, AssetWorkbenchImage } from "./use-asset-store.ts";
import {
    clearRemovedAssetFromVariants,
    createDefaultAssetVariant,
    duplicateAssetVariant,
    removeAssetSubjectCollections,
    removeAssetVariantCollections,
    renameAssetVariantCollections,
} from "./asset-workbench-state.ts";

const now = "2026-08-08T00:00:00.000Z";

test("creates category-specific default variants", () => {
    assert.equal(createDefaultAssetVariant("subject-1", "character", "variant-1", now).name, "基础形象");
    assert.equal(createDefaultAssetVariant("subject-2", "blocking", "variant-2", now).name, "基础状态");
});

test("duplicates configuration without copying a current formal asset", () => {
    const original: AssetVariant = {
        ...createDefaultAssetVariant("subject-1", "scene", "variant-1", now),
        prompt: "雨夜天台",
        referenceImageIds: ["reference-1"],
        currentAssetId: "asset-1",
        config: { imageModel: "model-a", size: "16:9" },
    };
    const copied = duplicateAssetVariant(original, "清晨", "variant-2", now);
    assert.equal(copied.name, "清晨");
    assert.equal(copied.prompt, original.prompt);
    assert.deepEqual(copied.referenceImageIds, original.referenceImageIds);
    assert.notEqual(copied.referenceImageIds, original.referenceImageIds);
    assert.equal(copied.config?.imageModel, "model-a");
    assert.equal(copied.currentAssetId, undefined);
});

test("renames a variant and its formal asset binding snapshots", () => {
    const variant = createDefaultAssetVariant("subject-1", "character", "variant-1", now);
    const asset = imageAsset("asset-1", variant.id, variant.name);
    const result = renameAssetVariantCollections([variant], [asset], variant.id, "战损", now);
    assert.equal(result.variants[0]?.name, "战损");
    assert.equal(result.assets[0]?.assetBinding?.variantName, "战损");
});

test("protects the last variant and removes only its draft images when another exists", () => {
    const first = createDefaultAssetVariant("subject-1", "character", "variant-1", now);
    const second = duplicateAssetVariant(first, "战损", "variant-2", now);
    const image = workbenchImage("candidate-1", second.id);
    assert.equal(removeAssetVariantCollections([first], [image], first.id).removed, false);
    const result = removeAssetVariantCollections([first, second], [image], second.id);
    assert.equal(result.removed, true);
    assert.deepEqual(result.variants.map((item) => item.id), [first.id]);
    assert.deepEqual(result.workbenchImages, []);
});

test("removing a subject keeps formal assets while clearing bindings and drafts", () => {
    const variant = createDefaultAssetVariant("subject-1", "prop", "variant-1", now);
    const result = removeAssetSubjectCollections([variant], [workbenchImage("candidate-1", variant.id)], [imageAsset("asset-1", variant.id, variant.name)], "subject-1", now);
    assert.deepEqual(result.variants, []);
    assert.deepEqual(result.workbenchImages, []);
    assert.equal(result.assets[0]?.id, "asset-1");
    assert.equal(result.assets[0]?.assetBinding, undefined);
});

test("clears current pointers when a formal asset is removed", () => {
    const variant = { ...createDefaultAssetVariant("subject-1", "character", "variant-1", now), currentAssetId: "asset-1" };
    assert.equal(clearRemovedAssetFromVariants([variant], "asset-1", now)[0]?.currentAssetId, undefined);
});

function imageAsset(id: string, variantId: string, variantName: string): Asset {
    return {
        id,
        kind: "image",
        title: id,
        coverUrl: `blob:${id}`,
        tags: [],
        assetBinding: { projectId: "project-1", subjectId: "subject-1", category: "character", variantId, variantName, allEpisodes: true, episodeIds: [] },
        data: { dataUrl: `blob:${id}`, width: 1, height: 1, bytes: 1, mimeType: "image/png" },
        createdAt: now,
        updatedAt: now,
    };
}

function workbenchImage(id: string, variantId: string): AssetWorkbenchImage {
    return {
        id,
        subjectId: "subject-1",
        variantId,
        role: "candidate",
        source: "upload",
        title: id,
        dataUrl: `blob:${id}`,
        width: 1,
        height: 1,
        bytes: 1,
        mimeType: "image/png",
        createdAt: now,
    };
}
