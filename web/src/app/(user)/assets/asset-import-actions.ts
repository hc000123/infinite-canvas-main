import { uploadMediaFile } from "../../../services/file-storage";
import { uploadImage } from "../../../services/image-storage";
import type { Asset, AssetWriteInput } from "../../../stores/use-asset-store";
import { readAssetPackage } from "./asset-transfer";
import { assetFileKind, isImportableAssetFile } from "./asset-utils";
import { importedImageAssetInput, importedMediaAssetInput, importedPackageAssetInput, uniqueImportedAssetIds } from "./asset-import-payloads";

type AddAssetOnce = (asset: AssetWriteInput) => Promise<string>;
export type AssetImportResult = {
    count: number;
    assetIds: string[];
    skippedTextCount: number;
};

export function partitionPackageAssets(assets: Asset[]) {
    return {
        mediaAssets: assets.filter((asset) => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"),
        skippedTextCount: assets.filter((asset) => asset.kind === "text").length,
    };
}

export function importableAssetFiles(files?: FileList | File[]) {
    return Array.from(files || []).filter((file) => isImportableAssetFile(file));
}

export async function importAssetFileList(files: File[], options: { folderId?: string; projectId?: string; addAssetOnce: AddAssetOnce }): Promise<AssetImportResult> {
    const assetIds: string[] = [];
    let skippedTextCount = 0;
    for (const file of files) {
        const result = await importAssetFile(file, options);
        assetIds.push(...result.assetIds);
        skippedTextCount += result.skippedTextCount;
    }
    const uniqueAssetIds = uniqueImportedAssetIds(assetIds);
    return { count: uniqueAssetIds.length, assetIds: uniqueAssetIds, skippedTextCount };
}

export async function importAssetFile(file: File, { folderId, projectId, addAssetOnce }: { folderId?: string; projectId?: string; addAssetOnce: AddAssetOnce }): Promise<AssetImportResult> {
    const fileKind = assetFileKind(file);
    if (fileKind === "image") {
        const image = await uploadImage(file);
        const assetIds = [await addAssetOnce(importedImageAssetInput(file.name, image, folderId, projectId))];
        return { count: 1, assetIds, skippedTextCount: 0 };
    }
    if (fileKind === "video" || fileKind === "audio") {
        const media = await uploadMediaFile(file, fileKind);
        const assetIds = [await addAssetOnce(importedMediaAssetInput(file.name, fileKind, media, folderId, projectId))];
        return { count: 1, assetIds, skippedTextCount: 0 };
    }

    const { mediaAssets, skippedTextCount } = partitionPackageAssets(await readAssetPackage(file));
    const assetIds: string[] = [];
    for (const asset of mediaAssets) {
        assetIds.push(await addAssetOnce(importedPackageAssetInput(asset, folderId, projectId)));
    }
    const uniqueAssetIds = uniqueImportedAssetIds(assetIds);
    return { count: uniqueAssetIds.length, assetIds: uniqueAssetIds, skippedTextCount };
}
