"use client";

import { useEffect, useState } from "react";

import { fetchProjectCacheFileBlob, type ProjectCacheFileBlob } from "@/services/api/project-cache";
import { useUserStore } from "@/stores/use-user-store";

export function useCacheFileObjectUrl(fileId: string, enabled: boolean) {
    const token = useUserStore((state) => state.token);
    const [result, setResult] = useState<ProjectCacheFileBlob>();
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setResult(undefined);
        setUrl("");
        setLoading(false);
        setError("");
        if (!enabled || !fileId) return;
        if (!token) {
            setError("登录状态不可用，请重新登录");
            return;
        }

        const controller = new AbortController();
        let objectUrl = "";
        setLoading(true);
        void fetchProjectCacheFileBlob(fileId, token, controller.signal)
            .then((value) => {
                objectUrl = URL.createObjectURL(value.blob);
                setResult(value);
                setUrl(objectUrl);
            })
            .catch((reason) => {
                if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "缓存文件读取失败");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [enabled, fileId, token]);

    return { ...result, url, loading, error };
}
