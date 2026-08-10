import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Asset, AudioAsset, ImageAsset, VideoAsset } from "../../../stores/use-asset-store.ts";
import { isCompactMediaAssetGroup } from "./asset-result-layout.ts";

const image = (id: string): ImageAsset => ({
    id,
    kind: "image",
    title: id,
    coverUrl: "",
    tags: [],
    source: "Canvas",
    note: "",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    data: { dataUrl: `blob:${id}`, width: 720, height: 1280, bytes: 1024, mimeType: "image/png" },
});

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

const audio = (id: string): AudioAsset => ({
    id,
    kind: "audio",
    title: id,
    coverUrl: "",
    tags: [],
    source: "Canvas",
    note: "",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    data: { url: `blob:${id}`, bytes: 1024, mimeType: "audio/wav" },
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

test("uses compact media grid for non-empty image video and audio groups", () => {
    assert.equal(isCompactMediaAssetGroup([image("image-a"), image("image-b")]), true);
    assert.equal(isCompactMediaAssetGroup([video("video-a"), video("video-b")]), true);
    assert.equal(isCompactMediaAssetGroup([video("video-a"), image("image-a")]), true);
    assert.equal(isCompactMediaAssetGroup([audio("audio-a"), image("image-a")]), true);
    assert.equal(isCompactMediaAssetGroup([video("video-a"), textAsset]), false);
    assert.equal(isCompactMediaAssetGroup([]), false);
});

test("keeps formal subjects in the main grid and loose media in the inbox", () => {
    const results = readFileSync(new URL("./components/asset-results-section.tsx", import.meta.url), "utf8");
    const inbox = readFileSync(new URL("./components/asset-inbox-section.tsx", import.meta.url), "utf8");
    const mediaCard = readFileSync(new URL("./components/compact-media-asset-card.tsx", import.meta.url), "utf8");

    assert.match(results, /AssetSubjectCard/);
    assert.doesNotMatch(results, /CompactMediaAssetCard|visibleGallerySubjectGroups|ProductionBibleSummaryCard/);
    assert.match(inbox, /CompactMediaAssetCard/);
    assert.match(inbox, />整理</);
    assert.match(mediaCard, /aspect-square/);
});
