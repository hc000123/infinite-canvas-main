import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store.ts";
import { buildInsertAssetPayload } from "./asset-insert-payload.ts";

const baseAssetFields = {
    id: "asset-1",
    title: "角色素材",
    coverUrl: "",
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    metadata: {
        assetVersions: [
            {
                id: "version-1",
                versionNumber: 1,
                kind: "image",
                title: "角色素材",
                coverUrl: "/cover.png",
                data: { dataUrl: "/image.png", storageKey: "image:v1", width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
                createdAt: "2026-06-01T00:00:00.000Z",
                source: "initial",
            },
        ],
        currentAssetVersionId: "version-1",
    },
} satisfies Partial<Asset>;

test("builds inserted image payload with fixed asset version metadata", () => {
    const payload = buildInsertAssetPayload({
        ...baseAssetFields,
        kind: "image",
        data: { dataUrl: "/image.png", storageKey: "image:v1", width: 100, height: 100, bytes: 1000, mimeType: "image/png" },
    } as Asset);

    assert.equal(payload.kind, "image");
    assert.equal(payload.sourceAssetId, "asset-1");
    assert.equal(payload.assetVersion?.assetVersionId, "version-1");
    assert.equal(payload.assetVersion?.mode, "fixed-version");
});

test("builds inserted text, video and audio payloads from local assets", () => {
    const text = buildInsertAssetPayload({ ...baseAssetFields, kind: "text", data: { content: "人物小传" } } as Asset);
    const video = buildInsertAssetPayload({ ...baseAssetFields, kind: "video", data: { url: "/video.mp4", storageKey: "video:v1", width: 1280, height: 720, bytes: 2000, mimeType: "video/mp4" } } as Asset);
    const audio = buildInsertAssetPayload({ ...baseAssetFields, kind: "audio", data: { url: "/audio.mp3", storageKey: "audio:v1", bytes: 3000, mimeType: "audio/mpeg" } } as Asset);

    assert.deepEqual([text.kind, text.sourceAssetId, text.assetVersion?.assetId], ["text", "asset-1", "asset-1"]);
    assert.deepEqual([video.kind, video.sourceAssetId, video.assetVersion?.assetVersionId], ["video", "asset-1", "version-1"]);
    assert.deepEqual([audio.kind, audio.sourceAssetId, audio.assetVersion?.assetVersionId], ["audio", "asset-1", "version-1"]);
});
