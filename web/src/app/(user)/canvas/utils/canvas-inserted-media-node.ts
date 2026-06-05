import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants.ts";
import type { CanvasNodeData, Position } from "../types.ts";
import { canvasAssetReferenceMetadata } from "./canvas-asset-reference.ts";
import type { InsertAssetPayload } from "./asset-insert-payload.ts";
import { fitNodeSize } from "./canvas-node-size.ts";

export type InsertedMediaAssetPayload = Extract<InsertAssetPayload, { kind: "video" | "audio" }>;

export function buildInsertedMediaAssetNode(payload: InsertedMediaAssetPayload, id: string, center: Position): CanvasNodeData {
    if (payload.kind === "video") {
        const spec = NODE_DEFAULT_SIZE.video;
        const size = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        return {
            id,
            type: "video" as CanvasNodeData["type"],
            title: payload.title,
            position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: {
                content: payload.url,
                storageKey: payload.storageKey,
                status: "success",
                naturalWidth: payload.width,
                naturalHeight: payload.height,
                ...canvasAssetReferenceMetadata(payload),
                volcengineAsset: payload.volcengineAsset,
            },
        };
    }

    const spec = NODE_DEFAULT_SIZE.audio;
    return {
        id,
        type: "audio" as CanvasNodeData["type"],
        title: payload.title,
        position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 },
        width: spec.width,
        height: spec.height,
        metadata: {
            content: payload.url,
            storageKey: payload.storageKey,
            bytes: payload.bytes,
            mimeType: payload.mimeType || "audio/mpeg",
            status: "success",
            ...canvasAssetReferenceMetadata(payload),
        },
    };
}
