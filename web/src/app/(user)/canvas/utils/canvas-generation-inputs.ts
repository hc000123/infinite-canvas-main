import type { ReferenceAudio } from "@/types/audio";
import type { ReferenceImage, ReferenceImageRole } from "@/types/image";
import type { ReferenceVideo } from "@/types/video";
import { activeVolcengineAssetURI } from "../../../../services/volcengine-asset-metadata.ts";
import { defaultSeedanceImageRole, normalizeSeedanceImageRole, type SeedanceImageRoleMode } from "../../../../services/api/video-reference.ts";

export type CanvasGenerationNodeLike = {
    id: string;
    type: string;
    title: string;
    metadata?: {
        content?: string;
        prompt?: string;
        mimeType?: string;
        storageKey?: string;
        videoUrl?: string;
        cacheUrl?: string;
        generationMode?: string;
        inputOrder?: string[];
        videoReferenceImageMode?: SeedanceImageRoleMode;
        referenceRoles?: Array<{ nodeId: string; kind: "image" | "video" | "audio"; role: string; index?: number }>;
        volcengineAsset?: {
            assetId: string;
            status: string;
            publicUrl?: string;
        };
    };
};

export type CanvasGenerationConnectionLike = {
    fromNodeId: string;
    toNodeId: string;
    toHandle?: string;
};

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    referenceInputs: NodeGenerationInput[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

export function buildCanvasGenerationContext(nodeId: string, nodes: CanvasGenerationNodeLike[], connections: CanvasGenerationConnectionLike[], prompt: string): NodeGenerationContext {
    const inputs = buildCanvasGenerationInputs(nodeId, nodes, connections);
    const upstreamText = inputs
        .map((input) => input.text)
        .filter(Boolean)
        .join("\n\n");
    const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
    const referenceInputs = inputs.filter((input) => input.type === "image" || input.type === "video" || input.type === "audio");

    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        referenceInputs,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildCanvasGenerationInputs(nodeId: string, nodes: CanvasGenerationNodeLike[], connections: CanvasGenerationConnectionLike[]): NodeGenerationInput[] {
    const target = nodes.find((node) => node.id === nodeId);
    const inputs = getOrderedUpstreamNodes(nodeId, nodes, connections).flatMap((node): NodeGenerationInput[] => {
        const image = readReferenceImage(node);
        if (image) return [{ nodeId: node.id, type: "image", title: node.title, image }];
        const video = readReferenceVideo(node);
        if (video) return [{ nodeId: node.id, type: "video", title: node.title, video }];
        const audio = readReferenceAudio(node);
        if (audio) return [{ nodeId: node.id, type: "audio", title: node.title, audio }];
        const text = readNodeTextInput(node);
        if (text) return [{ nodeId: node.id, type: "text", title: node.title, text }];
        return [];
    });
    return applySeedanceImageRoles(
        inputs,
        target,
        connections.filter((connection) => connection.toNodeId === nodeId),
    );
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
        assetUri: activeVolcengineAssetURI(node.metadata.volcengineAsset),
        volcengineAssetId: node.metadata.volcengineAsset?.assetId,
        volcengineAssetStatus: node.metadata.volcengineAsset?.status,
    };
}

function readReferenceVideo(node: CanvasGenerationNodeLike): ReferenceVideo | null {
    if (node.type !== "video" || !node.metadata?.content) return null;
    const assetUri = activeVolcengineAssetURI(node.metadata.volcengineAsset);
    const volcengineAssetId = node.metadata.volcengineAsset?.assetId;
    const volcengineAssetStatus = node.metadata.volcengineAsset?.status;
    const volcenginePublicUrl = node.metadata.volcengineAsset?.status === "Active" ? node.metadata.volcengineAsset?.publicUrl : "";
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.videoUrl || node.metadata.cacheUrl || node.metadata.content,
        storageKey: node.metadata.videoUrl || node.metadata.cacheUrl ? undefined : node.metadata.storageKey,
        ...(volcenginePublicUrl ? { volcenginePublicUrl } : {}),
        ...(assetUri ? { assetUri } : {}),
        ...(volcengineAssetId ? { volcengineAssetId, volcengineAssetStatus } : {}),
    };
}

function readReferenceAudio(node: CanvasGenerationNodeLike): ReferenceAudio | null {
    if (node.type !== "audio" || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.${audioExtension(node.metadata.mimeType)}`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function audioExtension(mimeType?: string) {
    const subtype = mimeType?.split(";")[0]?.split("/")[1]?.toLowerCase();
    if (!subtype || subtype === "mpeg") return "mp3";
    if (subtype === "x-wav") return "wav";
    return subtype;
}

function applySeedanceImageRoles(inputs: NodeGenerationInput[], target: CanvasGenerationNodeLike | undefined, connections: CanvasGenerationConnectionLike[]) {
    let imageIndex = 0;
    return inputs.map((input) => {
        if (!input.image) return input;
        const index = imageIndex++;
        return {
            ...input,
            image: {
                ...input.image,
                seedanceRole: resolveSeedanceImageRole(target, connections, input.nodeId, index),
            },
        };
    });
}

function resolveSeedanceImageRole(target: CanvasGenerationNodeLike | undefined, connections: CanvasGenerationConnectionLike[], nodeId: string, index: number): ReferenceImageRole {
    const configuredRole = target?.metadata?.referenceRoles?.find((item) => item.kind === "image" && item.nodeId === nodeId)?.role;
    const connectionRole = connections.find((connection) => connection.fromNodeId === nodeId && (connection.toHandle === "first_frame" || connection.toHandle === "last_frame"))?.toHandle;
    return normalizeSeedanceImageRole(configuredRole) || normalizeSeedanceImageRole(connectionRole) || defaultSeedanceImageRole(index, target?.metadata?.videoReferenceImageMode);
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
