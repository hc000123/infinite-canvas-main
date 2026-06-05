import type { ReferenceImage } from "@/types/image";

import type { CanvasNodeData, CanvasNodeMetadata } from "../types.ts";

export type CanvasImageCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CanvasImageAngleParams = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
};

type ImageSize = { width: number; height: number };

export function buildCroppedImageNode({ sourceNode, childId, imageSize, imageMetadata }: { sourceNode: CanvasNodeData; childId: string; imageSize: ImageSize; imageMetadata: CanvasNodeMetadata }): CanvasNodeData {
    const width = Math.min(sourceNode.width, Math.max(220, imageSize.width));
    return {
        id: childId,
        type: "image" as CanvasNodeData["type"],
        title: "Cropped Image",
        position: { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y },
        width,
        height: width * (imageSize.height / imageSize.width),
        metadata: {
            ...imageMetadata,
            prompt: sourceNode.metadata?.prompt,
        },
    };
}

export function buildAngleReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (!node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

export function buildAngleImageNode({
    sourceNode,
    childId,
    params,
    imageSpec,
    generationMetadata,
}: {
    sourceNode: CanvasNodeData;
    childId: string;
    params: CanvasImageAngleParams;
    imageSpec: ImageSize;
    generationMetadata: CanvasNodeMetadata;
}): CanvasNodeData {
    const prompt = buildAnglePrompt(params);
    return {
        id: childId,
        type: "image" as CanvasNodeData["type"],
        title: buildAngleLabel(params),
        position: { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y },
        width: imageSpec.width,
        height: imageSpec.height,
        metadata: { prompt, status: "loading", ...generationMetadata },
    };
}

export function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? "正面视角" : params.horizontalAngle > 0 ? `向右旋转 ${params.horizontalAngle} 度` : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
    const pitch = params.pitchAngle === 0 ? "水平视角" : params.pitchAngle > 0 ? `俯视 ${params.pitchAngle} 度` : `仰视 ${Math.abs(params.pitchAngle)} 度`;
    return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

export function buildAnglePrompt(params: CanvasImageAngleParams) {
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
