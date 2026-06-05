import assert from "node:assert/strict";
import test from "node:test";

import { buildVideoGenerationPlan, shouldCreateVideoVariant } from "./canvas-video-generation-plan.ts";

const baseConfig = {
    videoTaskMode: "generate",
    videoProtocol: "volcengine-ark",
    videoReferenceImageMode: "reference",
} as const;

const sourceVideoNode = {
    id: "video-source",
    type: "video",
    title: "源视频",
    position: { x: 0, y: 0 },
    width: 420,
    height: 236,
    metadata: { content: "blob:local-video", videoUrl: "https://ark.example.com/video.mp4" },
};

const storedImage = { id: "stored-image", name: "stored.png", type: "image/png", dataUrl: "image:stored" };
const contextImage = { id: "context-image", name: "context.png", type: "image/png", dataUrl: "image:context" };
const contextVideo = { id: "video-context", name: "context.mp4", type: "video/mp4", url: "https://ark.example.com/context.mp4" };

test("plans completed video regeneration as a variant using stored references", () => {
    const plan = buildVideoGenerationPlan({
        config: baseConfig,
        sourceNode: sourceVideoNode,
        sourceReferences: { images: [], videos: [{ id: "source-video-ref", name: "source.mp4", type: "video/mp4", url: "https://ark.example.com/source.mp4" }], audios: [] },
        contextReferences: { images: [contextImage], videos: [], audios: [] },
        storedVariantReferences: { images: [storedImage], videos: [], audios: [] },
    });

    assert.equal(shouldCreateVideoVariant(baseConfig, sourceVideoNode), true);
    assert.equal(plan.isVariant, true);
    assert.deepEqual(
        plan.references.images.map((image) => image.id),
        ["stored-image"],
    );
    assert.deepEqual(plan.references.videos, []);
    assert.equal(plan.relation?.actionType, "variant");
    assert.equal(plan.relation?.sourceVideoNodeId, "video-source");
});

test("requires a source video for Ark edit and extend tasks", () => {
    const plan = buildVideoGenerationPlan({
        config: { ...baseConfig, videoTaskMode: "edit" },
        sourceNode: { ...sourceVideoNode, type: "config", metadata: {} },
        sourceReferences: { images: [], videos: [], audios: [] },
        contextReferences: { images: [contextImage], videos: [], audios: [] },
    });

    assert.equal(plan.isVariant, false);
    assert.equal(plan.sourceVideoRequiredError, "请先连接一个上游视频节点作为源视频");
});

test("reports pending image review before sending Ark video generation", () => {
    const plan = buildVideoGenerationPlan({
        config: baseConfig,
        sourceNode: { ...sourceVideoNode, type: "config", metadata: {} },
        sourceReferences: {
            images: [{ id: "image-pending", name: "角色.png", type: "image/png", dataUrl: "blob:image", volcengineAssetId: "asset-pending", volcengineAssetStatus: "Processing" }],
            videos: [],
            audios: [],
        },
        contextReferences: { images: [], videos: [], audios: [] },
    });

    assert.match(plan.imageReviewRequiredError, /角色\.png/);
    assert.match(plan.imageReviewRequiredError, /Processing/);
});

test("reports pending video review before sending Ark video generation", () => {
    const plan = buildVideoGenerationPlan({
        config: baseConfig,
        sourceNode: { ...sourceVideoNode, type: "config", metadata: {} },
        sourceReferences: {
            images: [],
            videos: [{ id: "video-pending", name: "人物参考.mp4", type: "video/mp4", url: "blob:video", volcengineAssetId: "asset-pending", volcengineAssetStatus: "Processing" }],
            audios: [],
        },
        contextReferences: { images: [], videos: [], audios: [] },
    });

    assert.match(plan.imageReviewRequiredError, /人物参考\.mp4/);
    assert.match(plan.imageReviewRequiredError, /Processing/);
});

test("plans Ark edit tasks with an upstream context video as source", () => {
    const plan = buildVideoGenerationPlan({
        config: { ...baseConfig, videoTaskMode: "edit" },
        sourceNode: { ...sourceVideoNode, type: "config", metadata: {} },
        sourceReferences: { images: [], videos: [], audios: [] },
        contextReferences: { images: [], videos: [contextVideo], audios: [], inputs: [{ type: "video", nodeId: "video-context", video: contextVideo }] },
    });

    assert.equal(plan.sourceVideoRequiredError, "");
    assert.deepEqual(
        plan.references.videos.map((video) => video.id),
        ["video-context"],
    );
    assert.equal(plan.relation?.actionType, "edit");
    assert.equal(plan.relation?.sourceVideoNodeId, "video-context");
});
