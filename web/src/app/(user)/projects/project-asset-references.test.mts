import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store.ts";
import type { CanvasProject } from "../canvas/stores/use-canvas-store.ts";
import type { ProductionBibleItem } from "../canvas/utils/production-bible.ts";
import type { StoryboardGroup, StoryboardShot } from "../canvas/utils/storyboard-management.ts";
import { buildAssetVersionReference } from "../assets/asset-version-references.ts";
import { collectProjectAssetReferences, filterProjectAssetReferences } from "./project-asset-references.ts";

test("aggregates project asset references from canvas, storyboard, bible, results, and generation metadata", () => {
    const asset = imageAsset("asset-1", "角色图");
    const result = videoAsset("asset-2", "分镜结果");
    const rows = collectProjectAssetReferences({
        assets: [asset, result],
        projectId: "project-1",
        projectTitle: "短剧项目",
        canvasIds: ["canvas-bound"],
        canvasProjects: [canvasWithAsset(asset, "canvas-bound")],
        storyboardGroups: [storyboardGroup("group-1")],
        storyboardShots: [storyboardShot("shot-1", asset, result.id)],
        productionBibleItems: [bibleItem("bible-1", asset)],
    });

    const roleAsset = rows.find((row) => row.asset.id === "asset-1");
    const resultAsset = rows.find((row) => row.asset.id === "asset-2");

    assert.ok(roleAsset);
    assert.deepEqual(roleAsset.references.map((reference) => reference.type).sort(), ["canvas", "production-bible", "storyboard"]);
    assert.ok(resultAsset);
    assert.deepEqual(resultAsset.references.map((reference) => reference.type).sort(), ["generation-result", "generation-result"]);
});

test("filters project asset references by reference type", () => {
    const asset = imageAsset("asset-1", "角色图");
    const result = videoAsset("asset-2", "分镜结果");
    const rows = collectProjectAssetReferences({
        assets: [asset, result],
        projectId: "project-1",
        canvasProjects: [canvasWithAsset(asset, "canvas-1", "project-1")],
        storyboardGroups: [storyboardGroup("group-1")],
        storyboardShots: [storyboardShot("shot-1", asset, result.id)],
        productionBibleItems: [],
    });

    assert.deepEqual(
        filterProjectAssetReferences(rows, { referenceType: "canvas" }).map((row) => row.asset.id),
        ["asset-1"],
    );
    assert.deepEqual(
        filterProjectAssetReferences(rows, { referenceType: "generation-result" }).map((row) => row.asset.id),
        ["asset-2"],
    );
});

test("tracks outdated version references using the shared asset version helpers", () => {
    const v1 = imageAsset("asset-1", "角色图");
    const reference = buildAssetVersionReference(v1, "2026-06-03T00:00:00.000Z");
    const v2 = imageAsset("asset-1", "角色图", {
        updatedAt: "2026-06-04T00:00:00.000Z",
        metadata: {
            assetVersions: [...(v1.metadata!.assetVersions as unknown[]), versionRecord(2)],
            currentAssetVersionId: "version-2",
        },
    });
    const rows = collectProjectAssetReferences({
        assets: [v2],
        projectId: "project-1",
        canvasProjects: [
            {
                ...canvasWithAsset(v2, "canvas-1", "project-1"),
                nodes: [{ id: "node-1", type: "image", title: "旧节点", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { sourceAssetId: "asset-1", assetVersion: reference } }],
            },
        ],
        storyboardGroups: [],
        storyboardShots: [],
        productionBibleItems: [],
    });

    assert.equal(rows[0].hasOutdatedVersion, true);
    assert.equal(filterProjectAssetReferences(rows, { versionStatus: "outdated" }).length, 1);
    assert.equal(filterProjectAssetReferences(rows, { versionStatus: "latest" }).length, 0);
});

test("filters project asset references by project library status", () => {
    const shared = imageAsset("asset-1", "项目库素材", {
        metadata: { ...imageAsset("asset-1", "项目库素材").metadata, projectLibraries: [{ projectId: "project-1", visibility: "project", role: "editor", syncStatus: "local", addedAt: "now", updatedAt: "now" }] },
    });
    const localOnly = imageAsset("asset-2", "普通素材");
    const rows = collectProjectAssetReferences({
        assets: [shared, localOnly],
        projectId: "project-1",
        canvasProjects: [canvasWithAsset(shared, "canvas-1", "project-1"), canvasWithAsset(localOnly, "canvas-2", "project-1")],
        storyboardGroups: [],
        storyboardShots: [],
        productionBibleItems: [],
    });

    assert.deepEqual(
        filterProjectAssetReferences(rows, { projectLibraryStatus: "shared" }).map((row) => row.asset.id),
        ["asset-1"],
    );
    assert.deepEqual(
        filterProjectAssetReferences(rows, { projectLibraryStatus: "not_shared" }).map((row) => row.asset.id),
        ["asset-2"],
    );
});

