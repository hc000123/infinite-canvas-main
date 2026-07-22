import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkflowAssetCards, defaultWorkflowAssetSelection, workflowAssetCategoryCounts, workflowAssetEditPatch } from "./workflow-asset-card-model.ts";
import { mapAssetDesignArtifactToAssets } from "./workflow-artifact-mapping.ts";

const artifact = JSON.stringify({ items: [
    { logicalAssetId: "CHAR-001", kind: "character", name: "林秋", scriptEvidence: "林秋躺在床上", description: "六十岁女性", imagePrompt: "角色设定", status: "ready" },
    { logicalAssetId: "COSTUME-001", kind: "costume", name: "旧棉衣", scriptEvidence: "穿旧棉衣", description: "褪色棉衣", imagePrompt: "旧棉衣造型", status: "ready", parentLogicalAssetId: "CHAR-001", variantType: "costume", variantName: "旧棉衣" },
    { logicalAssetId: "SCENE-001", kind: "scene", name: "土坯房", scriptEvidence: "土坯房内", description: "旧卧室", imagePrompt: "场景设定", status: "ready" },
    { logicalAssetId: "PROP-001", kind: "prop", name: "煤油灯", scriptEvidence: "煤油灯亮着", description: "旧煤油灯", imagePrompt: "道具设定", status: "ready" },
] });

test("groups costume rows inside their parent character card", () => {
    const rows = mapAssetDesignArtifactToAssets(artifact, [], { episodeId: "e1", projectId: "p1" }).items;
    const cards = buildWorkflowAssetCards(rows, []);

    assert.deepEqual(cards.map((card) => card.logicalAssetId), ["CHAR-001", "SCENE-001", "PROP-001"]);
    assert.deepEqual(cards[0].variants.map((variant) => variant.logicalAssetId), ["CHAR-001", "COSTUME-001"]);
    assert.deepEqual(workflowAssetCategoryCounts(cards), { all: 3, character: 1, scene: 1, prop: 1 });
    assert.deepEqual(defaultWorkflowAssetSelection(cards), ["CHAR-001", "COSTUME-001", "SCENE-001", "PROP-001"]);
});

test("marks an orphan variant and excludes it from default generation", () => {
    const rows = mapAssetDesignArtifactToAssets(JSON.stringify({ items: [{ logicalAssetId: "COSTUME-001", kind: "costume", name: "旧棉衣", scriptEvidence: "旧棉衣", description: "褪色", imagePrompt: "造型图", parentLogicalAssetId: "CHAR-999", variantType: "costume", variantName: "旧棉衣" }] }), [], { episodeId: "e1", projectId: "p1" }).items;
    const cards = buildWorkflowAssetCards(rows, []);

    assert.equal(cards[0].variants[0].missingParent, true);
    assert.equal(cards[0].category, "character");
    assert.deepEqual(defaultWorkflowAssetSelection(cards), []);
});

test("keeps generated image out of default selection", () => {
    const existing = [{ id: "image-1", kind: "image", title: "林秋", metadata: { originalWorkflow: { importKey: "p1:e1:CHAR-001" } } }];
    const rows = mapAssetDesignArtifactToAssets(artifact, existing, { episodeId: "e1", projectId: "p1" }).items;
    const cards = buildWorkflowAssetCards(rows, existing as never);

    assert.equal(cards[0].variants[0].asset?.id, "image-1");
    assert.equal(defaultWorkflowAssetSelection(cards).includes("CHAR-001"), false);
});

test("updates prompt metadata without replacing image data or history", () => {
    const asset = {
        id: "image-1", kind: "image", title: "林秋", coverUrl: "blob:cover", tags: [], createdAt: "now", updatedAt: "now",
        data: { dataUrl: "blob:image", width: 1280, height: 720, bytes: 10, mimeType: "image/png" },
        metadata: { originalWorkflow: { logicalAssetId: "CHAR-001", imagePrompt: "旧提示词" }, versions: [{ id: "v1" }] },
    } as const;
    const patch = workflowAssetEditPatch(asset as never, { description: "新描述", imagePrompt: "新提示词" });

    assert.equal((patch.metadata?.originalWorkflow as Record<string, unknown>).imagePrompt, "新提示词");
    assert.deepEqual(patch.metadata?.versions, [{ id: "v1" }]);
    assert.equal("data" in patch, false);
});
