import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/video";

export type CanvasGenerationNodeLike = {
    id: string;
    type: string;
    title: string;
    metadata?: {
        content?: string;
        prompt?: string;
        mimeType?: string;
        storageKey?: string;
        inputOrder?: string[];
    };
};

export type CanvasGenerationConnectionLike = {
    fromNodeId: string;
    toNodeId: string;
};

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    textCount: number;
    imageCount: number;
    videoCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
};

export function buildCanvasGenerationContext(nodeId: string, nodes: CanvasGenerationNodeLike[], connections: CanvasGenerationConnectionLike[], prompt: string): NodeGenerationContext {
    const inputs = buildCanvasGenerationInputs(nodeId, nodes, connections);
    const upstreamText = inputs
        .map((input) => input.text)
        .filter(Boolean)
        .join("\n\n");
    const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));

    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        referenceImages,
        referenceVideos,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
    };
}

export function buildCanvasGenerationInputs(nodeId: string, nodes: CanvasGenerationNodeLike[], connections: CanvasGenerationConnectionLike[]): NodeGenerationInput[] {
    return getOrderedUpstreamNodes(nodeId, nodes, connections).flatMap((node): NodeGenerationInput[] => {
        const image = readReferenceImage(node);
        if (image) return [{ nodeId: node.id, type: "image", title: node.title, image }];
        const video = readReferenceVideo(node);
        if (video) return [{ nodeId: node.id, type: "video", title: node.title, video }];
        const text = readNodeTextInput(node);
        if (text) return [{ nodeId: node.id, type: "text", title: node.title, text }];
        return [];
    });
}

function readNodeTextInput(node: CanvasGenerationNodeLike) {
    if (node.type === "text") return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function readReferenceImage(node: CanvasGenerationNodeLike): ReferenceImage | null {
    if (node.type !== "image" || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function readReferenceVideo(node: CanvasGenerationNodeLike): ReferenceVideo | null {
    if (node.type !== "video" || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function getOrderedUpstreamNodes(nodeId: string, nodes: CanvasGenerationNodeLike[], connections: CanvasGenerationConnectionLike[]) {
    const target = nodes.find((node) => node.id === nodeId);
    const upstreamNodes = connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasGenerationNodeLike => Boolean(node));
    const order = target?.metadata?.inputOrder || [];
    return [...order.map((id) => upstreamNodes.find((node) => node.id === id)).filter((node): node is CanvasGenerationNodeLike => Boolean(node)), ...upstreamNodes.filter((node) => !order.includes(node.id))];
}
