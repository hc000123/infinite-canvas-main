import { uploadMediaFile } from "../../../services/file-storage";
import { uploadImage } from "../../../services/image-storage";
import type { AssetWriteInput } from "../../../stores/use-asset-store";
import { readAssetPackage } from "./asset-transfer";
import { assetFileKind, isImportableAssetFile } from "./asset-utils";
import { importedImageAssetInput, importedMediaAssetInput, importedPackageAssetInput } from "./asset-import-payloads";

type AddAssetOnce = (asset: AssetWriteInput) => Promise<string>;
export type AssetImportResult = {
    count: number;
    assetIds: string[];
};

export function importableAssetFiles(files?: FileList | File[]) {
    return Array.from(files || []).filter((file) => isImportableAssetFile(file));
}

export async function importAssetFileList(files: File[], options: { folderId?: string; addAssetOnce: AddAssetOnce }): Promise<AssetImportResult> {
    const assetIds: string[] = [];
    for (const file of files) {
        assetIds.push(...(await importAssetFile(file, options)));
    }
    return { count: assetIds.length, assetIds };
}

export async function importAssetFile(file: File, { folderId, addAssetOnce }: { folderId?: string; addAssetOnce: AddAssetOnce }): Promise<string[]> {
    const fileKind = assetFileKind(file);
    if (fileKind === "image") {
        const image = await uploadImage(file);
        return [await addAssetOnce(importedImageAssetInput(file.name, image, folderId))];
    }
    if (fileKind === "video" || fileKind === "audio") {
        const media = await uploadMediaFile(file, fileKind);
        return [await addAssetOnce(importedMediaAssetInput(file.name, fileKind, media, folderId))];
    }

    const importedAssets = await readAssetPackage(file);
    const assetIds: string[] = [];
    for (const asset of importedAssets) {
        assetIds.push(await addAssetOnce(importedPackageAssetInput(asset, folderId)));
    }
    return assetIds;
}
