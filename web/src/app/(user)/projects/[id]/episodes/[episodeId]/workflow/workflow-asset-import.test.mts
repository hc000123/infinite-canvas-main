import assert from "node:assert/strict";
import test from "node:test";

import { assetVersionRecords } from "../../../../../assets/asset-version-history.ts";
import { workflowAssetLibraryImportPatch } from "./workflow-asset-import.ts";

test("reuses a library image as a version on the target workflow asset", () => {
    const target = { id: "target", kind: "text", title: "楚云汐房间", coverUrl: "", tags: [], createdAt: "now", updatedAt: "now", data: { content: "场景提示词" }, metadata: { originalWorkflow: { logicalAssetId: "SCENE-001", imagePrompt: "场景提示词" } } } as const;
    const source = { id: "source", kind: "image", title: "已生成的楚云汐房间", coverUrl: "/room.png", tags: [], createdAt: "now", updatedAt: "now", data: { dataUrl: "/room.png", storageKey: "image:room", width: 1280, height: 720, bytes: 10, mimeType: "image/png" } } as const;
    const patch = workflowAssetLibraryImportPatch(target as never, source as never);

    assert.equal(patch.kind, "image");
    assert.equal(patch.metadata?.matchedAssetId, "source");
    assert.equal(assetVersionRecords({ ...target, ...patch } as never).length, 2);
});
