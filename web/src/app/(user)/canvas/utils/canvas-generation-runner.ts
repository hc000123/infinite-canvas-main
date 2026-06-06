"use client";

import { requestEdit, requestGeneration } from "@/services/api/image";
import type { AiTaskLedger, AiTaskTrace } from "@/services/api/ai-task-trace";
import { requestVideoGeneration, type NormalizedVideoTask, type VideoGenerationReferences } from "@/services/api/video";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export type CanvasUploadedImage = Awaited<ReturnType<typeof uploadImage>> & { aiTask?: AiTaskLedger };

export type CanvasUploadedVideo = Awaited<ReturnType<typeof uploadMediaFile>> & { aiTask?: AiTaskLedger };

export async function runCanvasImageGeneration(config: AiConfig, prompt: string, references: ReferenceImage[], trace?: AiTaskTrace): Promise<CanvasUploadedImage> {
    const image = references.length ? await requestEdit(config, prompt, references, trace).then((items) => items[0]) : await requestGeneration(config, prompt, trace).then((items) => items[0]);
    const uploaded = (await uploadImage(image.dataUrl)) as CanvasUploadedImage;
    uploaded.aiTask = image.aiTask;
    return uploaded;
}

export async function runCanvasVideoGeneration(config: AiConfig, prompt: string, references: VideoGenerationReferences, onStatus?: (task: NormalizedVideoTask) => void, trace?: AiTaskTrace) {
    let completedTask: NormalizedVideoTask | null = null;
    const video = (await uploadMediaFile(
        await requestVideoGeneration(config, prompt, references, {
            onStatus: (task) => {
                completedTask = task;
                onStatus?.(task);
            },
            trace,
        }),
        "video",
    )) as CanvasUploadedVideo;
    const finalTask = completedTask as NormalizedVideoTask | null;
    video.aiTask = finalTask
        ? {
              aiTaskId: finalTask.aiTaskId,
              upstreamTaskId: finalTask.upstreamTaskId || finalTask.id,
              aiTaskStatus: finalTask.aiTaskStatus || finalTask.status,
              aiTaskCredits: finalTask.aiTaskCredits,
              creditLogId: finalTask.creditLogId,
              creditsRefunded: finalTask.creditsRefunded,
              refundedAt: finalTask.refundedAt,
              finishedAt: finalTask.finishedAt,
              errorMessage: finalTask.errorMessage,
          }
        : undefined;
    return { video, completedTask };
}
