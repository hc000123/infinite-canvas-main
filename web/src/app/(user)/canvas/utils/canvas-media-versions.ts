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

export function beginPendingCanvasMediaVersion(node: CanvasNodeData, prompt: string, startedAt: string, promptDocument?: CanvasPromptDocument): CanvasNodeData {
    const versions = ensureCanvasMediaVersions(node, startedAt);
    return {
        ...node,
        metadata: {
            ...node.metadata,
            status: "loading",
            errorDetails: undefined,
            mediaVersions: versions,
            currentMediaVersionId: node.metadata?.currentMediaVersionId || versions.at(-1)?.id,
            pendingMediaVersion: { prompt, promptDocument, startedAt },
        },
    };
}

export function bindPendingCanvasMediaVersionTask(node: CanvasNodeData, prompt: string, startedAt: string, taskId: string, promptDocument?: CanvasPromptDocument): CanvasNodeData {
    if ((node.type !== "image" && node.type !== "video") || !node.metadata?.content) return node;
    const pendingNode = node.metadata.pendingMediaVersion ? node : beginPendingCanvasMediaVersion(node, prompt, startedAt, promptDocument);
    return {
        ...pendingNode,
        metadata: {
            ...pendingNode.metadata,
            pendingMediaVersion: { ...(pendingNode.metadata?.pendingMediaVersion || { prompt, promptDocument, startedAt }), taskId },
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

export function canvasMediaVersionNavigation(node: CanvasNodeData) {
    const versions = node.metadata?.mediaVersions || [];
    const current = currentCanvasMediaVersion(node);
    const currentIndex = Math.max(0, versions.findIndex((item) => item.id === current?.id));
    return {
        versions,
        current,
        currentIndex,
        label: current ? `v${current.versionNumber} / ${versions.length}` : "",
        previousId: currentIndex > 0 ? versions[currentIndex - 1]?.id : undefined,
        nextId: currentIndex < versions.length - 1 ? versions[currentIndex + 1]?.id : undefined,
    };
}

export function patchCurrentCanvasMediaVersion(node: CanvasNodeData, patch: Partial<CanvasNodeMetadata>): CanvasNodeData {
    const currentId = currentCanvasMediaVersion(node)?.id;
    return {
        ...node,
        metadata: {
            ...node.metadata,
            ...patch,
            mediaVersions: node.metadata?.mediaVersions?.map((version) => (version.id === currentId ? { ...version, metadata: { ...version.metadata, ...patch } } : version)),
        },
    };
}

export function completePendingCanvasMediaVersion(node: CanvasNodeData, completed: CanvasNodeData, createdAt = new Date().toISOString()) {
    const pending = node.metadata?.pendingMediaVersion;
    if (pending) return appendCanvasMediaVersion(node, completed, pending.prompt, createdAt, pending.promptDocument);
    if (!hasUncommittedCanvasMediaVersion(node)) return completed;
    return appendCanvasMediaVersion(
        node,
        completed,
        node.metadata?.promptDraft ?? completed.metadata?.prompt ?? node.metadata?.prompt ?? "",
        createdAt,
        node.metadata?.promptDraftDocument ?? completed.metadata?.promptDocument ?? node.metadata?.promptDocument,
    );
}

export function hasUncommittedCanvasMediaVersion(node: CanvasNodeData) {
    if (node.metadata?.pendingMediaVersion) return true;
    const current = currentCanvasMediaVersion(node);
    const taskId = node.metadata?.taskId;
    const currentTaskId = current?.metadata.taskId;
    if (!current || !taskId || !currentTaskId) return false;
    return taskId !== currentTaskId;
}

export function rollbackPendingCanvasMediaVersion(node: CanvasNodeData, errorDetails: string) {
    const pending = node.metadata?.pendingMediaVersion;
    const promptDraft = pending?.prompt ?? node.metadata?.promptDraft;
    const promptDraftDocument = pending?.promptDocument ?? node.metadata?.promptDraftDocument;
    const currentId = currentCanvasMediaVersion(node)?.id;
    const restored = currentId ? switchCanvasMediaVersion(node, currentId) : node;
    return {
        ...restored,
        metadata: {
            ...restored.metadata,
            status: "success" as const,
            errorDetails,
            pendingMediaVersion: undefined,
            promptDraft,
            promptDraftDocument,
        },
    };
}

export function hasDirtyCanvasPromptDraft(node: CanvasNodeData) {
    if (node.metadata?.promptDraft === undefined && node.metadata?.promptDraftDocument === undefined) return false;
    return node.metadata.promptDraft !== (node.metadata.prompt || "") || JSON.stringify(node.metadata.promptDraftDocument) !== JSON.stringify(node.metadata.promptDocument);
}

export function canvasPromptEditorValue(node: CanvasNodeData) {
    return node.metadata?.promptDraft ?? node.metadata?.prompt ?? "";
}

export function canvasPromptEditorDocument(node: CanvasNodeData) {
    return node.metadata?.promptDraftDocument ?? node.metadata?.promptDocument;
}

export async function hydrateCanvasMediaVersionUrls(
    node: CanvasNodeData,
    resolveImage: (storageKey: string, fallbackUrl?: string) => Promise<string>,
    resolveMedia: (storageKey: string, fallbackUrl?: string) => Promise<string>,
) {
    const versions = node.metadata?.mediaVersions;
    if (!versions?.length) return node;
    return {
        ...node,
        metadata: {
            ...node.metadata,
            mediaVersions: await Promise.all(
                versions.map(async (version) => {
                    const storageKey = version.metadata.storageKey;
                    if (!storageKey) return version;
                    const content = await (version.kind === "video" ? resolveMedia(storageKey, version.metadata.content) : resolveImage(storageKey, version.metadata.content));
                    return { ...version, metadata: { ...version.metadata, content } };
                }),
            ),
        },
    };
}
