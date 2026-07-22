import { saveAs } from "file-saver";
import { nanoid } from "nanoid";

import { createZip, readZip } from "@/lib/zip";
import { getMediaBlob, setMediaBlob } from "@/services/file-storage";
import { getImageBlob, setImageBlob } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";
import { collectAssetPackageFiles, remapAssetPackageStorageKeys } from "./asset-transfer-files";
import { validateAssetPackageData, type AssetExportFile, type AssetExportItem } from "./asset-transfer-validation";

export async function exportAssets(assets: Asset[]) {
    const files: AssetExportItem[] = [];
    const zipFiles: { name: string; data: BlobPart }[] = [];

    await Promise.all(
        collectAssetPackageFiles(assets).map(async (file) => {
            const blob = file.kind === "image" ? await getImageBlob(file.storageKey) : await getMediaBlob(file.storageKey);
            if (!blob) return;
            const path = `files/${safeFileName(file.storageKey)}.${fileExtension(blob.type || file.mimeType, file.kind)}`;
            files.push({ storageKey: file.storageKey, path, mimeType: blob.type || file.mimeType, bytes: blob.size });
            zipFiles.push({ name: path, data: blob });
        }),
    );

    const data: AssetExportFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), assets, files };
    const zip = await createZip([{ name: "assets.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, "我的素材.zip");
}

export async function readAssetPackage(file: File) {
    const zip = await readZip(file);
    const assetFile = zip.get("assets.json");
    if (!assetFile) throw new Error("素材包缺少 assets.json");
    const data = validateAssetPackageData(JSON.parse(await assetFile.text()));
    const storageKeys = new Map(data.files.map((item) => [item.storageKey, `${item.storageKey.split(":")[0] || (item.mimeType.startsWith("image/") ? "image" : "file")}:${nanoid()}`]));
    await Promise.all(
        data.files.map(async (item) => {
            const blob = zip.get(item.path);
            if (!blob) return;
            const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
            const storageKey = storageKeys.get(item.storageKey) || item.storageKey;
            await (item.storageKey.startsWith("image:") ? setImageBlob(storageKey, typedBlob) : setMediaBlob(storageKey, typedBlob));
        }),
    );
    return remapAssetPackageStorageKeys(data.assets, storageKeys);
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, kind: Asset["kind"]) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("audio/mp4")) return "m4a";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return kind === "image" ? "png" : "bin";
}
