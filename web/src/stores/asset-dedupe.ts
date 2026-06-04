import type { Asset, AssetWriteInput } from "./use-asset-store.ts";

export async function buildBlobFingerprint(blob?: Blob | null) {
    if (!blob) return "";
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${Array.from(new Uint8Array(hash))
        .map((item) => item.toString(16).padStart(2, "0"))
        .join("")}`;
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

export function mergeDuplicateAsset(existing: Asset, incoming: AssetWriteInput, fingerprint: string, now = new Date().toISOString()): Asset {
    return {
        ...existing,
        title: existing.title || incoming.title,
        coverUrl: existing.coverUrl || incoming.coverUrl,
        source: incoming.source || existing.source,
        note: incoming.note || existing.note,
        tags: mergeStringLists(existing.tags, incoming.tags),
        metadata: mergeAssetMetadata(existing.metadata, incoming.metadata, fingerprint),
        updatedAt: now,
    } as Asset;
}

export function mergeAssetMetadata(current?: Asset["metadata"], incoming?: AssetWriteInput["metadata"], fingerprint?: string) {
    const metadata: NonNullable<Asset["metadata"]> = { ...(current || {}), ...(incoming || {}) };
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
