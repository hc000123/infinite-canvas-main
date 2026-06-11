import type { VideoGenerationReferenceInput } from "@/services/api/video";
import { defaultSeedanceImageRole, type SeedanceImageRoleMode } from "@/services/api/video-reference";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { activeVolcengineAssetURI } from "@/services/volcengine-asset-metadata";
import type { ReferenceAudio } from "@/types/audio";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/video";

import { storedReferenceImageRole } from "./canvas-generation-metadata";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

export async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    const references = await resolveStoredImageReferences(metadata);
    return references === undefined ? null : references;
}

export async function resolveStoredImageReferences(metadata: CanvasNodeMetadata) {
    if (!metadata.references?.length) return undefined;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const seedanceRole = storedReferenceImageRole(metadata, index);
            if (url.startsWith("asset://")) return { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl: url, assetUri: url, seedanceRole };
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined, seedanceRole } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

export async function resolveStoredVideoReferences(metadata: CanvasNodeMetadata) {
    if (!metadata.videoReferences?.length) return undefined;
    const references = await Promise.all(
        metadata.videoReferences.map(async (url, index) => {
            const mediaUrl = url.startsWith("video:") ? await resolveMediaUrl(url, "") : url;
            return mediaUrl ? { id: `${index}`, name: `reference-${index}.mp4`, type: "video/mp4", url: mediaUrl, storageKey: url.startsWith("video:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceVideo[]) : null;
}

export async function resolveStoredAudioReferences(metadata: CanvasNodeMetadata) {
    if (!metadata.audioReferences?.length) return undefined;
    const references = await Promise.all(
        metadata.audioReferences.map(async (url, index) => {
            const mediaUrl = url.startsWith("audio:") ? await resolveMediaUrl(url, "") : url;
            return mediaUrl ? { id: `${index}`, name: `reference-${index}.${audioExtension()}`, type: "audio/mpeg", url: mediaUrl, storageKey: url.startsWith("audio:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceAudio[]) : null;
}

export function storedVideoReferenceInputs(metadata: CanvasNodeMetadata, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    if (!metadata.referenceOrder?.length) return undefined;
    const inputs = metadata.referenceOrder.flatMap((item): VideoGenerationReferenceInput[] => {
        const index = Math.max(0, item.index - 1);
        if (item.kind === "image" && images[index]) return [{ type: "image", nodeId: item.nodeId, image: images[index] }];
        if (item.kind === "video" && videos[index]) return [{ type: "video", nodeId: item.nodeId, video: videos[index] }];
        if (item.kind === "audio" && audios[index]) return [{ type: "audio", nodeId: item.nodeId, audio: audios[index] }];
        return [];
    });
    return inputs.length ? inputs : undefined;
}

export function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

export function sourceNodeReferenceImages(node: CanvasNodeData | null | undefined, mode?: SeedanceImageRoleMode) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
            assetUri: activeVolcengineAssetURI(node.metadata.volcengineAsset),
            volcengineAssetId: node.metadata.volcengineAsset?.assetId,
            volcengineAssetStatus: node.metadata.volcengineAsset?.status,
            seedanceRole: defaultSeedanceImageRole(0, mode),
        },
    ];
}

export function sourceNodeReferenceVideos(node: CanvasNodeData | null | undefined) {
    if (!node || node.type !== CanvasNodeType.Video || !node.metadata?.content) return [];
    const url = node.metadata.videoUrl || node.metadata.cacheUrl || node.metadata.content;
    const assetUri = activeVolcengineAssetURI(node.metadata.volcengineAsset);
    const volcengineAssetId = node.metadata.volcengineAsset?.assetId;
    const volcengineAssetStatus = node.metadata.volcengineAsset?.status;
    const volcenginePublicUrl = node.metadata.volcengineAsset?.status === "Active" ? node.metadata.volcengineAsset?.publicUrl : "";
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.mp4`,
            type: node.metadata.mimeType || "video/mp4",
            url,
            storageKey: node.metadata.videoUrl || node.metadata.cacheUrl ? undefined : node.metadata.storageKey,
            ...(volcenginePublicUrl ? { volcenginePublicUrl } : {}),
            ...(assetUri ? { assetUri } : {}),
            ...(volcengineAssetId ? { volcengineAssetId, volcengineAssetStatus } : {}),
        },
    ];
}

export function sourceNodeReferenceAudios(node: CanvasNodeData | null | undefined) {
    if (!node || node.type !== CanvasNodeType.Audio || !node.metadata?.content) return [];
    const assetUri = activeVolcengineAssetURI(node.metadata.volcengineAsset);
    const volcengineAssetId = node.metadata.volcengineAsset?.assetId;
    const volcengineAssetStatus = node.metadata.volcengineAsset?.status;
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.${audioExtension(node.metadata.mimeType)}`,
            type: node.metadata.mimeType || "audio/mpeg",
            url: assetUri || node.metadata.content,
            storageKey: assetUri ? undefined : node.metadata.storageKey,
            ...(assetUri ? { assetUri } : {}),
            ...(volcengineAssetId ? { volcengineAssetId, volcengineAssetStatus } : {}),
        },
    ];
}

function audioExtension(mimeType?: string) {
    const subtype = mimeType?.split(";")[0]?.split("/")[1]?.toLowerCase();
    if (!subtype || subtype === "mpeg") return "mp3";
    if (subtype === "x-wav") return "wav";
    return subtype;
}
