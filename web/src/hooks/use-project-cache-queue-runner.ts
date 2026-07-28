"use client";

import { useEffect, useRef } from "react";

import { uploadProjectCacheFile } from "@/services/api/project-cache";
import { resolveProjectCacheBlob } from "@/services/project-cache-archive";
import { useProjectCacheQueueStore } from "@/stores/use-project-cache-queue-store";

export function useProjectCacheQueueRunner(token?: string) {
    const items = useProjectCacheQueueStore((state) => state.items);
    const running = useRef(false);

    useEffect(() => {
        if (!token || running.current || !items.some((item) => item.status === "queued")) return;
        running.current = true;
        void (async () => {
            while (true) {
                const queued = useProjectCacheQueueStore.getState().items.filter((entry) => entry.status === "queued");
                if (!queued.length) break;
                for (const item of queued) {
                    useProjectCacheQueueStore.getState().markRetrying(item.id);
                    try {
                        const blob = await resolveProjectCacheBlob(item.kind, item.storageKey);
                        if (!blob) throw new Error("本地缓存文件不存在");
                        await uploadProjectCacheFile(blob, item.filename, item.context, token);
                        useProjectCacheQueueStore.getState().remove(item.id);
                    } catch (error) {
                        useProjectCacheQueueStore.getState().markFailed(item.id, error instanceof Error ? error.message : "缓存失败");
                    }
                }
            }
        })().finally(() => {
            running.current = false;
        });
    }, [items, token]);
}
