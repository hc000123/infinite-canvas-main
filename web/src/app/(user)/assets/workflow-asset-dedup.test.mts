import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { buildWorkflowAssetCanonicalView, workflowAssetDeleteIds } from "./workflow-asset-dedup.ts";

function textAsset(id: string, logicalAssetId: string, projectId = "project-1", episodeId = "episode-1", title = "红色纸飞机"): Asset {
    return {
        id,
        kind: "text",
        title,
        coverUrl: "",
        tags: ["legacy"],
        source: "cloud-workflow-art-design",
        note: "旧提示词",
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
        data: { content: "旧版红色纸飞机提示词" },
        metadata: {
            generations: [{ id: "legacy-generation" }],
            originalWorkflow: { logicalAssetId, name: title, sourceProjectId: projectId, sourceEpisodeId: episodeId, prompt: "旧版红色纸飞机提示词" },
        },
    };
}

function imageAsset(id: string, logicalAssetId: string, projectId = "project-1", episodeId = "episode-1", title = "红色纸飞机"): Asset {
    return {
        id,
        kind: "image",
        title,
        coverUrl: "blob:stable-image",
        tags: ["stable"],
        source: "cloud-workflow-asset-design",
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
        data: { dataUrl: "blob:stable-image", storageKey: "image:stable", width: 1024, height: 1024, bytes: 1024, mimeType: "image/png" },
        metadata: {
            generations: [{ id: "stable-generation" }],
            originalWorkflow: { logicalAssetId, name: title, sourceProjectId: projectId, sourceEpisodeId: episodeId, prompt: "稳定编号提示词" },
        },
    };
}

test("collapses scoped legacy and stable workflow records into the image asset", () => {
    const legacy = textAsset("legacy-asset", "prop_red_paper_airplane");
    const stable = imageAsset("stable-asset", "PROP-001");

    const result = buildWorkflowAssetCanonicalView([legacy, stable]);
    const canonical = result.assets[0];
    const workflow = canonical.metadata?.originalWorkflow as Record<string, unknown>;

    assert.equal(result.assets.length, 1);
    assert.equal(canonical.id, stable.id);
    assert.equal(canonical.kind, "image");
    assert.equal(canonical.data.storageKey, "image:stable");
    assert.deepEqual(canonical.tags.sort(), ["legacy", "stable"]);
    assert.deepEqual(result.aliasIdsByCanonicalId.get(stable.id), [legacy.id]);
    assert.deepEqual(workflow.aliasAssetIds, [legacy.id]);
    assert.deepEqual(workflow.legacyLogicalAssetIds, ["prop_red_paper_airplane"]);
    assert.equal((canonical.metadata?.generations as unknown[]).length, 2);
    assert.equal((canonical.metadata?.assetVersions as unknown[]).length, 2);
    assert.equal(canonical.metadata?.currentAssetVersionId, "workflow-canonical-stable-asset");
});

test("prefers the stable logical id when both duplicate records are text", () => {
    const legacy = textAsset("legacy-table", "prop_wooden_table", "project-1", "episode-1", "木桌");
    const stable = { ...textAsset("stable-table", "PROP-002", "project-1", "episode-1", "木桌"), tags: ["stable"], updatedAt: "2026-07-21T00:00:00.000Z" } as Asset;

    const result = buildWorkflowAssetCanonicalView([legacy, stable]);

    assert.equal(result.assets.length, 1);
    assert.equal(result.assets[0].id, stable.id);
    assert.deepEqual(result.aliasIdsByCanonicalId.get(stable.id), [legacy.id]);
});

test("does not merge the same workflow name across projects or episodes", () => {
    const result = buildWorkflowAssetCanonicalView([
        textAsset("legacy-project", "prop_red_paper_airplane", "project-2", "episode-1"),
        textAsset("legacy-episode", "prop_red_paper_airplane", "project-1", "episode-2"),
        imageAsset("stable-asset", "PROP-001"),
    ]);

    assert.equal(result.assets.length, 3);
    assert.equal(result.aliasIdsByCanonicalId.size, 0);
});

test("does not merge ordinary same-title assets", () => {
    const base = textAsset("manual-1", "");
    const first = { ...base, metadata: undefined, source: "手动添加" } as Asset;
    const second = { ...first, id: "manual-2" } as Asset;

    const result = buildWorkflowAssetCanonicalView([first, second]);

    assert.equal(result.assets.length, 2);
    assert.equal(result.aliasIdsByCanonicalId.size, 0);
});

test("expands an explicit canonical delete to its hidden aliases", () => {
    const aliases = new Map([["canonical", ["legacy-a", "legacy-b", "legacy-a"]]]);

    assert.deepEqual(workflowAssetDeleteIds("canonical", aliases), ["canonical", "legacy-a", "legacy-b"]);
    assert.deepEqual(workflowAssetDeleteIds("ordinary", aliases), ["ordinary"]);
});
