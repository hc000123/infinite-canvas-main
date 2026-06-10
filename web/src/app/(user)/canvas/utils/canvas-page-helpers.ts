import { resolveMediaUrl, type UploadedFile } from "@/services/file-storage";
import { resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";

import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import type { NodeGenerationInput } from "../components/canvas-node-generation";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, CanvasNodeMetadata, Position } from "../types";
import { CanvasNodeType } from "../types";
import { getNodeProductionPackageId, getNodeProductionPackageRole, productionPackageRoleLabel, type CanvasProductionPackageSummary } from "./canvas-production-packages";
import { nodeSizeFromRatio } from "./canvas-node-size";

export const NODE_STATUS_SUCCESS = "success" as const;

export function createCanvasNode(type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
        },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

export function productionNodeBadge(node: CanvasNodeData, packages: CanvasProductionPackageSummary[], labels: Map<string, string>) {
    const packageId = getNodeProductionPackageId(node);
    if (!packageId) return "";
    const packageLabel = labels.get(packageId) || node.metadata?.productionPackageLabel || packageId.slice(0, 4).toUpperCase();
    if (node.type === CanvasNodeType.Video) {
        const versionNumber = node.metadata?.productionVideoVersionNumber;
        const versionLabel = versionNumber ? `v${versionNumber}` : "";
        const productionPackage = packages.find((item) => item.id === packageId);
        const visibleVersions = productionPackage?.versions.filter((version) => !version.hidden) || [];
        const currentLabel = productionPackage?.currentVersion?.label || (node.metadata?.isCurrentProductionVersion ? versionLabel : "");
        if (visibleVersions.length > 1 && currentLabel) return `${visibleVersions.length} 个版本 / 当前 ${currentLabel}`;
        return node.metadata?.isCurrentProductionVersion && versionLabel ? `${packageLabel} · 当前视频版本 ${versionLabel}` : versionLabel ? `${packageLabel} · 视频版本 ${versionLabel}` : `${packageLabel} · 视频结果`;
    }
    return `${packageLabel} · ${productionPackageRoleLabel(getNodeProductionPackageRole(node))}`;
}

export function canvasAssetTypeLabel(type: CanvasNodeType) {
    if (type === CanvasNodeType.Text) return "文本";
    if (type === CanvasNodeType.Video) return "视频";
    if (type === CanvasNodeType.Audio) return "音频";
    return "图片";
}

export function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

export function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
    return { content: video.url, storageKey: video.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", localStoredAt: new Date().toISOString() };
}

export function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: NODE_STATUS_SUCCESS, bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", localStoredAt: new Date().toISOString() };
}

export async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveMediaUrl(node.metadata.storageKey, content) } };
            if (node.type !== CanvasNodeType.Image || !content) return node;
            if (node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveImageUrl(node.metadata.storageKey, content) } };
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

export async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                    images: await Promise.all((message.images || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

export function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeMetadata>) {
    const next = { ...node, metadata: { ...node.metadata, ...(patch || {}) } };
    const spec = node.type === CanvasNodeType.Video ? NODE_DEFAULT_SIZE[CanvasNodeType.Video] : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = typeof patch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(patch.size, spec.width, spec.height) : null;
    return size && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : next;
}

export function buildFrameReferencesByVideoId(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const references = new Map<string, { first?: CanvasNodeData; last?: CanvasNodeData }>();
    connections.forEach((connection) => {
        if (connection.toHandle !== "first_frame" && connection.toHandle !== "last_frame") return;
        const from = nodeById.get(connection.fromNodeId);
        const to = nodeById.get(connection.toNodeId);
        if (from?.type !== CanvasNodeType.Image || to?.type !== CanvasNodeType.Video) return;
        const current = references.get(to.id) || {};
        if (connection.toHandle === "first_frame") current.first = from;
        else current.last = from;
        references.set(to.id, current);
    });
    return references;
}

export function shouldRememberVideoDefaults(node: CanvasNodeData | undefined, patch: Partial<CanvasNodeMetadata>) {
    if (node?.type !== CanvasNodeType.Config) return false;
    if (patch.generationMode === "video") return true;
    if (node.metadata?.generationMode !== "video") return false;
    return ["channelMode", "provider", "model", "size", "seconds", "duration", "vquality", "generateAudio", "watermark", "seed", "returnLastFrame", "videoReferenceImageMode"].some((key) => key in patch);
}

export function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target", firstHandleId?: string) {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    const targetHandle = firstHandleType === "target" ? firstHandleId : undefined;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id, toHandle: targetHandle };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id, toHandle: targetHandle };
    return { fromNodeId: first.id, toNodeId: second.id };
}

export function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}
