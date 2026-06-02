"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { saveAs } from "file-saver";

import { cacheCanvasMedia } from "@/services/api/media-cache";
import { getMediaBlob, resolveMediaUrl, type UploadedFile } from "@/services/file-storage";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

type CanvasMessage = {
    info: (content: string) => void;
    success: (content: string) => void;
    error: (content: string) => void;
};

export function useCanvasMediaCache({ token, message, setNodes }: { token?: string; message: CanvasMessage; setNodes: Dispatch<SetStateAction<CanvasNodeData[]>> }) {
    const downloadNodeMedia = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) return;
            const content = node.metadata?.content || "";
            if (!content && !node.metadata?.storageKey) return;
            const filename = `canvas-${node.type}-${node.id}.${canvasMediaExtension(node, content)}`;

            if (node.metadata?.cacheUrl) {
                triggerCanvasDownload(node.metadata.cacheUrl, filename);
                message.info(node.metadata.cachePath ? `已写入本地缓存：${node.metadata.cachePath}` : "已触发本地缓存文件下载");
                return;
            }

            if (node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) {
                if (!token) {
                    if (content.startsWith("blob:") || content.startsWith("data:")) triggerCanvasDownload(content, filename);
                    message.info("未登录时仅保存在浏览器本地缓存；登录后可写入项目缓存目录。");
                    return;
                }
                try {
                    const blob = await resolveCanvasMediaBlob(node);
                    if (blob) {
                        const cached = await cacheCanvasMedia(blob, filename, token);
                        setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, cacheUrl: cached.url, cachePath: cached.path, cacheFilename: cached.filename || filename } } : item)));
                        triggerCanvasDownload(cached.url, filename);
                        message.success(`已缓存到本地：${cached.path}`);
                        return;
                    }
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "缓存视频失败");
                    return;
                }
            }

            if (node.type === CanvasNodeType.Image) {
                if (content) {
                    triggerCanvasDownload(content, filename);
                    message.info("已触发下载；如果当前内嵌浏览器无响应，请用系统浏览器打开页面下载。");
                }
                return;
            }

            if (content.startsWith("blob:") || content.startsWith("data:")) {
                triggerCanvasDownload(content, filename);
                message.info("已触发下载；如果当前内嵌浏览器无响应，请用系统浏览器打开页面下载。");
                return;
            }

            try {
                const storedBlob = node.metadata?.storageKey ? await getMediaBlob(node.metadata.storageKey) : null;
                if (storedBlob) {
                    saveAs(storedBlob, filename);
                    return;
                }
                const url = await resolveMediaUrl(node.metadata?.storageKey, content);
                if (!url) return message.error(node.type === CanvasNodeType.Video ? "没有可下载的视频" : "没有可下载的音频");
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Download failed: ${response.status}`);
                saveAs(await response.blob(), filename);
            } catch {
                message.error("下载失败，请稍后重试");
            }
        },
        [message, setNodes, token],
    );

    const cacheUploadedCanvasMedia = useCallback(
        async (file: UploadedFile, filename: string): Promise<Partial<CanvasNodeMetadata>> => {
            if (!token) return {};
            let blob = await getMediaBlob(file.storageKey);
            if (!blob) blob = await fetch(file.url).then((response) => response.blob());
            if (!blob) throw new Error("读取本地媒体失败");
            const cached = await cacheCanvasMedia(blob, filename, token);
            return { cacheUrl: cached.url, cachePath: cached.path, cacheFilename: cached.filename || filename };
        },
        [token],
    );

    return { downloadNodeMedia, cacheUploadedCanvasMedia };
}

function triggerCanvasDownload(url: string, filename: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function resolveCanvasMediaBlob(node: CanvasNodeData) {
    if (node.metadata?.storageKey) {
        const stored = await getMediaBlob(node.metadata.storageKey);
        if (stored) return stored;
    }
    const url = await resolveMediaUrl(node.metadata?.storageKey, node.metadata?.content || "");
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) throw new Error("读取本地媒体失败");
    return response.blob();
}

function canvasMediaExtension(node: CanvasNodeData, content: string) {
    if (node.type === CanvasNodeType.Video) return "mp4";
    if (node.type === CanvasNodeType.Audio) return audioExtension(node.metadata?.mimeType);
    return imageExtension(content);
}

function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

function audioExtension(mimeType?: string) {
    const subtype = mimeType?.split(";")[0]?.split("/")[1]?.toLowerCase();
    if (!subtype || subtype === "mpeg") return "mp3";
    if (subtype === "x-wav") return "wav";
    return subtype;
}
