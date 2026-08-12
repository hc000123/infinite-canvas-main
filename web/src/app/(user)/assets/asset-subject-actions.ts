import type { UploadedImage } from "../../../services/image-storage.ts";
import type { AssetBinding, AssetSubject, AssetWorkbenchImage } from "../../../stores/use-asset-store.ts";

export function subjectCandidateImageInput(scope: { subjectId: string; variantId: string }, image: UploadedImage, fileName: string): Omit<AssetWorkbenchImage, "createdAt" | "id"> {
    return { subjectId: scope.subjectId, variantId: scope.variantId, role: "candidate", source: "upload", title: fileName, dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

export function subjectVoiceBinding(subject: Pick<AssetSubject, "id" | "projectId">, audioAssetId: string) {
    const assetBinding: AssetBinding = { projectId: subject.projectId, subjectId: subject.id, category: "character", variantName: "角色声音", allEpisodes: true, episodeIds: [] };
    return { subjectPatch: { voiceAssetId: audioAssetId }, assetPatch: { assetBinding } };
}
