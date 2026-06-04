import assert from "node:assert/strict";
import test from "node:test";

import { assetFingerprintCandidates, buildBlobFingerprint, fallbackAssetFingerprint, mergeAssetMetadata, mergeDuplicateAsset } from "./asset-dedupe.ts";
import type { Asset, AssetWriteInput } from "./use-asset-store.ts";

const imageAsset = (patch: Partial<AssetWriteInput> = {}): AssetWriteInput => ({
    kind: "image",
    title: "图片素材",
    coverUrl: "blob:image",
    tags: ["毕业"],
    source: "画布",
    data: {
        dataUrl: "blob:image",
        storageKey: "image:one",
        width: 128,
        height: 72,
        bytes: 12,
        mimeType: "image/png",
    },
    metadata: { sourceRefs: ["node-a"], generation: { prompt: "原提示词" } },
    ...patch,
});

test("builds sha256 fingerprint from Blob before storage fallback", async () => {
    const fingerprint = await buildBlobFingerprint(new Blob(["same image bytes"], { type: "image/png" }));

    assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(fingerprint, fallbackAssetFingerprint(imageAsset()));
    assert.equal(fingerprint, await buildBlobFingerprint(new Blob(["same image bytes"], { type: "image/png" })));
});

test("builds storage fallback fingerprint for image, video and audio assets", () => {
    assert.equal(fallbackAssetFingerprint(imageAsset()), "storage:image:one:12:image/png");
    assert.equal(
        fallbackAssetFingerprint({
            kind: "video",
            title: "视频素材",
            coverUrl: "",
            tags: [],
            data: { url: "blob:video", storageKey: "media:video", width: 1280, height: 720, bytes: 34, mimeType: "video/mp4" },
        }),
        "storage:media:video:34:video/mp4",
    );
    assert.equal(
        fallbackAssetFingerprint({
            kind: "audio",
            title: "音频素材",
            coverUrl: "",
            tags: [],
            data: { url: "blob:audio", storageKey: "media:audio", bytes: 56, mimeType: "audio/mpeg" },
        }),
        "storage:media:audio:56:audio/mpeg",
    );
});

test("merges duplicate asset metadata without changing original asset identity", () => {
    const existing: Asset = {
        ...imageAsset({ title: "原图", tags: ["毕业", "人物"], metadata: { sourceRefs: ["node-a"], generation: { prompt: "原提示词" }, source: "image-page" } }),
        id: "asset-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    } as Asset;
    const incoming = imageAsset({
        title: "新图",
        tags: ["人物", "操场"],
        metadata: { sourceRefs: ["node-b"], generation: { prompt: "新提示词" }, source: "canvas" },
    });

    const merged = mergeDuplicateAsset(existing, incoming, "sha256:duplicate", "2026-01-02T00:00:00.000Z");

    assert.equal(merged.id, "asset-1");
    assert.deepEqual(merged.tags, ["毕业", "人物", "操场"]);
    assert.equal(merged.updatedAt, "2026-01-02T00:00:00.000Z");
    assert.equal(merged.metadata?.fingerprint, "sha256:duplicate");
    assert.deepEqual(merged.metadata?.sourceRefs, ["node-a", "node-b", "image-page", "canvas"]);
    assert.deepEqual(merged.metadata?.generations, [{ prompt: "原提示词" }, { prompt: "新提示词" }]);
});

test("creates metadata for a newly written deduped asset", () => {
    const metadata = mergeAssetMetadata(undefined, imageAsset().metadata, "sha256:new");

    assert.equal(metadata.fingerprint, "sha256:new");
    assert.deepEqual(metadata.sourceRefs, ["node-a"]);
    assert.deepEqual(metadata.generations, [{ prompt: "原提示词" }]);
    assert.deepEqual(assetFingerprintCandidates({ ...imageAsset(), id: "asset-2", createdAt: "", updatedAt: "", metadata } as Asset), ["sha256:new", "storage:image:one:12:image/png"]);
});
