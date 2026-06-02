import assert from "node:assert/strict";
import test from "node:test";

import { buildRetryImageGenerationMetadata, buildVideoGenerationMetadata, buildVideoReferenceInput, directVideoReferenceInputs, resolveVideoGenerationRelation, storedReferenceImageRole, videoTaskMetadata } from "./canvas-generation-metadata.ts";

const baseConfig = {
    channelMode: "local",
    videoProtocol: "volcengine-ark",
    baseUrl: "https://api.example.com",
    apiKey: "openai-key",
    volcengineBaseUrl: "https://ark.example.com/api/v3",
    volcengineApiKey: "ark-key",
    model: "ep-seedance",
    imageModel: "image-model",
    videoModel: "video-model",
    seedanceModel: "seedance-model",
    seedanceEndpointId: "ep-seedance",
    textModel: "text-model",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoSeed: "42",
    returnLastFrame: "true",
    videoTaskMode: "generate",
    videoEditType: "replace",
    videoExtendDirection: "forward",
    videoReferenceImageMode: "reference",
    systemPrompt: "",
    models: [],
    quality: "auto",
    size: "16:9",
    count: "1",
} as const;

const imageOne = { id: "image-1", name: "one.png", type: "image/png", dataUrl: "data:image/png;base64,one", storageKey: "image:one" };
const imageTwo = { id: "image-2", name: "two.png", type: "image/png", dataUrl: "asset://asset-two", assetUri: "asset://asset-two" };
const videoOne = { id: "video-1", name: "one.mp4", type: "video/mp4", url: "blob:video-one", storageKey: "video:one" };
const audioOne = { id: "audio-1", name: "one.mp3", type: "audio/mpeg", url: "https://example.com/audio.mp3" };

test("builds video reference inputs with normal reference image roles and configured order by default", () => {
    const references = buildVideoReferenceInput(
        [imageOne, imageTwo],
        [videoOne],
        [audioOne],
        [
            { type: "video", nodeId: "node-video", video: videoOne },
            { type: "image", nodeId: "node-image-2", image: imageTwo },
            { type: "audio", nodeId: "node-audio", audio: audioOne },
            { type: "image", nodeId: "node-image-1", image: imageOne },
        ],
    );

    assert.equal(references.images[0].seedanceRole, "reference_image");
    assert.equal(references.images[1].seedanceRole, "reference_image");
    assert.deepEqual(
        references.inputs.map((input) => [input.type, input.nodeId]),
        [
            ["video", "node-video"],
            ["image", "node-image-2"],
            ["audio", "node-audio"],
            ["image", "node-image-1"],
        ],
    );
});

test("builds video reference inputs with selected first and last frame mode", () => {
    const references = buildVideoReferenceInput([imageOne, imageTwo], [], [], undefined, "first_last_frame");

    assert.deepEqual(
        references.images.map((image) => image.seedanceRole),
        ["first_frame", "last_frame"],
    );
});

test("builds video generation metadata with stored references and reference order indexes", () => {
    const references = buildVideoReferenceInput([imageOne, imageTwo], [videoOne], [audioOne], directVideoReferenceInputs([imageOne, imageTwo], [videoOne], [audioOne]));
    const metadata = buildVideoGenerationMetadata(baseConfig, references);

    assert.deepEqual(metadata.references, ["image:one", "asset://asset-two"]);
    assert.deepEqual(metadata.videoReferences, ["video:one"]);
    assert.deepEqual(metadata.audioReferences, ["https://example.com/audio.mp3"]);
    assert.equal(metadata.returnLastFrame, "true");
    assert.deepEqual(metadata.referenceRoles, [
        { nodeId: "image-1", kind: "image", role: "reference_image", index: 1 },
        { nodeId: "image-2", kind: "image", role: "reference_image", index: 2 },
    ]);
    assert.deepEqual(metadata.referenceOrder, [
        { nodeId: "image-1", kind: "image", index: 1 },
        { nodeId: "image-2", kind: "image", index: 2 },
        { nodeId: "video-1", kind: "video", index: 1 },
        { nodeId: "audio-1", kind: "audio", index: 1 },
    ]);
    assert.equal(metadata.actionType, "generate");
    assert.equal(metadata.videoActionType, "generate");
    assert.equal(metadata.videoTaskMode, "generate");
});

test("marks regenerated video output as a variant of the source video", () => {
    const references = buildVideoReferenceInput([imageOne], [videoOne], []);
    const metadata = buildVideoGenerationMetadata(baseConfig, references, { actionType: "variant", sourceVideoNodeId: "video-source" });

    assert.equal(metadata.actionType, "variant");
    assert.equal(metadata.videoActionType, "variant");
    assert.equal(metadata.sourceVideoNodeId, "video-source");
    assert.equal(metadata.variantOfNodeId, "video-source");
    assert.equal(metadata.continuationOfNodeId, undefined);
});

