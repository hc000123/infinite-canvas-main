import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, VideoAsset } from "../../../stores/use-asset-store.ts";
import { isCompactVideoAssetGroup } from "./asset-result-layout.ts";

const video = (id: string): VideoAsset => ({
    id,
    kind: "video",
    title: id,
    coverUrl: "",
    tags: [],
    source: "Canvas",
    note: "",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    data: { url: `blob:${id}`, width: 720, height: 1280, bytes: 1024, mimeType: "video/mp4" },
});

const textAsset: Asset = {
    id: "text",
    kind: "text",
    title: "文本",
    coverUrl: "",
    tags: [],
    source: "",
    note: "",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    data: { content: "文本" },
};

test("uses compact grid only for non-empty all-video groups", () => {
    assert.equal(isCompactVideoAssetGroup([video("a"), video("b")]), true);
    assert.equal(isCompactVideoAssetGroup([video("a"), textAsset]), false);
    assert.equal(isCompactVideoAssetGroup([]), false);
});
