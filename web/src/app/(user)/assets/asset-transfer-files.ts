import type { Asset } from "../../../stores/use-asset-store.ts";

export type AssetPackageFileSource = {
    storageKey: string;
    kind: Exclude<Asset["kind"], "text">;
    bytes: number;
    mimeType: string;
};

export function collectAssetPackageFiles(assets: Asset[]): AssetPackageFileSource[] {
    const files: AssetPackageFileSource[] = [];
    const seen = new Set<string>();
    const add = (kind: Asset["kind"], data: unknown) => {
        if (kind === "text") return;
        const record = readRecord(data);
        const storageKey = readString(record?.storageKey);
        if (!storageKey || seen.has(storageKey)) return;
        seen.add(storageKey);
        files.push({ storageKey, kind, bytes: readNumber(record?.bytes), mimeType: readString(record?.mimeType) });
    };
    assets.forEach((asset) => {
        add(asset.kind, asset.data);
        const versions = Array.isArray(asset.metadata?.assetVersions) ? asset.metadata.assetVersions : [];
        versions.forEach((value) => {
            const version = readRecord(value);
            const kind = version?.kind;
            if (kind === "text" || kind === "image" || kind === "video" || kind === "audio") add(kind, version.data);
        });
    });
    return files;
}

export function remapAssetPackageStorageKeys(assets: Asset[], storageKeys: Map<string, string>) {
    return assets.map((asset) => remapStorageKeys(asset, storageKeys) as Asset);
}

function remapStorageKeys(value: unknown, storageKeys: Map<string, string>): unknown {
    if (Array.isArray(value)) return value.map((item) => remapStorageKeys(item, storageKeys));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "storageKey" && typeof item === "string" ? storageKeys.get(item) || item : remapStorageKeys(item, storageKeys)]));
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
