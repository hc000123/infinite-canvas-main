import type { UploadedFile } from "../../../services/file-storage.ts";
import type { UploadedImage } from "../../../services/image-storage.ts";
import type { Asset, AssetWriteInput } from "../../../stores/use-asset-store.ts";
import { buildProjectLibraryMetadata } from "./asset-project-library.ts";

export function importedImageAssetInput(fileName: string, image: UploadedImage, folderId?: string, projectId?: string): AssetWriteInput {
    return {
        kind: "image",
        title: importedFileTitle(fileName),
        coverUrl: image.url,
        folderId,
        tags: [],
        source: "本地导入",
        note: "",
        metadata: buildProjectLibraryMetadata({ source: "import" }, projectId || "", new Date().toISOString()),
        data: {
            dataUrl: image.url,
            storageKey: image.storageKey,
            width: image.width,
            height: image.height,
            bytes: image.bytes,
            mimeType: image.mimeType,
        },
    };
}

export function importedMediaAssetInput(fileName: string, kind: "video" | "audio", media: UploadedFile, folderId?: string, projectId?: string): AssetWriteInput {
    return {
        kind,
        title: importedFileTitle(fileName),
        coverUrl: "",
        folderId,
        tags: [],
        source: "本地导入",
        note: "",
        metadata: buildProjectLibraryMetadata({ source: "import" }, projectId || "", new Date().toISOString()),
        data:
            kind === "video"
                ? {
                      url: media.url,
                      storageKey: media.storageKey,
                      width: media.width || 1280,
                      height: media.height || 720,
                      bytes: media.bytes,
                      mimeType: media.mimeType,
                  }
                : {
                      url: media.url,
                      storageKey: media.storageKey,
                      bytes: media.bytes,
                      mimeType: media.mimeType,
                  },
    } as AssetWriteInput;
}

export function importedPackageAssetInput(asset: Asset, folderId?: string, projectId?: string): AssetWriteInput {
    const payload = { ...asset } as Record<string, unknown>;
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;
    if (folderId) payload.folderId = folderId;
    else delete payload.folderId;
    if (projectId || asset.metadata) payload.metadata = buildProjectLibraryMetadata(asset.metadata, projectId || "", new Date().toISOString());
    else delete payload.metadata;
    return payload as AssetWriteInput;
}

export function assetImportSuccessMessage(count: number, folderName?: string) {
    return `已导入 ${count} 个资产${folderName ? `到「${folderName}」` : ""}`;
}

export function uniqueImportedAssetIds(ids: string[]) {
    return Array.from(new Set(ids));
}

function importedFileTitle(filename: string) {
    return filename.replace(/\.[^.]+$/, "") || "未命名素材";
}
