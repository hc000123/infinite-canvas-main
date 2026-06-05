import assert from "node:assert/strict";
import test from "node:test";

import { buildAngleImageNode, buildAngleLabel, buildAnglePrompt, buildAngleReferenceImage, buildCroppedImageNode } from "./canvas-image-derivatives.ts";
import type { CanvasNodeData } from "../types.ts";

const sourceNode: CanvasNodeData = {
    id: "image-1",
    type: "image",
    title: "主体",
    position: { x: 100, y: 120 },
    width: 320,
    height: 240,
    metadata: {
        content: "data:image/png;base64,AAAA",
        prompt: "原提示词",
        mimeType: "image/png",
        storageKey: "image-key",
    },
};

test("builds cropped image node beside the source image", () => {
    const node = buildCroppedImageNode({
        sourceNode,
        childId: "crop-1",
        imageSize: { width: 1200, height: 600 },
        imageMetadata: { content: "blob:crop", status: "success", mimeType: "image/png" },
    });

    assert.equal(node.id, "crop-1");
    assert.equal(node.type, "image");
    assert.equal(node.title, "Cropped Image");
    assert.deepEqual(node.position, { x: 516, y: 120 });
    assert.deepEqual([node.width, node.height], [320, 160]);
    assert.equal(node.metadata?.content, "blob:crop");
    assert.equal(node.metadata?.prompt, "原提示词");
});

test("builds cropped image node with the minimum readable width", () => {
    const node = buildCroppedImageNode({
        sourceNode: { ...sourceNode, width: 500 },
        childId: "crop-small",
        imageSize: { width: 80, height: 40 },
        imageMetadata: { content: "blob:crop" },
    });

    assert.deepEqual([node.width, node.height], [220, 110]);
});

test("builds angle labels, prompts, reference image and draft node", () => {
    const params = { horizontalAngle: -30, pitchAngle: 12, cameraDistance: 4.8, wideAngle: true };
    const label = buildAngleLabel(params);
    const prompt = buildAnglePrompt(params);
    const reference = buildAngleReferenceImage(sourceNode);
    const node = buildAngleImageNode({
        sourceNode,
        childId: "angle-1",
        params,
        imageSpec: { width: 300, height: 220 },
        generationMetadata: { model: "gpt-image", generationType: "edit", references: ["image-1"] },
    });

    assert.equal(label, "AI 多角度：向左旋转 30 度，俯视 12 度，镜头距离 4.8，广角镜头");
    assert.equal(prompt, `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${label}。`);
    assert.deepEqual(reference, {
        id: "image-1",
        name: "主体.png",
        type: "image/png",
        dataUrl: "data:image/png;base64,AAAA",
        storageKey: "image-key",
    });
    assert.equal(node.title, label);
    assert.deepEqual(node.position, { x: 516, y: 120 });
    assert.deepEqual([node.width, node.height], [300, 220]);
    assert.equal(node.metadata?.prompt, prompt);
    assert.equal(node.metadata?.status, "loading");
});
