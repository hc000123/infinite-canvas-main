import type { Asset } from "@/stores/use-asset-store";

export type AssetVersionRecord = {
    id: string;
    versionNumber: number;
    kind: Asset["kind"];
    title: string;
    coverUrl: string;
    data: Record<string, unknown>;
    createdAt: string;
    changeNote: string;
    source: "initial" | "manual_edit";
    isCurrent?: boolean;
};

type AssetPatch = Partial<Omit<Asset, "id" | "createdAt">>;

export function assetVersionRecords(asset: Pick<Asset, "kind" | "title" | "coverUrl" | "data" | "createdAt" | "updatedAt" | "metadata"> | null | undefined): AssetVersionRecord[] {
    const versions = Array.isArray(asset?.metadata?.assetVersions) ? asset.metadata.assetVersions : [];
    const currentVersionId = typeof asset?.metadata?.currentAssetVersionId === "string" ? asset.metadata.currentAssetVersionId : "";
    return versions.flatMap((item): AssetVersionRecord[] => {
        const record = readVersionRecord(item);
        if (!record) return [];
        return [{ ...record, isCurrent: currentVersionId ? record.id === currentVersionId : record.versionNumber === latestVersionNumber(versions) }];
    });
}

export function buildAssetVersionedUpdatePatch(current: Asset, patch: AssetPatch, now: string, changeNote = "编辑素材"): AssetPatch {
    const next = { ...current, ...patch, metadata: { ...(current.metadata || {}), ...(patch.metadata || {}) } } as Asset;
    if (!assetContentChanged(current, next)) return patch;
    const existing = assetVersionRecords(current);
    const initial = existing.length ? existing.map(stripCurrentFlag) : [snapshotFromAsset(current, 1, current.createdAt || current.updatedAt || now, "初始版本", "initial")];
    const nextVersionNumber = Math.max(0, ...initial.map((version) => version.versionNumber)) + 1;
    const nextVersion = snapshotFromAsset(next, nextVersionNumber, now, changeNote, "manual_edit");
    return {
        ...patch,
        metadata: {
            ...(current.metadata || {}),
            ...(patch.metadata || {}),
            assetVersions: [...initial, nextVersion],
            currentAssetVersionId: nextVersion.id,
        },
    } as AssetPatch;
}

export function buildRestoreAssetVersionPatch(asset: Asset, versionId: string, now: string): AssetPatch | null {
    const version = assetVersionRecords(asset).find((item) => item.id === versionId);
    if (!version) return null;
    const data = restoreVersionData(version);
    if (!data) return null;
    return {
        kind: version.kind,
        coverUrl: version.kind === "image" ? readString(data.dataUrl) || version.coverUrl : version.coverUrl,
        data,
        metadata: {
            ...(asset.metadata || {}),
            currentAssetVersionId: version.id,
            assetVersionRestoredAt: now,
        },
    } as AssetPatch;
}

export function assetVersionMediaSummary(version: AssetVersionRecord) {
    if (version.kind === "text") return `${readString(version.data.content).length} 字`;
    const mimeType = readString(version.data.mimeType);
    const bytes = typeof version.data.bytes === "number" ? version.data.bytes : 0;
    const size = formatBytes(bytes);
    if (version.kind === "audio") return [size, mimeType].filter(Boolean).join(" · ");
    const width = typeof version.data.width === "number" ? version.data.width : 0;
    const height = typeof version.data.height === "number" ? version.data.height : 0;
    return [`${width}x${height}`, size, mimeType].filter(Boolean).join(" · ");
}

function snapshotFromAsset(asset: Asset, versionNumber: number, createdAt: string, changeNote: string, source: AssetVersionRecord["source"]): AssetVersionRecord {
    return {
        id: buildVersionId(versionNumber, createdAt),
        versionNumber,
        kind: asset.kind,
        title: asset.title,
        coverUrl: safeUrl(asset.coverUrl),
        data: snapshotAssetData(asset),
        createdAt,
        changeNote,
        source,
    };
}

