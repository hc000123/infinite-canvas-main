import assert from "node:assert/strict";
import test from "node:test";

import { validateAssetPackageData } from "./asset-transfer-validation.ts";

const now = "2026-06-05T00:00:00.000Z";

test("validates exported asset package data", () => {
    const data = validateAssetPackageData({
        app: "infinite-canvas",
        version: 1,
        exportedAt: now,
        assets: [
            {
                id: "asset-1",
                kind: "text",
                title: "提示词",
                coverUrl: "",
                tags: [],
                createdAt: now,
                updatedAt: now,
                data: { content: "内容" },
            },
        ],
        files: [{ storageKey: "image:1", path: "files/image.png", mimeType: "image/png", bytes: 12 }],
    });

    assert.equal(data.assets.length, 1);
    assert.equal(data.files[0].path, "files/image.png");
});

test("rejects non infinite-canvas package data", () => {
    assert.throws(() => validateAssetPackageData({ app: "other", version: 1, assets: [], files: [] }), /素材包格式不正确/);
    assert.throws(() => validateAssetPackageData({ app: "infinite-canvas", version: 1, assets: [{ kind: "pdf", title: "坏数据", data: {} }], files: [] }), /不支持的素材类型/);
    assert.throws(() => validateAssetPackageData({ app: "infinite-canvas", version: 1, assets: [], files: [{ path: "file" }] }), /文件清单不正确/);
});
