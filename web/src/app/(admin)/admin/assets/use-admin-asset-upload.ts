"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { uploadAdminAssetMedia } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export type AssetUploadEntry = {
    id: string;
    file: File;
    projectId: string;
    folderId: string;
    status: "waiting" | "uploading" | "success" | "error";
    error?: string;
};

export function useAdminAssetUpload() {
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [queue, setQueue] = useState<AssetUploadEntry[]>([]);

    const updateEntry = useCallback((id: string, patch: Partial<AssetUploadEntry>) => {
        setQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    }, []);

    const uploadEntry = useCallback(async (entry: AssetUploadEntry) => {
        updateEntry(entry.id, { status: "uploading", error: undefined });
        try {
            await uploadAdminAssetMedia(token, entry.projectId, entry.folderId, entry.file);
            updateEntry(entry.id, { status: "success" });
        } catch (error) {
            updateEntry(entry.id, { status: "error", error: error instanceof Error ? error.message : "上传失败" });
        }
    }, [token, updateEntry]);

    const enqueue = useCallback(async (files: File[], projectId: string, folderId: string) => {
        const entries = files.map((file, index) => ({ id: `${Date.now()}-${index}-${file.name}`, file, projectId, folderId, status: "waiting" as const }));
        if (!entries.length) return;
        setQueue((items) => [...items, ...entries]);
        let cursor = 0;
        const worker = async () => {
            while (cursor < entries.length) {
                const entry = entries[cursor++];
                await uploadEntry(entry);
            }
        };
        await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
        await queryClient.invalidateQueries({ queryKey: ["admin", "assets"] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "asset-projects"] });
    }, [queryClient, uploadEntry]);

    const retry = useCallback(async (id: string) => {
        const entry = queue.find((item) => item.id === id);
        if (!entry) return;
        await uploadEntry(entry);
        await queryClient.invalidateQueries({ queryKey: ["admin", "assets"] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "asset-projects"] });
    }, [queryClient, queue, uploadEntry]);

    return {
        queue,
        enqueue,
        retry,
        clearFinished: () => setQueue((items) => items.filter((item) => item.status === "waiting" || item.status === "uploading" || item.status === "error")),
    };
}
