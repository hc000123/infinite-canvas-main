import type { Asset } from "../../../stores/use-asset-store.ts";

export type AssetExportFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    assets: Asset[];
    files: AssetExportItem[];
};

export type AssetExportItem = {
    storageKey: string;
    path: string;
    mimeType: string;
    bytes: number;
};

export function validateAssetPackageData(value: unknown): AssetExportFile {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("素材包格式不正确");
    const data = value as Partial<AssetExportFile>;
    if (data.app !== "infinite-canvas" || data.version !== 1 || !Array.isArray(data.assets) || !Array.isArray(data.files)) throw new Error("素材包格式不正确");
    data.assets.forEach(validatePackageAsset);
    data.files.forEach((item) => {
        if (!item || typeof item !== "object") throw new Error("素材包文件清单不正确");
        const file = item as Partial<AssetExportItem>;
        if (!file.storageKey || !file.path || !file.mimeType || typeof file.bytes !== "number") throw new Error("素材包文件清单不正确");
    });
    return data as AssetExportFile;
}

function validatePackageAsset(asset: unknown) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) throw new Error("素材包素材数据不正确");
    const item = asset as Partial<Asset>;
    if (item.kind !== "text" && item.kind !== "image" && item.kind !== "video" && item.kind !== "audio") throw new Error("素材包包含不支持的素材类型");
    if (typeof item.title !== "string" || !item.data || typeof item.data !== "object") throw new Error("素材包素材数据不正确");
}
