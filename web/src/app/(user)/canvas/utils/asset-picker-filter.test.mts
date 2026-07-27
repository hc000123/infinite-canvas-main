import assert from "node:assert/strict";
import test from "node:test";

import { filterAssetsForPicker } from "./asset-picker-filter.ts";

const asset = (id: string, patch: Record<string, unknown> = {}) => ({ id, kind: "image", title: id, coverUrl: "", tags: [], createdAt: id, updatedAt: id, data: { dataUrl: "", width: 1, height: 1, bytes: 1, mimeType: "image/png" }, ...patch }) as any;
const base = {
    allowedKinds: new Set(["image"]),
    category: "all",
    episodeId: "ep-1",
    favoriteOnly: false,
    folder: "all",
    folderProjectIdByFolderId: new Map([["project-folder", "project-1"]]),
    keyword: "",
    projectId: "project-1",
    scope: "all",
    sort: "updated_desc",
    subjectNameById: new Map([["subject-1", "楚和笙"]]),
} as any;

test("filters current project and episode through bindings and project folders", () => {
    const items = [
        asset("bound", { assetBinding: { projectId: "project-1", subjectId: "subject-1", category: "character", variantName: "重伤", allEpisodes: false, episodeIds: ["ep-1"] } }),
        asset("shared", { assetBinding: { projectId: "project-1", subjectId: "subject-1", category: "character", variantName: "基础", allEpisodes: true, episodeIds: [] } }),
        asset("folder", { folderId: "project-folder" }),
        asset("other", { assetBinding: { projectId: "project-2", subjectId: "subject-2", category: "scene", variantName: "夜景", allEpisodes: true, episodeIds: [] } }),
    ];
    assert.deepEqual(
        filterAssetsForPicker(items, { ...base, scope: "project" })
            .map((item) => item.id)
            .sort(),
        ["bound", "folder", "shared"],
    );
    assert.deepEqual(
        filterAssetsForPicker(items, { ...base, scope: "episode" })
            .map((item) => item.id)
            .sort(),
        ["bound", "shared"],
    );
});

test("combines unclassified, favorite, keyword and natural title sorting", () => {
    const items = [
        asset("图片10", { favorite: true, note: "蓝色大厅" }),
        asset("图片2", { favorite: true, note: "蓝色大厅" }),
        asset("classified", { favorite: true, assetBinding: { projectId: "project-1", subjectId: "subject-1", category: "character", variantName: "重伤", allEpisodes: true, episodeIds: [] } }),
    ];
    assert.deepEqual(
        filterAssetsForPicker(items, { ...base, category: "unclassified", favoriteOnly: true, keyword: "蓝色", sort: "title_asc" }).map((item) => item.id),
        ["图片2", "图片10"],
    );
    assert.deepEqual(
        filterAssetsForPicker(items, { ...base, keyword: "楚和笙 重伤" }).map((item) => item.id),
        ["classified"],
    );
});
