"use client";

import { requestEdit, requestGeneration } from "@/services/api/image";
import { requestVideoGeneration, type NormalizedVideoTask, type VideoGenerationReferences } from "@/services/api/video";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export async function runCanvasImageGeneration(config: AiConfig, prompt: string, references: ReferenceImage[]) {
    const image = references.length ? await requestEdit(config, prompt, references).then((items) => items[0]) : await requestGeneration(config, prompt).then((items) => items[0]);
    return uploadImage(image.dataUrl);
}

export async function runCanvasVideoGeneration(config: AiConfig, prompt: string, references: VideoGenerationReferences, onStatus?: (task: NormalizedVideoTask) => void) {
    let completedTask: NormalizedVideoTask | null = null;
    const video = await uploadMediaFile(
        await requestVideoGeneration(config, prompt, references, {
            onStatus: (task) => {
                completedTask = task;
                onStatus?.(task);
            },
        }),
        "video",
    );
    return { video, completedTask };
}
