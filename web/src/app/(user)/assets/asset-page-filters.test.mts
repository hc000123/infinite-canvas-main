import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { buildAssetProjectContexts, filterAssetList, paginateAssetList, projectReferencedAssetIds, selectedAssetSummary, selectedAssetsFromIds, sortAssetList, storyboardGroupReferencedAssetIds } from "./asset-page-filters.ts";

const now = "2026-06-05T00:00:00.000Z";

function textAsset(id: string, title: string, folderId?: string, metadata?: Asset["metadata"]): Asset {
    return {
        id,
        kind: "text",
        title,
        coverUrl: "",
        folderId,
        tags: [],
        source: "",
        note: "",
        createdAt: now,
        updatedAt: now,
        metadata,
        data: { content: title },
    };
}

test("builds asset project contexts with creative projects before legacy canvases", () => {
    const contexts = buildAssetProjectContexts(
        [
            { id: "project-1", title: "短剧项目" },
            { id: "canvas-2", title: "" },
        ],
        [
            { id: "canvas-1", title: "旧画布一" },
            { id: "canvas-2", title: "已归入项目的画布" },
        ],
    );

    assert.deepEqual(contexts, [
        { id: "project-1", title: "短剧项目" },
        { id: "canvas-2", title: "未命名项目" },
        { id: "canvas-1", title: "旧画布一（旧画布）" },
    ]);
});

test("collects project referenced asset ids from production bible and storyboard shots", () => {
    const refs = projectReferencedAssetIds(
        "project-1",
        [{ projectId: "project-1", assetRefs: [{ assetId: "asset-a" }, { assetId: "asset-b" }] }],
        [{ id: "group-1", projectId: "project-1" }],
        [
            { groupId: "group-1", assetRefs: [{ assetId: "asset-c" }], resultAssetIds: ["asset-result"], primaryAssetId: "asset-primary" },
            { groupId: "other-group", assetRefs: [{ assetId: "asset-x" }] },
        ],
    );

    assert.deepEqual([...refs].sort(), ["asset-a", "asset-b", "asset-c", "asset-primary", "asset-result"]);
    assert.deepEqual([...projectReferencedAssetIds("", [], [], [])], []);
});

test("collects storyboard group result and reference asset ids", () => {
    const refs = storyboardGroupReferencedAssetIds("group-1", [
        { groupId: "group-1", assetRefs: [{ assetId: "ref-a" }], resultAssetIds: ["result-a"], primaryAssetId: "primary-a" },
        { groupId: "group-2", assetRefs: [{ assetId: "other" }], resultAssetIds: ["other-result"], primaryAssetId: "other-primary" },
    ]);

    assert.deepEqual([...refs].sort(), ["primary-a", "ref-a", "result-a"]);
    assert.deepEqual([...storyboardGroupReferencedAssetIds("", [])], []);
});

test("filters assets by kind, folder, project references and keyword", () => {
    const assets = [textAsset("asset-a", "角色设定", undefined, { generation: { projectId: "project-1", source: "canvas" } }), textAsset("asset-b", "场景设定", "folder-1"), textAsset("asset-c", "镜头提示", "folder-2")];
    const searchText = (asset: Asset) => `${asset.title} ${(asset.tags || []).join(" ")}`.toLowerCase();

    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "角色",
            kindFilter: "all",
            folderFilter: "all",
            generationTaskFilter: "all",
            projectContextFilter: "",
            projectLibraryFilter: "all",
            projectReferencedAssetIds: new Set(),
            searchText,
        }).map((asset) => asset.id),
        ["asset-a"],
    );
    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "",
            kindFilter: "all",
            folderFilter: "root",
            generationTaskFilter: "all",
            projectContextFilter: "",
            projectLibraryFilter: "all",
            projectReferencedAssetIds: new Set(),
            searchText,
        }).map((asset) => asset.id),
        ["asset-a"],
    );
    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "",
            kindFilter: "all",
            folderFilter: "all",
            generationTaskFilter: "all",
            projectContextFilter: "project-1",
            projectLibraryFilter: "all",
            projectReferencedAssetIds: new Set(["asset-b"]),
            searchText,
        }).map((asset) => asset.id),
        ["asset-a", "asset-b", "asset-c"],
    );
});

