import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AssetSubject, AssetVariant, AssetWorkbenchImage } from "../../../stores/use-asset-store.ts";
import { candidateAssetInput, copyWorkbenchImageInput, referenceFromWorkbenchImageInput } from "./asset-workbench.ts";

const subject: AssetSubject = { id: "subject-1", projectId: "project-1", category: "character", code: "CHAR-001", name: "小也", tags: [], createdAt: "", updatedAt: "" };
const variant: AssetVariant = { id: "variant-1", subjectId: subject.id, name: "战损", prompt: "雨夜战损", referenceImageIds: [], createdAt: "", updatedAt: "" };
const candidate: AssetWorkbenchImage = { id: "candidate-1", subjectId: subject.id, variantId: variant.id, role: "candidate", source: "generated", title: "候选 1", dataUrl: "blob:1", storageKey: "image:1", width: 100, height: 200, bytes: 300, mimeType: "image/png", createdAt: "" };

test("promotes a candidate with stable project, subject and variant binding", () => {
    const input = candidateAssetInput(subject, variant, candidate);
    assert.equal(input.assetBinding.projectId, subject.projectId);
    assert.equal(input.assetBinding.subjectId, subject.id);
    assert.equal(input.assetBinding.variantId, variant.id);
    assert.equal(input.assetBinding.variantName, variant.name);
});

test("copies candidate snapshots without carrying formal selection state", () => {
    const copied = copyWorkbenchImageInput(candidate, "variant-2");
    assert.equal(copied.variantId, "variant-2");
    assert.equal(copied.role, "candidate");
    assert.equal(copied.source, "candidate");
    assert.equal(copied.selectedAssetId, undefined);
    assert.equal(copied.storageKey, candidate.storageKey);
});

test("turns a candidate into a current-variant reference snapshot", () => {
    const reference = referenceFromWorkbenchImageInput(candidate, variant.id);
    assert.equal(reference.role, "reference");
    assert.equal(reference.source, "candidate");
    assert.equal(reference.variantId, variant.id);
});

test("wires one-time promotion, current main image and continuation actions", () => {
    const page = readFileSync(new URL("./[subjectId]/page.tsx", import.meta.url), "utf8");
    const grid = readFileSync(new URL("./[subjectId]/components/asset-candidate-grid.tsx", import.meta.url), "utf8");
    assert.match(page, /if \(candidate\.selectedAssetId\) return/);
    assert.match(page, /await addAssetOnce\(candidateAssetInput/);
    assert.match(page, /selectedAssetId: assetId/);
    assert.match(page, /setVariantCurrentAsset\(activeVariant\.id, assetId\)/);
    assert.match(grid, /作为参考图/);
    assert.match(grid, /复制到其他形态/);
});
