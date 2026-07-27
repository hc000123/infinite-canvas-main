"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import axios from "axios";
import { saveAs } from "file-saver";

import { uploadProjectCacheFile } from "@/services/api/project-cache";
import { getMediaBlob, resolveMediaUrl, type UploadedFile } from "@/services/file-storage";
import { archiveLocalMediaToProjectCache } from "@/services/project-cache-archive";
import { projectCacheContextFromGeneration } from "@/services/project-cache-context";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { canvasMediaDownloadFilename } from "../utils/canvas-media-download";
import type { CanvasEpisodeContext } from "../utils/canvas-episode-context";

type CanvasMessage = {
    info: (content: string) => void;
    success: (content: string) => void;
    error: (content: string) => void;
};

export function useCanvasMediaCache({
    token,
    message,
    canvasId,
    canvasTitle,
    projectId,
    projectTitle,
    episodeContext,
    getNodes,
    setNodes,
}: {
    token?: string;
    message: CanvasMessage;
    canvasId: string;
    canvasTitle: string;
    projectId: string;
    projectTitle: string;
    episodeContext?: CanvasEpisodeContext;
    getNodes: () => CanvasNodeData[];
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
}) {
    const downloadNodeMedia = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) return;
            const content = node.metadata?.content || "";
            if (!content && !node.metadata?.storageKey) return;
            const filename = canvasMediaDownloadFilename(node, canvasTitle, getNodes());

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
                    const blob = await resolveCanvasMediaBlob(node, token);
                    if (blob) {
                        const context = nodeProjectCacheContext(node, { canvasId, canvasTitle, projectId, projectTitle, episodeContext });
                        const cached = await uploadProjectCacheFile(blob, filename, context, token);
                        setNodes((prev) =>
                            prev.map((item) =>
                                item.id === node.id
                                    ? {
                                          ...item,
                                          metadata: {
                                              ...item.metadata,
                                              cachePath: `${cached.projectPath}/${cached.file.relativePath}`,
                                              cacheFilename: filename,
                                              projectCache: { fileId: cached.file.id, relativePath: cached.file.relativePath, status: "ready" },
                                          },
                                      }
                                    : item,
                            ),
                        );
                        saveAs(blob, filename);
                        message.success(`已缓存到本地：${cached.projectPath}`);
                        return;
                    }
                } catch (error) {
                    message.error(readCanvasDownloadError(error, node.type === CanvasNodeType.Video ? "下载视频失败" : "下载音频失败"));
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
        [canvasId, canvasTitle, episodeContext, getNodes, message, projectId, projectTitle, setNodes, token],
    );

    const cacheUploadedCanvasMedia = useCallback(
        async (file: UploadedFile, filename: string, node?: CanvasNodeData): Promise<Partial<CanvasNodeMetadata>> => {
            if (!token) return {};
            const kind = file.mimeType.startsWith("audio/") ? "audio" : "video";
            const context = node
                ? nodeProjectCacheContext(node, { canvasId, canvasTitle, projectId, projectTitle, episodeContext })
                : projectCacheContextFromGeneration({
                      canvasId,
                      canvasName: canvasTitle,
                      episodeId: episodeContext?.episodeId,
                      episodeName: episodeContext?.episodeTitle,
                      freeCanvas: !episodeContext?.episodeId,
                      kind,
                      metadata: {},
                      projectId,
                      projectName: projectTitle,
                      source: "canvas",
                  });
            try {
                const cached = await archiveLocalMediaToProjectCache({ id: `canvas:${file.storageKey}`, storageKey: file.storageKey, kind, filename, context, token });
                return { cachePath: `${cached.projectPath}/${cached.file.relativePath}`, cacheFilename: filename, projectCache: { fileId: cached.file.id, relativePath: cached.file.relativePath, status: "ready" as const } };
            } catch (error) {
                return { cacheFilename: filename, projectCache: { status: "pending" as const, error: error instanceof Error ? error.message : "缓存失败" } };
            }
        },
        [canvasId, canvasTitle, episodeContext, projectId, projectTitle, token],
    );

    return { downloadNodeMedia, cacheUploadedCanvasMedia };
}

function nodeProjectCacheContext(node: CanvasNodeData, scope: { canvasId: string; canvasTitle: string; projectId: string; projectTitle: string; episodeContext?: CanvasEpisodeContext }) {
    const kind = node.type === CanvasNodeType.Audio ? "audio" : node.type === CanvasNodeType.Video ? "video" : "image";
    return projectCacheContextFromGeneration({
        canvasId: scope.canvasId || String(node.metadata?.canvasSource?.canvasId || ""),
        canvasName: scope.canvasTitle,
        episodeId: node.metadata?.episodeId || scope.episodeContext?.episodeId,
        episodeName: node.metadata?.episodeTitle || scope.episodeContext?.episodeTitle,
        freeCanvas: !scope.episodeContext?.episodeId,
        kind,
        metadata: node.metadata || {},
        nodeId: node.id,
        projectId: scope.projectId,
        projectName: scope.projectTitle,
        source: "canvas",
    });
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

async function resolveCanvasMediaBlob(node: CanvasNodeData, token?: string) {
    if (node.metadata?.storageKey) {
        const stored = await getMediaBlob(node.metadata.storageKey);
        if (stored) return stored;
    }
    const url = await resolveMediaUrl(node.metadata?.storageKey, node.metadata?.content || "");
    if (!url) return null;
    if (isRemoteHttpUrl(url)) return fetchVideoThroughProxy(url, token);
    const response = await fetch(url);
    if (!response.ok) throw new Error("读取本地媒体失败");
    return response.blob();
}

async function fetchVideoThroughProxy(videoUrl: string, token?: string) {
    if (!token) throw new Error("请先登录后再下载远程视频");
    const response = await axios.post<Blob>(
        "/api/v1/proxy/video-download",
        { video_url: videoUrl },
        {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            responseType: "blob",
            timeout: 300_000,
        },
    );
    await assertCanvasDownloadBlob(response.data);
    return response.data;
}

async function assertCanvasDownloadBlob(blob: Blob) {
    const type = blob.type.toLowerCase();
    if (!type.includes("json") && !type.includes("text")) return;
    let payload: { code?: number; msg?: string; message?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; message?: string; error?: { message?: string } };
    } catch {
        throw new Error("远程视频下载失败");
    }
    throw new Error(payload.msg || payload.error?.message || payload.message || "远程视频下载失败");
}

function isRemoteHttpUrl(url: string) {
    return /^https?:\/\//i.test(url);
}

function readCanvasDownloadError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") return `${fallback}：请求超时`;
        return error.response?.status ? `${fallback}：${error.response.status}` : `${fallback}：网络连接失败`;
    }
    if (error instanceof Error && error.message && error.message !== "Failed to fetch") {
        if (error.message.includes("仅支持缓存视频或音频文件")) return `${fallback}：远程视频地址返回的不是视频，可能已过期`;
        return error.message;
    }
    return fallback;
}
