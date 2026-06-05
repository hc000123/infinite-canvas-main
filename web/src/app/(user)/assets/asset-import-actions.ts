import { uploadMediaFile } from "../../../services/file-storage";
import { uploadImage } from "../../../services/image-storage";
import type { AssetWriteInput } from "../../../stores/use-asset-store";
import { readAssetPackage } from "./asset-transfer";
import { assetFileKind, isImportableAssetFile } from "./asset-utils";
import { importedImageAssetInput, importedMediaAssetInput, importedPackageAssetInput } from "./asset-import-payloads";

type AddAssetOnce = (asset: AssetWriteInput) => Promise<string>;

export function importableAssetFiles(files?: FileList | File[]) {
    return Array.from(files || []).filter((file) => isImportableAssetFile(file));
}

export async function importAssetFileList(files: File[], options: { folderId?: string; addAssetOnce: AddAssetOnce }) {
    let count = 0;
    for (const file of files) {
        count += await importAssetFile(file, options);
    }
    return count;
}

export async function importAssetFile(file: File, { folderId, addAssetOnce }: { folderId?: string; addAssetOnce: AddAssetOnce }) {
    const fileKind = assetFileKind(file);
    if (fileKind === "image") {
        const image = await uploadImage(file);
        await addAssetOnce(importedImageAssetInput(file.name, image, folderId));
        return 1;
    }
    if (fileKind === "video" || fileKind === "audio") {
        const media = await uploadMediaFile(file, fileKind);
        await addAssetOnce(importedMediaAssetInput(file.name, fileKind, media, folderId));
        return 1;
    }

    const importedAssets = await readAssetPackage(file);
    for (const asset of importedAssets) {
        await addAssetOnce(importedPackageAssetInput(asset, folderId));
    }
    return importedAssets.length;
}
