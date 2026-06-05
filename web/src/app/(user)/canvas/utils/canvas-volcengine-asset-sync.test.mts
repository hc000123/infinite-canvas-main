import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";
import type { CanvasNodeData } from "../types.ts";
import { syncCanvasVolcengineAssetsFromLibrary } from "./canvas-volcengine-asset-sync.ts";

test("syncs active Volcengine review metadata from matching asset to canvas image node", () => {
    const nodes = [
        imageNode("image-node", {
            sourceAssetId: "asset-1",
            storageKey: "image:one",
        }),
    ];
    const { nodes: synced, changed } = syncCanvasVolcengineAssetsFromLibrary(nodes, [
        imageAsset("asset-1", "image:one", {
            assetId: "volc-asset-1",
            status: "Active",
            updatedAt: "2026-06-04T08:00:00Z",
        }),
    ]);

    assert.equal(changed, true);
    assert.equal(synced[0].metadata?.volcengineAsset?.assetId, "volc-asset-1");
    assert.equal(synced[0].metadata?.volcengineAsset?.status, "Active");
});

test("syncs active Volcengine review metadata from matching asset to canvas video node", () => {
    const nodes = [
        videoNode("video-node", {
            sourceAssetId: "asset-video",
            storageKey: "video:one",
        }),
    ];
    const { nodes: synced, changed } = syncCanvasVolcengineAssetsFromLibrary(nodes, [
        videoAsset("asset-video", "video:one", {
            assetId: "volc-video-1",
            status: "Active",
            updatedAt: "2026-06-04T08:00:00Z",
        }),
    ]);

    assert.equal(changed, true);
    assert.equal(synced[0].metadata?.volcengineAsset?.assetId, "volc-video-1");
    assert.equal(synced[0].metadata?.volcengineAsset?.status, "Active");
});

test("does not downgrade an active canvas review with older processing asset metadata", () => {
    const nodes = [
        imageNode("image-node", {
            storageKey: "image:one",
            volcengineAsset: review("volc-asset-1", "Active", "2026-06-04T08:10:00Z"),
        }),
    ];
    const { nodes: synced, changed } = syncCanvasVolcengineAssetsFromLibrary(nodes, [imageAsset("asset-1", "image:one", { assetId: "volc-asset-1", status: "Processing", updatedAt: "2026-06-04T08:20:00Z" })]);

    assert.equal(changed, false);
    assert.equal(synced, nodes);
    assert.equal(synced[0].metadata?.volcengineAsset?.status, "Active");
});

function imageNode(id: string, metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return {
        id,
        type: "image" as CanvasNodeData["type"],
        title: id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
        metadata: { content: "blob:image", mimeType: "image/png", ...metadata },
    };
}

function videoNode(id: string, metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return {
        id,
        type: "video" as CanvasNodeData["type"],
        title: id,
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata: { content: "blob:video", mimeType: "video/mp4", ...metadata },
    };
}

function imageAsset(id: string, storageKey: string, metadata: Partial<NonNullable<Asset["metadata"]>["volcengineAsset"]>): Asset {
    return {
        id,
        kind: "image",
        title: id,
        coverUrl: "blob:image",
        tags: [],
        source: "test",
        data: { dataUrl: "", storageKey, width: 100, height: 100, bytes: 10, mimeType: "image/png" },
        metadata: { volcengineAsset: review(metadata.assetId || "volc-asset", metadata.status || "Processing", metadata.updatedAt || "2026-06-04T08:00:00Z") },
        createdAt: "2026-06-04T08:00:00Z",
        updatedAt: "2026-06-04T08:00:00Z",
    };
}

function videoAsset(id: string, storageKey: string, metadata: Partial<NonNullable<Asset["metadata"]>["volcengineAsset"]>): Asset {
    return {
        id,
        kind: "video",
        title: id,
        coverUrl: "",
        tags: [],
        source: "test",
        data: { url: "blob:video", storageKey, width: 320, height: 180, bytes: 10, mimeType: "video/mp4" },
        metadata: { volcengineAsset: review(metadata.assetId || "volc-video", metadata.status || "Processing", metadata.updatedAt || "2026-06-04T08:00:00Z") },
        createdAt: "2026-06-04T08:00:00Z",
        updatedAt: "2026-06-04T08:00:00Z",
    };
}

function review(assetId: string, status: string, updatedAt: string) {
    return {
        assetId,
        groupId: "group-1",
        projectName: "default",
        status,
        error: "",
        publicUrl: "https://example.com/image.png",
        submittedAt: "2026-06-04T08:00:00Z",
        updatedAt,
    };
}
