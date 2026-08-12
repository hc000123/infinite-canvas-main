import assert from "node:assert/strict";
import test from "node:test";

import * as workflowAssetImage from "./workflow-asset-image.ts";
import type { TextAsset } from "../../../stores/use-asset-store.ts";
import type { AiConfig } from "../../../stores/use-config-store.ts";

test("keeps logical and library asset identity when an image version is written back", () => {
    const asset: TextAsset = { id: "library-char-1", kind: "text", title: "林夏", coverUrl: "", createdAt: "now", updatedAt: "now", data: { content: "角色提示词" }, tags: [], assetBinding: { projectId: "p1", subjectId: "subject-a", category: "character", variantName: "基础形象", allEpisodes: false, episodeIds: ["e1"] }, metadata: { originalWorkflow: { logicalAssetId: "CHAR-001", libraryAssetId: "library-char-1", importKey: "p1:e1:CHAR-001", imagePrompt: "真实角色设定图", description: "用户修正后的描述", scriptEvidence: "林夏站在门前", variantName: "基础形象", manuallyEdited: true, generationSelected: false, version: "v2", status: "ready" } } };
    const variants = [{ id: "variant-a", subjectId: "subject-a", name: "基础形象", prompt: "", referenceImageIds: [], createdAt: "now", updatedAt: "now" }];
    const info = workflowAssetImage.workflowAssetInfo(asset);
    const patch = workflowAssetImage.buildWorkflowGeneratedImagePatch(asset, { url: "data:image/png;base64,AA", storageKey: "image-1", width: 1024, height: 1024, bytes: 2, mimeType: "image/png" }, { config: { quality: "standard", size: "1024x1024" } as AiConfig, model: "test-image-model" });
    const originalWorkflow = patch.metadata.originalWorkflow as Record<string, unknown>;

    assert.equal(info?.logicalAssetId, "CHAR-001");
    assert.equal(info?.description, "用户修正后的描述");
    assert.equal(info?.scriptEvidence, "林夏站在门前");
    assert.equal(info?.variantName, "基础形象");
    assert.equal(typeof workflowAssetImage.workflowAssetVariantId, "function");
    assert.equal(workflowAssetImage.workflowAssetVariantId(asset, variants), "variant-a");
    assert.equal(originalWorkflow.logicalAssetId, "CHAR-001");
    assert.equal(originalWorkflow.libraryAssetId, "library-char-1");
    assert.equal(originalWorkflow.status, "image_generated");
    assert.equal(originalWorkflow.description, "用户修正后的描述");
    assert.equal(originalWorkflow.manuallyEdited, true);
    assert.equal(originalWorkflow.generationSelected, false);
});