function snapshotAssetData(asset: Asset): Record<string, unknown> {
    if (asset.kind === "text") return { content: asset.data.content };
    if (asset.kind === "image")
        return {
            dataUrl: safeUrl(asset.data.dataUrl),
            storageKey: asset.data.storageKey,
            width: asset.data.width,
            height: asset.data.height,
            bytes: asset.data.bytes,
            mimeType: asset.data.mimeType,
        };
    if (asset.kind === "video")
        return {
            url: safeUrl(asset.data.url),
            storageKey: asset.data.storageKey,
            width: asset.data.width,
            height: asset.data.height,
            bytes: asset.data.bytes,
            mimeType: asset.data.mimeType,
        };
    return {
        url: safeUrl(asset.data.url),
        storageKey: asset.data.storageKey,
        bytes: asset.data.bytes,
        mimeType: asset.data.mimeType,
    };
}

function restoreVersionData(version: AssetVersionRecord) {
    if (version.kind === "text") return { content: readString(version.data.content) };
    if (version.kind === "image")
        return {
            dataUrl: readString(version.data.dataUrl),
            storageKey: readString(version.data.storageKey) || undefined,
            width: readNumber(version.data.width),
            height: readNumber(version.data.height),
            bytes: readNumber(version.data.bytes),
            mimeType: readString(version.data.mimeType),
        };
    if (version.kind === "video")
        return {
            url: readString(version.data.url),
            storageKey: readString(version.data.storageKey) || undefined,
            width: readNumber(version.data.width),
            height: readNumber(version.data.height),
            bytes: readNumber(version.data.bytes),
            mimeType: readString(version.data.mimeType),
        };
    return {
        url: readString(version.data.url),
        storageKey: readString(version.data.storageKey) || undefined,
        bytes: readNumber(version.data.bytes),
        mimeType: readString(version.data.mimeType),
    };
}

function assetContentChanged(current: Asset, next: Asset) {
    return assetContentKey(current) !== assetContentKey(next);
}

function assetContentKey(asset: Asset) {
    if (asset.kind === "text") return `text:${asset.data.content}`;
    if (asset.kind === "image") return ["image", asset.data.storageKey || asset.data.dataUrl, asset.data.width, asset.data.height, asset.data.bytes, asset.data.mimeType].join(":");
    if (asset.kind === "video") return ["video", asset.data.storageKey || asset.data.url, asset.data.width, asset.data.height, asset.data.bytes, asset.data.mimeType].join(":");
    return ["audio", asset.data.storageKey || asset.data.url, asset.data.bytes, asset.data.mimeType].join(":");
}

function readVersionRecord(value: unknown): AssetVersionRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Partial<AssetVersionRecord>;
    if (!record.id || !record.versionNumber || !record.kind || !record.data || typeof record.data !== "object" || Array.isArray(record.data)) return null;
    if (record.kind !== "text" && record.kind !== "image" && record.kind !== "video" && record.kind !== "audio") return null;
    return {
        id: record.id,
        versionNumber: record.versionNumber,
        kind: record.kind,
        title: typeof record.title === "string" ? record.title : "",
        coverUrl: typeof record.coverUrl === "string" ? record.coverUrl : "",
        data: record.data as Record<string, unknown>,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
        changeNote: typeof record.changeNote === "string" ? record.changeNote : "",
        source: record.source === "manual_edit" ? "manual_edit" : "initial",
    };
}

function latestVersionNumber(values: unknown[]) {
    return values.reduce<number>((max, value) => {
        const record = readVersionRecord(value);
        return Math.max(max, record?.versionNumber || 0);
    }, 0);
}

function stripCurrentFlag(version: AssetVersionRecord): AssetVersionRecord {
    const { isCurrent: _isCurrent, ...rest } = version;
    return rest;
}

function buildVersionId(versionNumber: number, createdAt: string) {
    return `asset-version-${versionNumber}-${createdAt.replace(/[^0-9a-z]/gi, "") || Date.now()}`;
}

function safeUrl(value: string | undefined) {
    if (!value || value.startsWith("data:")) return "";
    return value;
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatBytes(bytes: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
