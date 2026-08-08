import assert from "node:assert/strict";
import test from "node:test";

import {
    buildShotReferencePrompt,
    copyableShotConfig,
    defaultShotImagePrompt,
    isAssetImageWorkbenchContext,
    referenceToken,
    reorderShotIds,
    storyboardCandidateAssetInput,
} from "./storyboard-workbench.ts";

const shot = {
    id: "shot-1",
    projectId: "project-1",
    canvasId: "canvas-1",
    episodeId: "episode-1",
    sceneName: "救生舱",
    location: "救生舱内",
    timeOfDay: "夜",
    order: 1,
    title: "王也冲进舱门",
    scriptText: "警报响起。",
    visualDescription: "王也冲进舱门，红色警报灯扫过面部。",
    characters: ["王也"],
    dialogue: "快走！",
    action: "抓住舱门边缘",
    emotion: "紧张",
    shotSize: "中景",
    cameraMovement: "手持跟拍",
    estimatedDuration: 5,
    assetNeeds: [],
    assetRefs: [],
    imagePrompt: "保留的逐镜提示词",
    imageConfig: { imageModel: "image-model", quality: "high", size: "1536x1024", count: "4" },
    referenceImageIds: ["ref-1"],
    selectedCandidateId: "candidate-old",
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
};

test("asset image context requires an explicit asset coordinate", () => {
    assert.equal(isAssetImageWorkbenchContext(new URLSearchParams("assetId=asset-1")), true);
    assert.equal(isAssetImageWorkbenchContext(new URLSearchParams("briefId=brief-1")), true);
    assert.equal(isAssetImageWorkbenchContext(new URLSearchParams("projectId=project-1&episodeId=episode-1")), false);
});

test("default prompt composes existing storyboard fields", () => {
    const prompt = defaultShotImagePrompt({ ...shot, imagePrompt: undefined });
    assert.match(prompt, /中景/);
    assert.match(prompt, /手持跟拍/);
    assert.match(prompt, /王也冲进舱门/);
    assert.equal(defaultShotImagePrompt(shot), "保留的逐镜提示词");
});

test("shot reorder moves the active id before the drop target", () => {
    assert.deepEqual(reorderShotIds(["shot-1", "shot-2", "shot-3"], "shot-3", "shot-1"), ["shot-3", "shot-1", "shot-2"]);
    assert.deepEqual(reorderShotIds(["shot-1", "shot-2"], "missing", "shot-1"), ["shot-1", "shot-2"]);
});

test("configuration reuse never copies candidates", () => {
    const copied = copyableShotConfig(shot);
    assert.deepEqual(copied.referenceImageIds, ["ref-1"]);
    assert.equal("selectedCandidateId" in copied, false);
});

test("reference prompt only describes tokens used by the prompt", () => {
    assert.equal(referenceToken(0), "@参考图1");
    assert.match(buildShotReferencePrompt("沿用 @参考图1", [{ id: "ref-1", name: "角色", dataUrl: "data:image/png;base64,a", type: "image/png" }]), /第 1 张参考图/);
    assert.equal(buildShotReferencePrompt("不使用引用", [{ id: "ref-1", name: "角色", dataUrl: "data:image/png;base64,a", type: "image/png" }]), "不使用引用");
});

test("candidate asset input carries storyboard lineage", () => {
    const asset = storyboardCandidateAssetInput(shot, {
        id: "candidate-1",
        shotId: shot.id,
        title: "候选 1",
        dataUrl: "blob:candidate-1",
        storageKey: "image:candidate-1",
        width: 2048,
        height: 1152,
        bytes: 1024,
        mimeType: "image/png",
        prompt: "生成提示词",
        model: "image-model",
        quality: "high",
        size: "2048x1152",
    });
    assert.equal(asset.kind, "image");
    assert.equal(asset.metadata?.storyboardShotId, shot.id);
    assert.equal(asset.metadata?.projectId, shot.projectId);
});
