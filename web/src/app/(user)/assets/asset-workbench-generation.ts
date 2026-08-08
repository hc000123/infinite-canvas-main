import type { AssetWorkbenchImage } from "../../../stores/use-asset-store.ts";

export function imageRequestMode(referenceCount: number) {
    return referenceCount > 0 ? "edit" : "generation";
}

export function buildGenerationTrace(subject: { id: string; projectId: string; name: string }, variant: { id: string; name: string }, referenceCount: number) {
    return {
        projectId: subject.projectId,
        sourceType: "image_generation" as const,
        sourceId: `${subject.id}:${variant.id}`,
        inputSummary: `${subject.name} / ${variant.name}；参考图 ${referenceCount} 张`,
    };
}

export function buildCandidateImageInput(
    subject: { id: string },
    variant: { id: string; prompt: string },
    stored: { url: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string },
    config: { model: string; quality: string; size: string },
    createdAt: string,
    index: number,
): Omit<AssetWorkbenchImage, "createdAt" | "id"> {
    return {
        subjectId: subject.id,
        variantId: variant.id,
        role: "candidate",
        source: "generated",
        title: `生成候选 ${index}`,
        dataUrl: stored.url,
        storageKey: stored.storageKey,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        mimeType: stored.mimeType,
        generation: { prompt: variant.prompt, model: config.model, quality: config.quality, size: config.size, createdAt },
    };
}
