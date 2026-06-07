"use client";

import { requestEdit, requestGeneration, type LocalImageTaskTrace } from "@/services/api/image";
import type { AiTaskLedger, AiTaskTrace } from "@/services/api/ai-task-trace";
import { requestVideoGeneration, type NormalizedVideoTask, type VideoGenerationReferences } from "@/services/api/video";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { useLocalAiTaskLogStore } from "@/stores/use-local-ai-task-log-store";
import type { ReferenceImage } from "@/types/image";

export type CanvasUploadedImage = Awaited<ReturnType<typeof uploadImage>> & { aiTask?: AiTaskLedger };

export type CanvasUploadedVideo = Awaited<ReturnType<typeof uploadMediaFile>> & { aiTask?: AiTaskLedger };

export async function runCanvasImageGeneration(config: AiConfig, prompt: string, references: ReferenceImage[], trace?: AiTaskTrace, localTask?: LocalImageTaskTrace): Promise<CanvasUploadedImage> {
    const image = references.length ? await requestEdit(config, prompt, references, trace, localTask).then((items) => items[0]) : await requestGeneration(config, prompt, trace, localTask).then((items) => items[0]);
    const uploaded = (await uploadImage(image.dataUrl)) as CanvasUploadedImage;
    uploaded.aiTask = image.aiTask;
    if (image.localAiTaskId) updateLocalImageResultSize(image.localAiTaskId, uploaded.width, uploaded.height);
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

function updateLocalImageResultSize(localAiTaskId: string, width: number, height: number) {
    const resultImageSize = `${width}x${height}`;
    useLocalAiTaskLogStore.getState().updateTask(localAiTaskId, {
        resultImageSize,
        outputSummary: `图片已生成，返回尺寸 ${resultImageSize}`,
    });
}
