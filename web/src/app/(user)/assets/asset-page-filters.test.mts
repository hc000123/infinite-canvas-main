import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { buildAssetProjectContexts, DEFAULT_ASSET_SORT_MODE, filterAssetList, projectReferencedAssetIds, selectedAssetSummary, selectedAssetsFromIds, sortAssetList, storyboardGroupReferencedAssetIds, supportedAssetList } from "./asset-page-filters.ts";

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

test("keeps text records in storage but excludes them from the asset page", () => {
    const image = { ...textAsset("image", "图片"), kind: "image", data: { dataUrl: "blob:image", width: 1, height: 1, bytes: 1, mimeType: "image/png" } } as Asset;
    const video = { ...textAsset("video", "视频"), kind: "video", data: { url: "blob:video", width: 1, height: 1, bytes: 1, mimeType: "video/mp4" } } as Asset;
    const audio = { ...textAsset("audio", "音频"), kind: "audio", data: { url: "blob:audio", bytes: 1, mimeType: "audio/wav" } } as Asset;
    assert.deepEqual(supportedAssetList([textAsset("text", "文本"), image, video, audio]).map((asset) => asset.kind), ["image", "video", "audio"]);
});

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

test("collects project referenced asset ids from production bible, storyboard, table shots, and shot groups", () => {
    const refs = projectReferencedAssetIds(
        "project-1",
        [{ projectId: "project-1", assetRefs: [{ assetId: "asset-a" }, { assetId: "asset-b" }] }],
        [{ id: "group-1", projectId: "project-1" }],
        [
            { groupId: "group-1", assetRefs: [{ assetId: "asset-c" }], resultAssetIds: ["asset-result"], primaryAssetId: "asset-primary" },
            { groupId: "other-group", assetRefs: [{ assetId: "asset-x" }] },
        ],
        [
            { projectId: "project-1", assetRefs: [{ assetId: "asset-table" }] },
            { projectId: "project-2", assetRefs: [{ assetId: "asset-table-other" }] },
        ],
        [
            { projectId: "project-1", assetRefs: [{ assetId: "asset-group" }], audioRefs: [{ assetId: "asset-audio" }], resultAssetIds: ["asset-group-result"], primaryAssetId: "asset-group-primary" },
            { projectId: "project-2", assetRefs: [{ assetId: "asset-group-other" }] },
        ],
    );

    assert.deepEqual([...refs].sort(), ["asset-a", "asset-audio", "asset-b", "asset-c", "asset-group", "asset-group-primary", "asset-group-result", "asset-primary", "asset-result", "asset-table"]);
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
            projectAssetIds: new Set(["asset-a", "asset-b"]),
            projectLibraryFilter: "all",
            projectReferencedAssetIds: new Set(["asset-b"]),
            searchText,
        }).map((asset) => asset.id),
        ["asset-a", "asset-b"],
    );
});

test("filters favorite assets and composes with kind", () => {
    const favoriteText = { ...textAsset("favorite-text", "收藏文本"), favorite: true } as Asset;
    const normalText = textAsset("normal-text", "普通文本");
    const favoriteVideo = {
        ...textAsset("favorite-video", "收藏视频"),
        kind: "video" as const,
        favorite: true,
        data: { url: "blob:favorite-video", width: 720, height: 1280, bytes: 1, mimeType: "video/mp4" },
    } as Asset;
    const baseFilters = {
        keyword: "",
        folderFilter: "all" as const,
        generationTaskFilter: "all" as const,
        projectContextFilter: "",
        projectLibraryFilter: "all" as const,
        projectReferencedAssetIds: new Set<string>(),
        favoriteOnly: true,
        searchText: (asset: Asset) => asset.title,
    };

    assert.deepEqual(
        filterAssetList([favoriteText, normalText, favoriteVideo], { ...baseFilters, kindFilter: "all" }).map((asset) => asset.id),
        ["favorite-text", "favorite-video"],
    );
    assert.deepEqual(
        filterAssetList([favoriteText, normalText, favoriteVideo], { ...baseFilters, kindFilter: "video" }).map((asset) => asset.id),
        ["favorite-video"],
    );
});