test("marks media assets with missing local storage keys", () => {
    const asset = videoAsset("asset-1", "丢失视频");
    const rows = collectProjectAssetReferences({
        assets: [asset],
        projectId: "project-1",
        canvasProjects: [canvasWithAsset(asset, "canvas-1", "project-1")],
        storyboardGroups: [],
        storyboardShots: [],
        productionBibleItems: [],
        missingStorageKeys: new Set(["video:asset-1"]),
    });

    assert.equal(rows[0].hasMissingLocalFile, true);
});

function imageAsset(id: string, title: string, patch: Partial<Asset> = {}): Asset {
    return {
        id,
        kind: "image",
        title,
        coverUrl: `/${id}.png`,
        tags: [],
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        data: { dataUrl: `/${id}.png`, storageKey: `image:${id}`, width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
        metadata: { assetVersions: [versionRecord(1)], currentAssetVersionId: "version-1" },
        ...patch,
    } as Asset;
}

function videoAsset(id: string, title: string): Asset {
    return {
        id,
        kind: "video",
        title,
        coverUrl: "",
        tags: [],
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        data: { url: `/${id}.mp4`, storageKey: `video:${id}`, width: 1280, height: 720, bytes: 1000, mimeType: "video/mp4" },
        metadata: {
            generation: {
                source: "canvas",
                projectId: "project-1",
                storyboardGroupId: "group-1",
                storyboardShotId: "shot-1",
                nodeId: `node-${id}`,
                createdAt: "2026-06-02T00:00:00.000Z",
            },
        },
    };
}

function versionRecord(versionNumber: number) {
    return {
        id: `version-${versionNumber}`,
        versionNumber,
        kind: "image",
        title: "角色图",
        coverUrl: `/cover-v${versionNumber}.png`,
        data: { dataUrl: `/asset-v${versionNumber}.png`, storageKey: `image:v${versionNumber}`, width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
        createdAt: `2026-06-0${versionNumber}T00:00:00.000Z`,
        changeNote: versionNumber === 1 ? "初始版本" : "换图",
        source: versionNumber === 1 ? "initial" : "manual_edit",
    };
}

function canvasWithAsset(asset: Asset, id: string, projectId?: string): CanvasProject {
    return {
        id,
        projectId,
        title: "画布",
        createdAt: "now",
        updatedAt: "now",
        nodes: [{ id: `node-${id}`, type: asset.kind, title: "素材节点", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { sourceAssetId: asset.id, assetVersion: buildAssetVersionReference(asset) } }],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
    };
}

function storyboardGroup(id: string): StoryboardGroup {
    return { id, projectId: "project-1", order: 1, title: "分镜组", description: "", preset: {}, shotIds: [], createdAt: "now", updatedAt: "now" };
}

function storyboardShot(id: string, asset: Asset, resultAssetId: string): StoryboardShot {
    return {
        id,
        groupId: "group-1",
        order: 1,
        title: "分镜",
        description: "",
        prompt: "",
        effectivePrompt: "",
        assetRefs: [{ assetId: asset.id, kind: asset.kind === "audio" ? "audio" : asset.kind === "video" ? "video" : "image", role: "reference", assetVersion: buildAssetVersionReference(asset) }],
        nodeRefs: [],
        resultAssetIds: [resultAssetId],
        primaryAssetId: resultAssetId,
        status: "done",
        createdAt: "now",
        updatedAt: "now",
    };
}

function bibleItem(id: string, asset: Asset): ProductionBibleItem {
    return {
        id,
        projectId: "project-1",
        kind: "character",
        name: "主角",
        description: "",
        tags: [],
        assetRefs: [{ assetId: asset.id, role: "portrait", assetVersion: buildAssetVersionReference(asset) }],
        promptSnippets: {},
        createdAt: "now",
        updatedAt: "now",
    };
}
