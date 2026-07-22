import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkflowGeneratedImagePatch, workflowAssetInfo } from "./workflow-asset-image.ts";
import type { TextAsset } from "../../../stores/use-asset-store.ts";
import type { AiConfig } from "../../../stores/use-config-store.ts";

test("keeps logical and library asset identity when an image version is written back", () => {
    const asset: TextAsset = { id: "library-char-1", kind: "text", title: "林夏", coverUrl: "", createdAt: "now", updatedAt: "now", data: { content: "角色提示词" }, tags: [], metadata: { originalWorkflow: { logicalAssetId: "CHAR-001", libraryAssetId: "library-char-1", importKey: "p1:e1:CHAR-001", imagePrompt: "真实角色设定图", description: "用户修正后的描述", manuallyEdited: true, generationSelected: false, version: "v2", status: "ready" } } };
    const patch = buildWorkflowGeneratedImagePatch(asset, { url: "data:image/png;base64,AA", storageKey: "image-1", width: 1024, height: 1024, bytes: 2, mimeType: "image/png" }, { config: { quality: "standard", size: "1024x1024" } as AiConfig, model: "test-image-model" });
    const originalWorkflow = patch.metadata.originalWorkflow as Record<string, unknown>;

    assert.equal(workflowAssetInfo(asset)?.logicalAssetId, "CHAR-001");
    assert.equal(originalWorkflow.logicalAssetId, "CHAR-001");
    assert.equal(originalWorkflow.libraryAssetId, "library-char-1");
    assert.equal(originalWorkflow.status, "image_generated");
    assert.equal(originalWorkflow.description, "用户修正后的描述");
    assert.equal(originalWorkflow.manuallyEdited, true);
    assert.equal(originalWorkflow.generationSelected, false);
});
