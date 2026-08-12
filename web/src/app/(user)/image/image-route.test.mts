import assert from "node:assert/strict";
import test from "node:test";

import type { TextAsset } from "../../../stores/use-asset-store.ts";
import { legacyImageDestination } from "./image-route.ts";

const boundAsset: TextAsset = {
    id: "image-a",
    kind: "text",
    title: "林夏",
    coverUrl: "",
    folderId: "",
    favorite: false,
    tags: [],
    source: "workflow",
    note: "",
    createdAt: "now",
    updatedAt: "now",
    data: { content: "" },
    assetBinding: { projectId: "p1", subjectId: "subject-a", variantId: "variant-a", variantName: "基础形象", category: "character", allEpisodes: true, episodeIds: [] },
    metadata: { originalWorkflow: { assetId: "character-001", importKey: "p1:e1:character-001", sourceProjectId: "p1" } },
};

test("redirects a legacy bound image link to its asset subject", () => {
    assert.equal(legacyImageDestination(new URLSearchParams("libraryAssetId=image-a&projectId=p1"), [boundAsset]), "/assets/subject-a?variantId=variant-a");
    assert.equal(legacyImageDestination(new URLSearchParams("libraryAssetId=stale-id&assetId=character-001&projectId=p1"), [boundAsset]), "/assets/subject-a?variantId=variant-a");
});

test("falls back to the scoped asset library", () => {
    assert.equal(legacyImageDestination(new URLSearchParams("projectId=p1"), []), "/assets?projectId=p1");
    assert.equal(legacyImageDestination(new URLSearchParams(), []), "/assets");
});
