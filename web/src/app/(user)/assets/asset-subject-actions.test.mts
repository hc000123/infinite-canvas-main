import assert from "node:assert/strict";
import test from "node:test";

import { subjectCandidateImageInput, subjectVoiceBinding } from "./asset-subject-actions.ts";

test("builds a non-destructive candidate upload for the primary variant", () => {
    const input = subjectCandidateImageInput({ subjectId: "subject-1", variantId: "variant-1" }, { url: "blob:image", storageKey: "image:1", width: 1024, height: 1024, bytes: 12, mimeType: "image/png" }, "hero.png");
    assert.equal(input.role, "candidate");
    assert.equal(input.source, "upload");
    assert.equal(input.variantId, "variant-1");
    assert.equal("currentAssetId" in input, false);
});

test("binds an audio asset to the same project and character subject", () => {
    const result = subjectVoiceBinding({ id: "character-1", projectId: "project-1" }, "audio-1");
    assert.equal(result.subjectPatch.voiceAssetId, "audio-1");
    assert.deepEqual(result.assetPatch.assetBinding, { projectId: "project-1", subjectId: "character-1", category: "character", variantName: "角色声音", allEpisodes: true, episodeIds: [] });
});