test("marks explicit continuation metadata separately from variants", () => {
    const references = buildVideoReferenceInput([imageOne], [videoOne], []);
    const metadata = buildVideoGenerationMetadata(baseConfig, references, { actionType: "continue", sourceVideoNodeId: "video-source" });

    assert.equal(metadata.actionType, "continue");
    assert.equal(metadata.videoActionType, "continue");
    assert.equal(metadata.relationType, "continuation");
    assert.equal(metadata.sourceVideoNodeId, "video-source");
    assert.equal(metadata.continuationOfNodeId, "video-source");
    assert.equal(metadata.variantOfNodeId, undefined);
});

test("marks Seedance video edit metadata as a derived node", () => {
    const references = buildVideoReferenceInput([], [videoOne], []);
    const metadata = buildVideoGenerationMetadata({ ...baseConfig, videoTaskMode: "edit", videoEditType: "inpaint" }, references, { actionType: "edit", sourceVideoNodeId: "video-source" });

    assert.equal(metadata.actionType, "edit");
    assert.equal(metadata.videoActionType, "edit");
    assert.equal(metadata.relationType, "derivative");
    assert.equal(metadata.sourceVideoNodeId, "video-source");
    assert.equal(metadata.videoTaskMode, "edit");
    assert.equal(metadata.videoEditType, "inpaint");
});

test("marks Seedance video extend metadata as a derived node", () => {
    const references = buildVideoReferenceInput([], [videoOne], []);
    const metadata = buildVideoGenerationMetadata({ ...baseConfig, videoTaskMode: "extend", videoExtendDirection: "backward" }, references, { actionType: "extend", sourceVideoNodeId: "video-source" });

    assert.equal(metadata.actionType, "extend");
    assert.equal(metadata.videoActionType, "extend");
    assert.equal(metadata.relationType, "derivative");
    assert.equal(metadata.sourceVideoNodeId, "video-source");
    assert.equal(metadata.videoTaskMode, "extend");
    assert.equal(metadata.videoExtendDirection, "backward");
});

test("resolves video relation from task mode and upstream source video", () => {
    const sourceVideoNode = { id: "video-source", type: "video", title: "源视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { content: "video-url" } };
    const configNode = { id: "config", type: "config", title: "配置", position: { x: 0, y: 0 }, width: 260, height: 180, metadata: { generationMode: "video" } };
    const references = buildVideoReferenceInput([], [videoOne], [], [{ type: "video", nodeId: "video-source", video: videoOne }]);

    assert.deepEqual(resolveVideoGenerationRelation({ videoProtocol: "volcengine-ark", videoTaskMode: "generate" }, sourceVideoNode, references), { actionType: "variant", sourceVideoNodeId: "video-source" });
    assert.deepEqual(resolveVideoGenerationRelation({ videoProtocol: "volcengine-ark", videoTaskMode: "edit" }, configNode, references), { actionType: "edit", sourceVideoNodeId: "video-source" });
    assert.deepEqual(resolveVideoGenerationRelation({ videoProtocol: "volcengine-ark", videoTaskMode: "extend" }, configNode, references), { actionType: "extend", sourceVideoNodeId: "video-source" });
});

test("builds retry image metadata from saved metadata without losing stored references", () => {
    const metadata = buildRetryImageGenerationMetadata({ generationType: "edit", count: 3, references: ["image:one"] }, { ...baseConfig, model: "retry-model", quality: "high", size: "9:16" }, true, []);

    assert.deepEqual(metadata, {
        generationType: "edit",
        model: "retry-model",
        size: "9:16",
        quality: "high",
        count: 3,
        references: ["image:one"],
    });
});

test("maps video task response details to node metadata strings", () => {
    const metadata = videoTaskMetadata({
        id: "task-1",
        status: "succeeded",
        rawStatus: "completed",
        videoUrl: "https://example.com/video.mp4",
        lastFrameUrl: "https://example.com/frame.png",
        seed: 42,
        resolution: "720p",
        ratio: "16:9",
        duration: 6,
        generateAudio: true,
        watermark: false,
    });

    assert.equal(metadata.taskId, "task-1");
    assert.equal(metadata.seed, "42");
    assert.equal(metadata.duration, "6");
    assert.equal(metadata.generateAudio, "true");
    assert.equal(metadata.watermark, "false");
});

test("restores stored image reference role by stored index", () => {
    assert.equal(storedReferenceImageRole({ referenceRoles: [{ nodeId: "image-2", kind: "image", role: "last_frame", index: 2 }] }, 1), "last_frame");
    assert.equal(storedReferenceImageRole({}, 0), "reference_image");
    assert.equal(storedReferenceImageRole({ videoReferenceImageMode: "first_frame" }, 0), "first_frame");
});
