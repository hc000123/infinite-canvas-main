import { buildWorkflowMatchedImagePatch, buildWorkflowUploadedImagePatch } from "../../../../../assets/workflow-asset-image.ts";
import type { Asset } from "@/stores/use-asset-store";

export function workflowAssetLibraryImportPatch(target: Asset, source: Extract<Asset, { kind: "image" }>) {
    if (source.kind !== "image") throw new Error("请选择图片素材");
    return buildWorkflowMatchedImagePatch(target, source);
}

export async function workflowAssetFileImportPatch(target: Asset, file: Blob, fileName: string) {
    const { uploadImage } = await import("@/services/image-storage");
    return buildWorkflowUploadedImagePatch(target, await uploadImage(file), { fileName });
}

export async function workflowAssetRemoteImportPatch(target: Asset, dataUrl: string, fileName: string) {
    const { uploadImage } = await import("@/services/image-storage");
    return buildWorkflowUploadedImagePatch(target, await uploadImage(dataUrl), { fileName });
}
