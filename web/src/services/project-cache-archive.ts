"use client";

import { getMediaBlob } from "./file-storage";
import { getImageBlob } from "./image-storage";
import { uploadProjectCacheFile } from "./api/project-cache";
import type { ProjectCacheContext, ProjectCacheMediaKind } from "./project-cache-context";
import { useProjectCacheQueueStore } from "@/stores/use-project-cache-queue-store";

export async function archiveLocalMediaToProjectCache(input: { id: string; storageKey: string; kind: ProjectCacheMediaKind; filename: string; context: ProjectCacheContext; token: string }) {
    const blob = await resolveProjectCacheBlob(input.kind, input.storageKey);
    if (!blob) throw new Error("本地缓存文件不存在");
    try {
        return await uploadProjectCacheFile(blob, input.filename, input.context, input.token);
    } catch (error) {
        useProjectCacheQueueStore.getState().enqueue({ id: input.id, storageKey: input.storageKey, kind: input.kind, filename: input.filename, context: input.context });
        throw error;
    }
}

export function resolveProjectCacheBlob(kind: ProjectCacheMediaKind, storageKey: string) {
    return kind === "image" ? getImageBlob(storageKey) : getMediaBlob(storageKey);
}
