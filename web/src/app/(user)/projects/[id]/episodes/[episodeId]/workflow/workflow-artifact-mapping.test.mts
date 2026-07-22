import assert from "node:assert/strict";
import test from "node:test";

import { mapAssetDesignArtifactToAssets, mapArtArtifactToAssets } from "./workflow-artifact-mapping.ts";

test("keeps one library record for every logical asset across prompt and image updates", () => {
    const artifact = JSON.stringify({ items: [{ logicalAssetId: "CHAR-001", kind: "character", name: "林夏", scriptEvidence: "林夏穿黄色雨衣", description: "年轻女性，黄色雨衣", imagePrompt: "真实影视角色设定板", status: "ready" }] });
    const existing = [{ id: "library-char-1", kind: "image", title: "林夏", metadata: { originalWorkflow: { importKey: "p1:e1:CHAR-001", logicalAssetId: "CHAR-001", version: "v2" } } }];
    const result = mapAssetDesignArtifactToAssets(artifact, existing, { episodeId: "e1", projectId: "p1" });

    assert.equal(result.items[0].logicalAssetId, "CHAR-001");
    assert.equal(result.items[0].targetAssetId, "library-char-1");
    assert.equal(result.items[0].libraryAssetId, "library-char-1");
    assert.equal(result.items[0].preserveImage, true);
    assert.equal(result.items[0].scriptEvidence, "林夏穿黄色雨衣");
});

test("does not bind the same logical asset id from another project or episode", () => {
    const artifact = JSON.stringify({ items: [{ logicalAssetId: "CHAR-001", kind: "character", name: "本集角色", scriptEvidence: "本集原文", description: "本集设定", imagePrompt: "本集角色设定图" }] });
    const existing = [{ id: "other-library-char-1", kind: "image", title: "其他项目角色", metadata: { originalWorkflow: { importKey: "p2:e9:CHAR-001", logicalAssetId: "CHAR-001", sourceProjectId: "p2", sourceEpisodeId: "e9" } } }];
    const result = mapAssetDesignArtifactToAssets(artifact, existing, { episodeId: "e1", projectId: "p1" });

    assert.equal(result.items[0].action, "create");
    assert.equal(result.items[0].targetAssetId, undefined);
    assert.equal(result.items[0].importKey, "p1:e1:CHAR-001");
});

test("reuses a scoped legacy workflow record when the stable logical id is introduced", () => {
    const artifact = JSON.stringify({ items: [{ logicalAssetId: "PROP-001", kind: "prop", name: "红色纸飞机", scriptEvidence: "桌上有一只红色纸飞机", description: "红色折纸飞机", imagePrompt: "红色纸飞机道具设定图" }] });
    const existing = [{ id: "legacy-paper-plane", kind: "text", title: "红色纸飞机", metadata: { originalWorkflow: { logicalAssetId: "prop_red_paper_airplane", name: "红色纸飞机", sourceProjectId: "p1", sourceEpisodeId: "e1" } } }];

    const result = mapAssetDesignArtifactToAssets(artifact, existing, { episodeId: "e1", projectId: "p1" });

    assert.equal(result.items[0].action, "update_metadata");
    assert.equal(result.items[0].targetAssetId, "legacy-paper-plane");
});

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

test("preserves character variant relationship", () => {
    const artifact = JSON.stringify({ items: [
        { logicalAssetId: "CHAR-001", kind: "character", name: "林秋", scriptEvidence: "林秋", description: "六十岁女性", imagePrompt: "角色设定", status: "ready" },
        { logicalAssetId: "COSTUME-001", kind: "costume", name: "旧棉衣", scriptEvidence: "穿旧棉衣", description: "褪色棉衣", imagePrompt: "旧棉衣造型", status: "ready", parentLogicalAssetId: "CHAR-001", variantType: "costume", variantName: "旧棉衣" },
    ] });
    const result = mapAssetDesignArtifactToAssets(artifact, [], { episodeId: "e1", projectId: "p1" });

    assert.equal(result.items[1].parentLogicalAssetId, "CHAR-001");
    assert.equal(result.items[1].variantType, "costume");
    assert.equal(result.items[1].variantName, "旧棉衣");
});
