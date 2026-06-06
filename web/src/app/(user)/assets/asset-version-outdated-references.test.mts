import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store.ts";
import { buildAssetVersionReference } from "./asset-version-references.ts";
import { collectOutdatedAssetVersionUsages, selectedOutdatedUsageSummary, updateCanvasProjectAssetReferenceToLatest, updateProductionBibleAssetReferenceToLatest, updateStoryboardShotAssetReferenceToLatest } from "./asset-version-outdated-references.ts";

const versionOne = {
    id: "version-1",
    versionNumber: 1,
    kind: "image",
    title: "角色图",
    coverUrl: "/cover-v1.png",
    data: { dataUrl: "/asset-v1.png", storageKey: "image:v1", width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
    createdAt: "2026-06-01T00:00:00.000Z",
    changeNote: "初始版本",
    source: "initial",
};

const versionTwo = {
    id: "version-2",
    versionNumber: 2,
    kind: "image",
    title: "角色图",
    coverUrl: "/cover-v2.png",
    data: { dataUrl: "/asset-v2.png", storageKey: "image:v2", width: 100, height: 100, bytes: 1200, mimeType: "image/png" },
    createdAt: "2026-06-04T00:00:00.000Z",
    changeNote: "换图",
    source: "manual_edit",
};

const assetV1 = (): Asset => ({
    id: "asset-1",
    kind: "image",
    title: "角色图",
    coverUrl: "/cover-v1.png",
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    data: { dataUrl: "/asset-v1.png", storageKey: "image:v1", width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
    metadata: { assetVersions: [versionOne], currentAssetVersionId: "version-1" },
});

const assetV2 = (): Asset => ({
    ...assetV1(),
    updatedAt: "2026-06-04T00:00:00.000Z",
    metadata: { assetVersions: [versionOne, versionTwo], currentAssetVersionId: "version-2" },
});

test("collects outdated references for the selected project only", () => {
    const oldReference = buildAssetVersionReference(assetV1(), "2026-06-03T00:00:00.000Z");

    const usages = collectOutdatedAssetVersionUsages(
        [assetV2()],
        {
            projectTitles: { "project-1": "项目一", "project-2": "项目二" },
            canvasProjects: [
                {
                    id: "canvas-1",
                    projectId: "project-1",
                    title: "第一集",
                    createdAt: "",
                    updatedAt: "",
                    nodes: [{ id: "node-1", type: "image", title: "旧角色节点", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { sourceAssetId: "asset-1", assetVersion: oldReference } }],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: { x: 0, y: 0, k: 1 },
                },
            ],
            storyboardGroups: [{ id: "group-1", projectId: "project-2", order: 1, title: "分镜组", description: "", preset: {}, shotIds: [], createdAt: "", updatedAt: "" }],
            storyboardShots: [
                {
                    id: "shot-1",
                    groupId: "group-1",
                    order: 1,
                    title: "外项目分镜",
                    description: "",
                    prompt: "",
                    effectivePrompt: "",
                    assetRefs: [{ assetId: "asset-1", kind: "image", role: "reference_image", assetVersion: oldReference }],
                    nodeRefs: [],
                    resultAssetIds: [],
                    status: "draft",
                    createdAt: "",
                    updatedAt: "",
                },
            ],
        },
        "project-1",
    );

    assert.equal(usages.length, 1);
    assert.equal(usages[0].kind, "canvas-node");
    assert.equal(usages[0].assetId, "asset-1");
    assert.equal(usages[0].latestVersionNumber, 2);
});

test("selected outdated usage summary is stable for confirmation", () => {
    const oldReference = buildAssetVersionReference(assetV1(), "2026-06-03T00:00:00.000Z");
    const usages = collectOutdatedAssetVersionUsages(
        [assetV2()],
        {
            projectTitles: { "project-1": "项目一" },
            productionBibleItems: [
                { id: "bible-1", projectId: "project-1", kind: "character", name: "主角", description: "", tags: [], assetRefs: [{ assetId: "asset-1", role: "portrait", assetVersion: oldReference }], promptSnippets: {}, createdAt: "", updatedAt: "" },
            ],
        },
        "project-1",
    );

    const summary = selectedOutdatedUsageSummary(usages, new Set([usages[0].id]));

    assert.deepEqual(summary, [
        {
            id: "production-bible:bible-1:asset-1",
            assetId: "asset-1",
            assetTitle: "角色图",
            label: "项目一 / 主角 / 角色图",
            currentVersionNumber: 1,
            latestVersionNumber: 2,
        },
    ]);
});

test("updates canvas, storyboard, and production bible references to latest with previous version history", () => {
    const oldReference = buildAssetVersionReference(assetV1(), "2026-06-03T00:00:00.000Z");
    const asset = assetV2();
    const usage = collectOutdatedAssetVersionUsages(
        [asset],
        {
            canvasProjects: [
                {
                    id: "canvas-1",
                    projectId: "project-1",
                    title: "第一集",
                    createdAt: "",
                    updatedAt: "",
                    nodes: [{ id: "node-1", type: "image", title: "旧角色节点", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { sourceAssetId: "asset-1", assetVersion: oldReference } }],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: { x: 0, y: 0, k: 1 },
                },
            ],
            storyboardGroups: [{ id: "group-1", projectId: "project-1", order: 1, title: "分镜组", description: "", preset: {}, shotIds: [], createdAt: "", updatedAt: "" }],
            storyboardShots: [
                {
                    id: "shot-1",
                    groupId: "group-1",
                    order: 1,
                    title: "分镜",
                    description: "",
                    prompt: "",
                    effectivePrompt: "",
                    assetRefs: [{ assetId: "asset-1", kind: "image", role: "reference_image", assetVersion: oldReference }],
                    nodeRefs: [],
                    resultAssetIds: [],
                    status: "draft",
                    createdAt: "",
                    updatedAt: "",
                },
            ],
            productionBibleItems: [
                { id: "bible-1", projectId: "project-1", kind: "character", name: "主角", description: "", tags: [], assetRefs: [{ assetId: "asset-1", role: "portrait", assetVersion: oldReference }], promptSnippets: {}, createdAt: "", updatedAt: "" },
            ],
        },
        "project-1",
    );

    const canvasUsage = usagesByKind(usage, "canvas-node");
    const shotUsage = usagesByKind(usage, "storyboard-shot");
    const bibleUsage = usagesByKind(usage, "production-bible");
    const nextCanvas = updateCanvasProjectAssetReferenceToLatest(
        {
            id: "canvas-1",
            projectId: "project-1",
            title: "第一集",
            createdAt: "",
            updatedAt: "",
            nodes: [{ id: "node-1", type: "image", title: "旧角色节点", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { sourceAssetId: "asset-1", assetVersion: oldReference } }],
            connections: [],
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: { x: 0, y: 0, k: 1 },
        },
        canvasUsage,
        asset,
        "2026-06-05T00:00:00.000Z",
    );
    const nextShot = updateStoryboardShotAssetReferenceToLatest(
        {
            id: "shot-1",
            groupId: "group-1",
            order: 1,
            title: "分镜",
            description: "",
            prompt: "",
            effectivePrompt: "",
            assetRefs: [{ assetId: "asset-1", kind: "image", role: "reference_image", assetVersion: oldReference }],
            nodeRefs: [],
            resultAssetIds: [],
            status: "draft",
            createdAt: "",
            updatedAt: "",
        },
        shotUsage,
        asset,
        "2026-06-05T00:00:00.000Z",
    );
    const nextBible = updateProductionBibleAssetReferenceToLatest(
        { id: "bible-1", projectId: "project-1", kind: "character", name: "主角", description: "", tags: [], assetRefs: [{ assetId: "asset-1", role: "portrait", assetVersion: oldReference }], promptSnippets: {}, createdAt: "", updatedAt: "" },
        bibleUsage,
        asset,
        "2026-06-05T00:00:00.000Z",
    );

    assert.equal(nextCanvas.nodes[0].metadata?.assetVersion?.versionNumber, 2);
    assert.deepEqual(
        nextCanvas.nodes[0].metadata?.assetVersion?.previousVersions?.map((item) => item.versionNumber),
        [1],
    );
    assert.equal(nextShot.assetRefs[0].assetVersion?.versionNumber, 2);
    assert.deepEqual(
        nextShot.assetRefs[0].assetVersion?.previousVersions?.map((item) => item.versionNumber),
        [1],
    );
    assert.equal(nextBible.assetRefs[0].assetVersion?.versionNumber, 2);
    assert.deepEqual(
        nextBible.assetRefs[0].assetVersion?.previousVersions?.map((item) => item.versionNumber),
        [1],
    );
});

function usagesByKind<T extends string>(usages: Array<{ kind: T }>, kind: T) {
    const usage = usages.find((item) => item.kind === kind);
    assert.ok(usage);
    return usage;
}
