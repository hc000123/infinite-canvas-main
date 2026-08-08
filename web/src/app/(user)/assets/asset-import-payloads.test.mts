import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { partitionPackageAssets } from "./asset-import-actions.ts";
import { assetImportSuccessMessage, importedImageAssetInput, importedMediaAssetInput, importedPackageAssetInput, uniqueImportedAssetIds } from "./asset-import-payloads.ts";

const now = "2026-06-05T00:00:00.000Z";

test("builds imported image asset input from uploaded image metadata", () => {
    const asset = importedImageAssetInput(
        "角色参考.png",
        {
            url: "blob:image",
            storageKey: "image:1",
            width: 1024,
            height: 768,
            bytes: 2048,
            mimeType: "image/png",
        },
        "folder-1",
    );

    assert.deepEqual(asset, {
        kind: "image",
        title: "角色参考",
        coverUrl: "blob:image",
        folderId: "folder-1",
        tags: [],
        source: "本地导入",
        note: "",
        metadata: { source: "import" },
        data: {
            dataUrl: "blob:image",
            storageKey: "image:1",
            width: 1024,
            height: 768,
            bytes: 2048,
            mimeType: "image/png",
        },
    });
});

test("builds imported video and audio asset inputs", () => {
    const video = importedMediaAssetInput("分镜视频.mp4", "video", {
        url: "blob:video",
        storageKey: "video:1",
        width: 0,
        height: 0,
        bytes: 4096,
        mimeType: "video/mp4",
    });
    const audio = importedMediaAssetInput("环境音.wav", "audio", {
        url: "blob:audio",
        storageKey: "audio:1",
        bytes: 1024,
        mimeType: "audio/wav",
    });

    assert.deepEqual(video, {
        kind: "video",
        title: "分镜视频",
        coverUrl: "",
        folderId: undefined,
        tags: [],
        source: "本地导入",
        note: "",
        metadata: { source: "import" },
        data: { url: "blob:video", storageKey: "video:1", width: 1280, height: 720, bytes: 4096, mimeType: "video/mp4" },
    });
    assert.deepEqual(audio, {
        kind: "audio",
        title: "环境音",
        coverUrl: "",
        folderId: undefined,
        tags: [],
        source: "本地导入",
        note: "",
        metadata: { source: "import" },
        data: { url: "blob:audio", storageKey: "audio:1", bytes: 1024, mimeType: "audio/wav" },
    });
});

test("binds imported assets to the selected project", () => {
    const asset = importedImageAssetInput("角色参考.png", { url: "blob:image", storageKey: "image:1", width: 1024, height: 768, bytes: 2048, mimeType: "image/png" }, undefined, "project-1");
    const entries = asset.metadata?.projectLibraries as Array<Record<string, unknown>>;

    assert.equal(entries.length, 1);
    assert.equal(entries[0].projectId, "project-1");
    assert.equal(entries[0].role, "owner");
    assert.equal(entries[0].syncStatus, "local");
});

test("strips package asset identity and applies import folder", () => {
    const packaged: Asset = {
        id: "asset-1",
        kind: "text",
        title: "旧素材",
        coverUrl: "",
        folderId: "old-folder",
        tags: ["tag"],
        source: "导出包",
        note: "",
        createdAt: now,
        updatedAt: now,
        data: { content: "内容" },
    };

    assert.deepEqual(importedPackageAssetInput(packaged, "folder-2"), {
        kind: "text",
        title: "旧素材",
        coverUrl: "",
        folderId: "folder-2",
        tags: ["tag"],
        source: "导出包",
        note: "",
        data: { content: "内容" },
    });
    assert.equal(assetImportSuccessMessage(3, "项目资产"), "已导入 3 个资产到「项目资产」");
});

test("counts a deduplicated import result once", () => {
    assert.deepEqual(uniqueImportedAssetIds(["asset-1", "asset-1", "asset-2"]), ["asset-1", "asset-2"]);
});

test("keeps package media and reports skipped text assets", () => {
    const text = { id: "text-id", kind: "text", title: "文本", coverUrl: "", tags: [], createdAt: now, updatedAt: now, data: { content: "内容" } } as Asset;
    const image = { id: "image-id", kind: "image", title: "图片", coverUrl: "blob:image", tags: [], createdAt: now, updatedAt: now, data: { dataUrl: "blob:image", width: 1, height: 1, bytes: 1, mimeType: "image/png" } } as Asset;
    const partition = partitionPackageAssets([text, image]);
    assert.deepEqual(partition.mediaAssets.map((asset) => asset.id), ["image-id"]);
    assert.equal(partition.skippedTextCount, 1);
});
