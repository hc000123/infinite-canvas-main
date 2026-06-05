import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { assetImportSuccessMessage, importedImageAssetInput, importedMediaAssetInput, importedPackageAssetInput } from "./asset-import-payloads.ts";

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
    assert.equal(assetImportSuccessMessage(3, "项目素材"), "已导入 3 个素材到「项目素材」");
});
