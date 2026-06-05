import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store.ts";
import { buildAssetVersionReference, collectAssetVersionUsageReferences, hasNewerAssetVersion, updateAssetReferenceToLatest } from "./asset-version-references.ts";

const baseAsset = (patch: Partial<Asset> = {}): Asset => ({
    id: "asset-1",
    kind: "image",
    title: "角色定妆",
    coverUrl: "/cover-v1.png",
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    data: { dataUrl: "/asset-v1.png", storageKey: "image:v1", width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
    metadata: {
        assetVersions: [
            {
                id: "version-1",
                versionNumber: 1,
                kind: "image",
                title: "角色定妆",
                coverUrl: "/cover-v1.png",
                data: { dataUrl: "/asset-v1.png", storageKey: "image:v1", width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
                createdAt: "2026-06-01T00:00:00.000Z",
                changeNote: "初始版本",
                source: "initial",
            },
        ],
        currentAssetVersionId: "version-1",
    },
    ...patch,
});

test("new asset references record the current asset version snapshot", () => {
    const reference = buildAssetVersionReference(baseAsset(), "2026-06-03T00:00:00.000Z");

    assert.equal(reference.assetId, "asset-1");
    assert.equal(reference.assetVersionId, "version-1");
    assert.equal(reference.versionNumber, 1);
    assert.equal(reference.assetUpdatedAt, "2026-06-02T00:00:00.000Z");
    assert.equal(reference.lockedAt, "2026-06-03T00:00:00.000Z");
    assert.equal(reference.mode, "fixed-version");
});

test("old references are reported as outdated when the asset has a newer version", () => {
    const reference = buildAssetVersionReference(baseAsset(), "2026-06-03T00:00:00.000Z");
    const updatedAsset = baseAsset({
        updatedAt: "2026-06-04T00:00:00.000Z",
        metadata: {
            assetVersions: [
                ...(baseAsset().metadata!.assetVersions as unknown[]),
                {
                    id: "version-2",
                    versionNumber: 2,
                    kind: "image",
                    title: "角色定妆",
                    coverUrl: "/cover-v2.png",
                    data: { dataUrl: "/asset-v2.png", storageKey: "image:v2", width: 100, height: 100, bytes: 1200, mimeType: "image/png" },
                    createdAt: "2026-06-04T00:00:00.000Z",
                    changeNote: "换图",
                    source: "manual_edit",
                },
            ],
            currentAssetVersionId: "version-2",
        },
    });

    assert.equal(hasNewerAssetVersion(reference, updatedAsset), true);
});

test("updating a reference to latest only changes the reference record and keeps history", () => {
    const reference = buildAssetVersionReference(baseAsset(), "2026-06-03T00:00:00.000Z");
    const updatedAsset = baseAsset({
        updatedAt: "2026-06-04T00:00:00.000Z",
        metadata: {
            assetVersions: [
                ...(baseAsset().metadata!.assetVersions as unknown[]),
                {
                    id: "version-2",
                    versionNumber: 2,
                    kind: "image",
                    title: "角色定妆",
                    coverUrl: "/cover-v2.png",
                    data: { dataUrl: "/asset-v2.png", storageKey: "image:v2", width: 100, height: 100, bytes: 1200, mimeType: "image/png" },
                    createdAt: "2026-06-04T00:00:00.000Z",
                    changeNote: "换图",
                    source: "manual_edit",
                },
            ],
            currentAssetVersionId: "version-2",
        },
    });

    const next = updateAssetReferenceToLatest(reference, updatedAsset, "2026-06-05T00:00:00.000Z");

    assert.equal(next.assetVersionId, "version-2");
    assert.equal(next.versionNumber, 2);
    assert.equal(next.assetUpdatedAt, "2026-06-04T00:00:00.000Z");
    assert.equal(next.updatedAt, "2026-06-05T00:00:00.000Z");
    assert.deepEqual(
        next.previousVersions?.map((item) => item.assetVersionId),
        ["version-1"],
    );
});

test("old version references are not mutated automatically", () => {
    const reference = buildAssetVersionReference(baseAsset(), "2026-06-03T00:00:00.000Z");
    const updatedAsset = baseAsset({
        updatedAt: "2026-06-04T00:00:00.000Z",
        metadata: {
            assetVersions: [
                ...(baseAsset().metadata!.assetVersions as unknown[]),
                {
                    id: "version-2",
                    versionNumber: 2,
                    kind: "image",
                    title: "角色定妆",
                    coverUrl: "/cover-v2.png",
                    data: { dataUrl: "/asset-v2.png", storageKey: "image:v2", width: 100, height: 100, bytes: 1200, mimeType: "image/png" },
                    createdAt: "2026-06-04T00:00:00.000Z",
                    changeNote: "换图",
                    source: "manual_edit",
                },
            ],
            currentAssetVersionId: "version-2",
        },
    });

    assert.equal(reference.assetVersionId, "version-1");
    assert.equal(hasNewerAssetVersion(reference, updatedAsset), true);
    assert.equal(reference.assetVersionId, "version-1");
    assert.equal(reference.versionNumber, 1);
});

test("usage collection reports canvas, storyboard, and production bible references", () => {
    const asset = baseAsset();
    const reference = buildAssetVersionReference(asset, "2026-06-03T00:00:00.000Z");

    const usages = collectAssetVersionUsageReferences(asset, {
        projectTitles: { "project-1": "竖屏短剧" },
        canvasProjects: [
            {
                id: "canvas-1",
                projectId: "project-1",
                title: "第一集画布",
                nodes: [{ id: "node-1", type: "image", title: "角色参考节点", metadata: { sourceAssetId: "asset-1", assetVersion: reference } }],
            },
        ],
        storyboardGroups: [{ id: "group-1", projectId: "project-1", title: "开场分镜组" }],
        storyboardShots: [{ id: "shot-1", groupId: "group-1", order: 1, title: "主角入场", assetRefs: [{ assetId: "asset-1", kind: "image", role: "reference_image", assetVersion: reference }] }],
        productionBibleItems: [{ id: "bible-1", projectId: "project-1", kind: "character", name: "主角设定", assetRefs: [{ assetId: "asset-1", role: "portrait", assetVersion: reference }] }],
    });

    assert.deepEqual(
        usages.map((usage) => [usage.kind, usage.objectTitle, usage.contextTitle || "", usage.projectTitle || ""]),
        [
            ["canvas-node", "角色参考节点", "第一集画布", "竖屏短剧"],
            ["storyboard-shot", "主角入场", "开场分镜组", "竖屏短剧"],
            ["production-bible", "主角设定", "", "竖屏短剧"],
        ],
    );
});
