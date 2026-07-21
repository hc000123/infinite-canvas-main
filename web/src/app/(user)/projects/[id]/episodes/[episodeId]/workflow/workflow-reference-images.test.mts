import assert from "node:assert/strict";
import test from "node:test";

import { workflowReferenceImages } from "./workflow-reference-images.ts";

const image = (id: string, kind: string, projectId = "project-1", episode = "episode-1") => ({
    id,
    kind: "image" as const,
    title: id,
    coverUrl: `blob:${id}`,
    tags: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    data: { dataUrl: `blob:${id}`, width: 10, height: 10, bytes: 10, mimeType: "image/png" },
    metadata: { originalWorkflow: { projectId, episode, kind, name: id } },
});

test("selects only current episode images and orders character scene prop", () => {
    const result = workflowReferenceImages([image("prop", "道具"), image("other", "角色", "project-2"), image("scene", "场景"), image("character", "角色")], "project-1", "episode-1");
    assert.deepEqual(
        result.map((item) => [item.id, item.kind]),
        [
            ["character", "character"],
            ["scene", "scene"],
            ["prop", "prop"],
        ],
    );
});

test("accepts legacy workflow provenance and caps a batch at nine", () => {
    const assets = Array.from({ length: 12 }, (_, index) => ({ ...image(`角色${String(index).padStart(2, "0")}`, ""), metadata: { originalWorkflow: { sourceProjectId: "project-1", sourceEpisodeId: "episode-1", type: "人物" } } }));
    assert.equal(workflowReferenceImages(assets, "project-1", "episode-1").length, 9);
});
