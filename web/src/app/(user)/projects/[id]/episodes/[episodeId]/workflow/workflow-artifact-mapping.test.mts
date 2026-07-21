import assert from "node:assert/strict";
import test from "node:test";

import { mapArtArtifactToAssets } from "./workflow-artifact-mapping.ts";

test("maps approved art artifact without overwriting an existing image", () => {
    const artifact = JSON.stringify({ items: [{ id: "character-linxia", kind: "character", name: "林夏", prompt: "雨衣造型，真实影视定妆照" }] });
    const existing = [{ id: "asset-1", kind: "image", title: "林夏", metadata: { originalWorkflow: { importKey: "p1:e1:character-linxia" } } }];
    const result = mapArtArtifactToAssets(artifact, existing, { episodeId: "e1", projectId: "p1" });

    assert.equal(result.items[0].action, "update_metadata");
    assert.equal(result.items[0].preserveImage, true);
    assert.equal(result.items[0].targetAssetId, "asset-1");
});

test("creates a deterministic text asset for a new art item", () => {
    const artifact = JSON.stringify({ items: [{ id: "scene-rooftop", kind: "scene", name: "城市楼顶", prompt: "夜景楼顶空间设定" }] });
    const result = mapArtArtifactToAssets(artifact, [], { episodeId: "e1", projectId: "p1" });

    assert.equal(result.items[0].action, "create");
    assert.equal(result.items[0].importKey, "p1:e1:scene-rooftop");
});

test("rejects malformed art artifact rows", () => {
    const result = mapArtArtifactToAssets(JSON.stringify({ items: [{ id: "", name: "无效" }] }), [], { episodeId: "e1", projectId: "p1" });

    assert.equal(result.items.length, 0);
    assert.equal(result.warnings.length, 1);
});
