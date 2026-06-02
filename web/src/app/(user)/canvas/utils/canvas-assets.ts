import { getDataUrlByteSize } from "@/lib/image-utils";
import type { Asset } from "@/stores/use-asset-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export type CanvasAssetPayload = Omit<Asset, "id" | "createdAt" | "updatedAt">;

export function canvasNodeToAsset(node: CanvasNodeData): CanvasAssetPayload | null {
    if (node.type === CanvasNodeType.Text) {
        const content = node.metadata?.content?.trim();
        if (!content) return null;
        return {
            kind: "text",
            title: nodeTitle(node, "画布文本"),
            coverUrl: "",
            tags: [],
            source: "Canvas",
            data: { content },
            metadata: { source: "canvas", nodeId: node.id },
        };
    }

    if (node.type === CanvasNodeType.Image) {
        if (!node.metadata?.content) return null;
        const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
        return {
            kind: "image",
            title: nodeTitle(node, "画布图片"),
            coverUrl: node.metadata.content,
            tags: [],
            source: "Canvas",
            data: {
                dataUrl,
                storageKey: node.metadata.storageKey,
                width: node.metadata.naturalWidth || node.width,
                height: node.metadata.naturalHeight || node.height,
                bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                mimeType: node.metadata.mimeType || "image/png",
            },
            metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt, volcengineAsset: node.metadata?.volcengineAsset },
        };
    }

    if (node.type === CanvasNodeType.Video) {
        if (!node.metadata?.content) return null;
        return {
            kind: "video",
            title: nodeTitle(node, "画布视频"),
            coverUrl: "",
            tags: [],
            source: "Canvas",
            data: {
                url: node.metadata.content,
                storageKey: node.metadata.storageKey,
                width: node.width,
                height: node.height,
                bytes: node.metadata.bytes || 0,
                mimeType: node.metadata.mimeType || "video/mp4",
            },
            metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
        };
    }

    if (node.type === CanvasNodeType.Audio) {
        if (!node.metadata?.content) return null;
        return {
            kind: "audio",
            title: node.title || "画布音频",
            coverUrl: "",
            tags: [],
            source: "Canvas",
            data: {
                url: node.metadata.content,
                storageKey: node.metadata.storageKey,
                bytes: node.metadata.bytes || 0,
                mimeType: node.metadata.mimeType || "audio/mpeg",
            },
            metadata: { source: "canvas", nodeId: node.id },
        };
    }

    return null;
}

export function hydrateCanvasNodeAssetUrls(node: CanvasNodeData, urls: Map<string, string>) {
    const storageKey = node.metadata?.storageKey;
    if (!storageKey) return node;
    const content = urls.get(storageKey);
    return content ? { ...node, metadata: { ...node.metadata, content } } : node;
}

function nodeTitle(node: CanvasNodeData, fallback: string) {
    return node.metadata?.prompt?.slice(0, 24) || node.title || fallback;
}
