import assert from "node:assert/strict";
import test from "node:test";

import { buildImageCapabilityTrace, imagePromptFromArtifacts, imageRenditionsFromArtifacts, selectImagePromptArtifact } from "./image-capability-context.ts";
import type { ArtifactEnvelope } from "../../../services/api/invocations-contract.ts";

const artifact = (id: string, artifactType: string, payload: Record<string, unknown>): ArtifactEnvelope => ({
    artifact: {
        id,
        userId: "user-1",
        artifactType,
        schemaId: `schema-${artifactType}`,
        schemaVersion: "1.0.0",
        schemaContentHash: `schema-hash-${artifactType}`,
        projectId: "project-1",
        episodeId: "episode-1",
        contentHash: `hash-${id}`,
        createdAt: "2026-07-26T00:00:00Z",
    },
    parentArtifactIds: [],
    payload,
    extensions: {},
});

test("image prompt selects the matching asset brief before stable fallback", () => {
    const first = artifact("brief-1", "asset_brief", { assetId: "asset-1", brief: "第一个资产" });
    const matching = artifact("brief-2", "asset_brief", { assetId: "asset-2", brief: "匹配资产" });
    assert.equal(selectImagePromptArtifact([first, matching], "asset-2")?.artifact.id, "brief-2");
    assert.equal(selectImagePromptArtifact([first, matching], "missing")?.artifact.id, "brief-1");
});

test("image prompt accepts shared production and video prompt projections", () => {
    assert.equal(imagePromptFromArtifacts([artifact("script-1", "production_script", { productionScript: "制作提示词" })], { approved: true }), "制作提示词");
    assert.equal(imagePromptFromArtifacts([artifact("video-1", "video_prompt_package", { items: [{ prompt: "镜头提示词" }] })], { approved: true }), "镜头提示词");
});

test("unapproved or empty Artifact sets never replace the image prompt", () => {
    const brief = artifact("brief-1", "asset_brief", { brief: "不应使用" });
    assert.equal(imagePromptFromArtifacts([brief], { approved: false }), "");
    assert.equal(imagePromptFromArtifacts([], { approved: true }), "");
    assert.equal(imagePromptFromArtifacts([artifact("empty", "asset_brief", { brief: "  " })], { approved: true }), "");
});

test("image capability trace contains coordinates without Artifact payloads", () => {
    const trace = buildImageCapabilityTrace({ invocationId: "inv-1", artifactIds: ["artifact-1"], skillVersionId: "skill-version-1", appliedAt: "2026-07-26T00:00:00Z" });
    assert.deepEqual(trace, { invocationId: "inv-1", artifactIds: ["artifact-1"], skillVersionId: "skill-version-1", appliedAt: "2026-07-26T00:00:00Z" });
    assert.doesNotMatch(JSON.stringify(trace), /payload|productionScript|brief/);
});

test("image capability consumes every valid asset rendition with exact Artifact coordinates", () => {
    const trace = { invocationId: "inv-1", artifactIds: ["rendition-1", "rendition-2"], skillVersionId: "skill-version-1", appliedAt: "2026-07-26T00:00:00Z" };
    const result = imageRenditionsFromArtifacts([
        artifact("rendition-1", "asset_rendition", { assetId: "character-1", renditionId: "front", mediaType: "image", mediaRef: "/api/uploaded-assets/runtime/image/front.png", generationMetadata: { model: "image-model" } }),
        artifact("other", "asset_brief", { assetId: "character-1", brief: "角色设定" }),
        artifact("rendition-2", "asset_rendition", { assetId: "character-1", renditionId: "side", mediaType: "image", mediaRef: "/api/uploaded-assets/runtime/image/side.webp", generationMetadata: { model: "image-model" } }),
        artifact("invalid", "asset_rendition", { assetId: "character-1", renditionId: "bad", mediaType: "video", mediaRef: "/runtime/bad.mp4" }),
    ], trace);

    assert.deepEqual(result, [
        {
            artifactId: "rendition-1",
            artifactHash: "hash-rendition-1",
            assetId: "character-1",
            renditionId: "front",
            mediaRef: "/api/uploaded-assets/runtime/image/front.png",
            mediaType: "image",
            model: "image-model",
            trace: { ...trace, artifactIds: ["rendition-1"] },
        },
        {
            artifactId: "rendition-2",
            artifactHash: "hash-rendition-2",
            assetId: "character-1",
            renditionId: "side",
            mediaRef: "/api/uploaded-assets/runtime/image/side.webp",
            mediaType: "image",
            model: "image-model",
            trace: { ...trace, artifactIds: ["rendition-2"] },
        },
    ]);
});
