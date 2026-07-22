import { nanoid } from "nanoid";

import type { CanvasMediaVersion, CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import type { CanvasPromptDocument } from "./canvas-prompt-document.ts";

const VERSION_METADATA_KEYS = [
    "content",
    "status",
    "generationMode",
    "generationType",
    "model",
    "size",
    "quality",
    "count",
    "imagePresetId",
    "imagePresetLabel",
    "imageCameraName",
    "imageLensName",
    "imageFocalLength",
    "imageAperture",
    "seconds",
    "vquality",
    "duration",
    "ratio",
    "resolution",
    "generateAudio",
    "watermark",
    "seed",
    "videoPromptReviewEnabled",
    "returnLastFrame",
    "channelMode",
    "provider",
    "actionType",
    "videoActionType",
    "relationType",
    "videoTaskMode",
    "videoEditType",
    "videoExtendDirection",
    "videoReferenceImageMode",
    "videoReferenceMode",
    "sourceVideoNodeId",
    "variantOfNodeId",
    "continuationOfNodeId",
    "videoReferences",
    "audioReferences",
    "referenceOrder",
    "referenceRoles",
    "references",
    "inputOrder",
    "taskId",
    "taskStatus",
    "rawTaskStatus",
    "aiTaskId",
    "upstreamTaskId",
    "aiTaskStatus",
    "aiTaskCredits",
    "creditLogId",
    "creditsRefunded",
    "refundedAt",
    "finishedAt",
    "generationStartedAt",
    "videoUrl",
    "cacheUrl",
    "cachePath",
    "cacheFilename",
    "lastFrameUrl",
    "lastFrameStorageKey",
    "taskCreatedAt",
    "taskUpdatedAt",
    "taskDuration",
    "executionExpiresAfter",
    "videoUrlExpiresAt",
    "localStoredAt",
    "naturalWidth",
    "naturalHeight",
    "storageKey",
    "mimeType",
    "bytes",
    "sourceAssetId",
    "assetVersion",
    "assetReferenceMode",
    "volcengineAsset",
] as const satisfies readonly (keyof CanvasNodeMetadata)[];

function versionMetadata(metadata: CanvasNodeMetadata | undefined) {
    const result: Partial<CanvasNodeMetadata> = {};
    for (const key of VERSION_METADATA_KEYS) {
        const value = metadata?.[key];
        if (value !== undefined) Object.assign(result, { [key]: value });
    }
    return result;
}

function createVersion(node: CanvasNodeData, versionNumber: number, prompt: string, createdAt: string, promptDocument?: CanvasPromptDocument): CanvasMediaVersion {
    return {
        id: nanoid(),
        versionNumber,
        kind: node.type === "video" ? "video" : "image",
        createdAt,
        prompt,
        promptDocument,
        width: node.width,
        height: node.height,
        metadata: versionMetadata(node.metadata),
    };
}

function projectVersion(node: CanvasNodeData, version: CanvasMediaVersion): CanvasNodeData {
    const metadata: CanvasNodeMetadata = { ...node.metadata };
    for (const key of VERSION_METADATA_KEYS) delete metadata[key];
    return {
        ...node,
        width: version.width,
        height: version.height,
        metadata: {
            ...metadata,
            ...version.metadata,
            prompt: version.prompt,
            promptDocument: version.promptDocument,
            currentMediaVersionId: version.id,
            promptDraft: undefined,
            promptDraftDocument: undefined,
            pendingMediaVersion: undefined,
            errorDetails: undefined,
        },
    };
}

export function ensureCanvasMediaVersions(node: CanvasNodeData, createdAt = new Date().toISOString()) {
    if (node.metadata?.mediaVersions?.length) return node.metadata.mediaVersions;
    if ((node.type !== "image" && node.type !== "video") || !node.metadata?.content) return [];
    return [createVersion(node, 1, node.metadata.prompt || "", createdAt, node.metadata.promptDocument)];
}

export function appendCanvasMediaVersion(source: CanvasNodeData, completed: CanvasNodeData, prompt: string, createdAt: string, promptDocument?: CanvasPromptDocument): CanvasNodeData {
    const existing = ensureCanvasMediaVersions(source, createdAt);
    const version = createVersion(completed, existing.length + 1, prompt, createdAt, promptDocument);
    const projected = projectVersion(source, version);
    return {
        ...projected,
        title: completed.title,
        metadata: {
            ...projected.metadata,
            mediaVersions: [...existing, version],
            currentMediaVersionId: version.id,
        },
    };
}

export function switchCanvasMediaVersion(node: CanvasNodeData, versionId: string) {
    const version = node.metadata?.mediaVersions?.find((item) => item.id === versionId);
    return version ? projectVersion(node, version) : node;
}

export function applyCanvasPromptDraft(node: CanvasNodeData, prompt: string, promptDocument?: CanvasPromptDocument): CanvasNodeData {
    return {
        ...node,
        metadata: {
            ...node.metadata,
            promptDraft: prompt,
            promptDraftDocument: promptDocument,
        },
    };
}

export function currentCanvasMediaVersion(node: CanvasNodeData) {
    const versions = node.metadata?.mediaVersions;
    if (!versions?.length) return undefined;
    return versions.find((item) => item.id === node.metadata?.currentMediaVersionId) || versions.at(-1);
}

export function hasDirtyCanvasPromptDraft(node: CanvasNodeData) {
    if (node.metadata?.promptDraft === undefined && node.metadata?.promptDraftDocument === undefined) return false;
    return node.metadata.promptDraft !== (node.metadata.prompt || "") || JSON.stringify(node.metadata.promptDraftDocument) !== JSON.stringify(node.metadata.promptDocument);
}