test("filters favorite videos by canvas lineage", () => {
    const video = (id: string, favorite: boolean, metadata: Asset["metadata"]): Asset =>
        ({
            ...textAsset(id, id, undefined, metadata),
            kind: "video",
            favorite,
            data: { url: `blob:${id}`, width: 720, height: 1280, bytes: 1, mimeType: "video/mp4" },
        }) as Asset;
    const assets = [
        video("matching", true, { generation: { source: "canvas", canvasId: "canvas-1" } }),
        video("not-favorite", false, { generation: { source: "canvas", canvasId: "canvas-1" } }),
        video("other-canvas", true, { generation: { source: "canvas", canvasId: "canvas-2" } }),
        textAsset("matching-text", "matching-text", undefined, { generation: { source: "canvas", canvasId: "canvas-1" } }),
    ];

    assert.deepEqual(
        filterAssetList(assets, {
            keyword: "",
            kindFilter: "video",
            favoriteOnly: true,
            folderFilter: "all",
            generationTaskFilter: "all",
            projectContextFilter: "",
            projectLibraryFilter: "all",
            canvasLibraryFilter: "canvas-1",
            projectReferencedAssetIds: new Set(),
            searchText: (asset) => asset.title,
        }).map((asset) => asset.id),
        ["matching"],
    );
});

test("composes project membership with workflow and child canvas source scopes", () => {
    const workflow = textAsset("workflow", "工作流", undefined, { originalWorkflow: { sourceProjectId: "project-1" } });
    const canvasA = textAsset("canvas-a", "画布 A", undefined, { generation: { source: "canvas", canvasId: "canvas-a" } });
    const canvasB = textAsset("canvas-b", "画布 B", undefined, { generation: { source: "canvas", canvasId: "canvas-b" } });
    const unrelated = textAsset("unrelated", "其他");
    const baseFilters = {
        keyword: "",
        kindFilter: "all" as const,
        folderFilter: "all" as const,
        generationTaskFilter: "all" as const,
        projectContextFilter: "project-1",
        projectLibraryFilter: "all" as const,
        projectReferencedAssetIds: new Set<string>(),
        projectAssetIds: new Set(["workflow", "canvas-a", "canvas-b"]),
        projectCanvasIds: new Set(["canvas-a", "canvas-b"]),
        searchText: (asset: Asset) => asset.title,
    };

    assert.deepEqual(filterAssetList([workflow, canvasA, canvasB, unrelated], { ...baseFilters, sourceScope: "workflow" }).map((asset) => asset.id), ["workflow"]);
    assert.deepEqual(filterAssetList([workflow, canvasA, canvasB, unrelated], { ...baseFilters, sourceScope: "canvas", canvasLibraryFilter: "canvas-a" }).map((asset) => asset.id), ["canvas-a"]);
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

test("uses natural title order as the asset page default", () => {
    const assets = [textAsset("node-10", "节点 10 · 成片"), textAsset("node-2", "节点 2 · 成片"), textAsset("node-1", "节点 1 · 成片")];

    assert.equal(DEFAULT_ASSET_SORT_MODE, "title_asc");
    assert.deepEqual(
        sortAssetList(assets, DEFAULT_ASSET_SORT_MODE).map((asset) => asset.id),
        ["node-1", "node-2", "node-10"],
    );
});

test("summarizes selected assets", () => {
    const assets = [textAsset("a", "素材一"), textAsset("b", "素材二"), textAsset("c", "素材三"), textAsset("d", "素材四")];
    assert.deepEqual(
        selectedAssetsFromIds(assets, new Set(["b", "d"])).map((asset) => asset.id),
        ["b", "d"],
    );
    assert.equal(selectedAssetSummary([]), "未选择素材");
    assert.equal(selectedAssetSummary(assets), "素材一、素材二、素材三 等 4 个");
});