test("filters assets by storyboard group references and generation metadata", () => {
    const assets = [textAsset("ref-a", "分镜参考"), textAsset("generated-a", "分镜生成", undefined, { generation: { storyboardGroupId: "group-1", createdAt: "2026-01-02T00:00:00.000Z" } }), textAsset("other", "其他素材")];

    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "",
            kindFilter: "all",
            folderFilter: "all",
            generationTaskFilter: "all",
            projectContextFilter: "",
            projectLibraryFilter: "all",
            projectReferencedAssetIds: new Set(),
            storyboardGroupFilter: "group-1",
            storyboardGroupAssetIds: new Set(["ref-a"]),
            searchText: (asset) => asset.title,
        }).map((asset) => asset.id),
        ["ref-a", "generated-a"],
    );
});

test("filters project context assets by shared project library membership", () => {
    const assets = [
        textAsset("manual-shared", "手动共享", undefined, { projectLibraries: [{ projectId: "project-1", visibility: "project", role: "editor", syncStatus: "local", addedAt: now, updatedAt: now }] }),
        textAsset("generated", "项目生成", undefined, { generation: { projectId: "project-1", source: "canvas" } }),
        textAsset("other", "其他素材"),
    ];

    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "",
            kindFilter: "all",
            folderFilter: "all",
            generationTaskFilter: "all",
            projectContextFilter: "project-1",
            projectLibraryFilter: "all",
            projectReferencedAssetIds: new Set(),
            searchText: (asset) => asset.title,
        }).map((asset) => asset.id),
        ["manual-shared", "generated", "other"],
    );
    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "",
            kindFilter: "all",
            folderFilter: "all",
            generationTaskFilter: "all",
            projectContextFilter: "project-1",
            projectLibraryFilter: "shared",
            projectReferencedAssetIds: new Set(),
            searchText: (asset) => asset.title,
        }).map((asset) => asset.id),
        ["manual-shared"],
    );
    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "",
            kindFilter: "all",
            folderFilter: "all",
            generationTaskFilter: "all",
            projectContextFilter: "project-1",
            projectLibraryFilter: "not_shared",
            projectReferencedAssetIds: new Set(),
            searchText: (asset) => asset.title,
        }).map((asset) => asset.id),
        ["generated", "other"],
    );
});

test("sorts assets by update, generation time and title", () => {
    const assets = [
        { ...textAsset("b", "乙", undefined, { generation: { createdAt: "2026-01-01T00:00:00.000Z" } }), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" },
        { ...textAsset("a", "甲", undefined, { generation: { createdAt: "2026-01-04T00:00:00.000Z" } }), createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
        { ...textAsset("c", "丙"), createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ];

    assert.deepEqual(
        sortAssetList(assets, "updated_desc").map((asset) => asset.id),
        ["b", "a", "c"],
    );
    assert.deepEqual(
        sortAssetList(assets, "generation_desc").map((asset) => asset.id),
        ["a", "b", "c"],
    );
    assert.deepEqual(
        sortAssetList(assets, "title_asc").map((asset) => asset.id),
        ["c", "a", "b"],
    );
});

test("paginates and summarizes selected assets", () => {
    const assets = [textAsset("a", "素材一"), textAsset("b", "素材二"), textAsset("c", "素材三"), textAsset("d", "素材四")];
    assert.deepEqual(
        paginateAssetList(assets, 2, 2).map((asset) => asset.id),
        ["c", "d"],
    );
    assert.deepEqual(
        selectedAssetsFromIds(assets, new Set(["b", "d"])).map((asset) => asset.id),
        ["b", "d"],
    );
    assert.equal(selectedAssetSummary([]), "未选择素材");
    assert.equal(selectedAssetSummary(assets), "素材一、素材二、素材三 等 4 个");
});
