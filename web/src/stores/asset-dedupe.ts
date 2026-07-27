import type { Asset, AssetWriteInput } from "./use-asset-store.ts";

export async function buildBlobFingerprint(blob?: Blob | null) {
    if (!blob) return "";
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return "";
    try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const hash = await subtle.digest("SHA-256", bytes);
        return `sha256:${Array.from(new Uint8Array(hash))
            .map((item) => item.toString(16).padStart(2, "0"))
            .join("")}`;
    } catch {
        return "";
    }
}

export function fallbackAssetFingerprint(asset: AssetWriteInput | Asset) {
    if (asset.kind === "text") return "";
    const data = asset.data;
    const storageKey = data.storageKey?.trim();
    if (!storageKey || !data.bytes || !data.mimeType) return "";
    return `storage:${storageKey}:${data.bytes}:${data.mimeType}`;
}

export function assetFingerprintCandidates(asset: Asset) {
    return [readString(asset.metadata?.fingerprint), fallbackAssetFingerprint(asset)].filter(Boolean);
}

export function findWorkflowAssetDuplicate(assets: Asset[], incoming: AssetWriteInput) {
    const target = workflowAssetIdentity(incoming);
    if (!target) return undefined;
    return assets.find((asset) => {
        const candidate = workflowAssetIdentity(asset);
        if (!candidate || candidate.projectId !== target.projectId || candidate.episodeId !== target.episodeId || candidate.name !== target.name) return false;
        return candidate.logicalAssetId === target.logicalAssetId || isStableWorkflowAssetId(candidate.logicalAssetId) || isStableWorkflowAssetId(target.logicalAssetId);
    });
}

export function mergeDuplicateAsset(existing: Asset, incoming: AssetWriteInput, fingerprint: string, now = new Date().toISOString()): Asset {
    return {
        ...existing,
        title: existing.title || incoming.title,
        coverUrl: existing.coverUrl || incoming.coverUrl,
        folderId: existing.folderId || incoming.folderId,
        assetBinding: existing.assetBinding || incoming.assetBinding,
        source: incoming.source || existing.source,
        note: incoming.note || existing.note,
        tags: mergeStringLists(existing.tags, incoming.tags),
        metadata: mergeAssetMetadata(existing.metadata, incoming.metadata, fingerprint),
        updatedAt: now,
    } as Asset;
}

export function mergeAssetMetadata(current?: Asset["metadata"], incoming?: AssetWriteInput["metadata"], fingerprint?: string) {
    const metadata: NonNullable<Asset["metadata"]> = { ...(current || {}), ...(incoming || {}) };
    const currentWorkflow = readRecord(current?.originalWorkflow);
    const incomingWorkflow = readRecord(incoming?.originalWorkflow);
    if (currentWorkflow || incomingWorkflow) metadata.originalWorkflow = { ...(currentWorkflow || {}), ...(incomingWorkflow || {}) };
    if (fingerprint) metadata.fingerprint = fingerprint;
    const sourceRefs = mergeStringLists(
        readStringList(current?.sourceRefs),
        readStringList(incoming?.sourceRefs),
        [readString(current?.nodeId), readString(incoming?.nodeId), readString(current?.assetId), readString(incoming?.assetId), readString(current?.source), readString(incoming?.source)].filter(Boolean) as string[],
    );
    if (sourceRefs.length) metadata.sourceRefs = sourceRefs;
    const generations = mergeUnknownLists(readUnknownList(current?.generations), readUnknownList(incoming?.generations), current?.generation === undefined ? [] : [current.generation], incoming?.generation === undefined ? [] : [incoming.generation]);
    if (generations.length) metadata.generations = generations;
    return metadata;
}

function mergeStringLists(...lists: Array<Array<string | undefined> | undefined>) {
    return Array.from(
        new Set(
            lists
                .flatMap((list) => list || [])
                .map((item) => item?.trim())
                .filter((item): item is string => Boolean(item)),
        ),
    );
}

function mergeUnknownLists(...lists: Array<unknown[]>) {
    const seen = new Set<string>();
    return lists.flat().filter((item) => {
        const key = JSON.stringify(item) ?? String(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function readStringList(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readUnknownList(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function workflowAssetIdentity(asset: Asset | AssetWriteInput) {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    if (!workflow) return null;
    const projectId = readString(workflow.sourceProjectId) || readString(workflow.projectId);
    const episodeId = readString(workflow.sourceEpisodeId) || readString(workflow.episode);
    const logicalAssetId = readString(workflow.logicalAssetId) || readString(workflow.assetId);
    const name = (readString(workflow.name) || asset.title).trim().replace(/\s+/g, " ").toLowerCase();
    return projectId && episodeId && logicalAssetId && name ? { projectId, episodeId, logicalAssetId, name } : null;
}

function isStableWorkflowAssetId(value: string) {
    return /^(CHAR|SCENE|PROP|COSTUME)-\d{3}$/.test(value);
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
