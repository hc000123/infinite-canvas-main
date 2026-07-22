import assert from "node:assert/strict";
import test from "node:test";

import { limitShotReferences, validateReferenceDefinition } from "./workflow-reference-bindings.ts";

const bindings = Array.from({ length: 10 }, (_, index) => ({ role: "character" as const, label: `角色 ${index}`, logicalAssetId: `CHAR-${index}`, libraryAssetId: `asset-${index}`, version: "v1", usage: "角色身份与外观一致性" }));

test("reserves one of nine image slots for continuity", () => {
    const result = limitShotReferences(bindings, { sourceShotId: "shot-001", libraryAssetId: "tail", version: "v1" });
    assert.equal(result.assetReferences.length, 8);
    assert.equal(result.references.at(-1)?.role, "continuity_reference");
});

test("requires an asset number except for blocking references", () => {
    assert.equal(validateReferenceDefinition({ role: "blocking", label: "双人站位", libraryAssetId: "block", version: "v1" }), "");
    assert.match(validateReferenceDefinition({ role: "character", label: "楚云汐", libraryAssetId: "char", version: "v1" }), /资产编号/);
});
