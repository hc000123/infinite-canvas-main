import assert from "node:assert/strict";
import test from "node:test";

import type { VideoAsset } from "../../../stores/use-asset-store.ts";
import { normalizeCanvasAssetTitles } from "./asset-canvas-title.ts";

const legacyAsset = (id: string, nodeId: string): VideoAsset => ({
    id,
    kind: "video",
    title: "【全局硬约束】禁止配乐，禁止字幕",
    coverUrl: "",
    tags: [],
    source: "Canvas",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    data: { url: `blob:${id}`, width: 720, height: 1280, bytes: 1024, mimeType: "video/mp4" },
    metadata: { source: "canvas", generation: { source: "canvas", nodeId } },
});

test("restores legacy canvas asset titles from their linked node and media version", () => {
    const linked = legacyAsset("asset-1", "node-1");
    const unlinked = legacyAsset("asset-2", "missing-node");
    const projects = [
        {
            id: "canvas-1",
            title: "毕业/典礼画布",
            nodes: [
                {
                    id: "node-1",
                    type: "video" as const,
                    title: "生成视频",
                    position: { x: 0, y: 0 },
                    width: 420,
                    height: 236,
                    metadata: {
                        assetNodeNumber: 7,
                        sourceAssetId: "asset-1",
                        currentMediaVersionId: "version-3",
                        mediaVersions: [{ id: "version-3", versionNumber: 3, kind: "video" as const, createdAt: "2026-07-24T00:00:00.000Z", prompt: "第三版", width: 720, height: 1280, metadata: { sourceAssetId: "asset-1" } }],
                    },
                },
            ],
        },
    ];

    const result = normalizeCanvasAssetTitles([linked, unlinked], projects);

    assert.equal(result[0].title, "毕业-典礼画布-节点007-v3");
    assert.equal(result[1], unlinked);
});
