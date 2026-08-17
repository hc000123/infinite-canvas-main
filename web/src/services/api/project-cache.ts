import axios from "axios";
import { saveAs } from "file-saver";

import type { ProjectCacheContext, ProjectCacheMediaKind } from "../project-cache-context";
import { apiDelete, apiGet, apiPost, apiPostForm } from "./request";

export type ProjectCacheFile = {
    id: string;
    relativePath: string;
    originalName: string;
    mimeType: string;
    sha256: string;
    kind: ProjectCacheMediaKind;
    category: ProjectCacheContext["category"];
    createdAt: string;
    bytes: number;
    context: ProjectCacheContext;
    status: "ready" | "missing";
    favorite: boolean;
};

export type ProjectCacheSummary = { projectId: string; projectName: string; status: "active" | "deleted"; path: string; updatedAt: string; bytes: number; fileCount: number; missingCount: number };
export type ProjectCacheManifest = { formatVersion: number; projectId: string; projectName: string; status: "active" | "deleted"; createdAt: string; updatedAt: string; files: ProjectCacheFile[] };
export type UserProjectCacheList = { rootPath: string; totalBytes: number; totalFiles: number; pendingCount: number; projects: ProjectCacheSummary[] };
export type ProjectCachePackageSnapshot = { project: unknown; canvases: unknown[]; scripts: unknown; storyboards: unknown; assets: unknown[] };
export type ProjectCacheFileBlob = { blob: Blob; mimeType: string; filename: string };

export function uploadProjectCacheFile(file: Blob, filename: string, context: ProjectCacheContext, token: string) {
    const form = new FormData();
    form.append("file", file, filename);
    form.append("context", JSON.stringify(context));
    return apiPostForm<{ file: ProjectCacheFile; projectPath: string; manifestPath: string }>("/api/v1/project-cache/files", form, token);
}

export function listProjectCaches(token: string) {
    return apiGet<UserProjectCacheList>("/api/v1/project-cache/projects", undefined, token);
}

export function getProjectCache(projectId: string, token: string) {
    return apiGet<{ manifest: ProjectCacheManifest; summary: ProjectCacheSummary }>(`/api/v1/project-cache/projects/${encodeURIComponent(projectId)}`, undefined, token);
}

export async function fetchProjectCacheFileBlob(fileId: string, token: string, signal?: AbortSignal): Promise<ProjectCacheFileBlob> {
    try {
        const response = await axios.get<Blob>(`/api/v1/project-cache/files/${encodeURIComponent(fileId)}`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: "blob",
            signal,
        });
        const mimeType = headerString(response.headers["content-type"]) || response.data.type || "application/octet-stream";
        if (mimeType.includes("application/json")) {
            let message = "缓存文件不存在或已被移除";
            try {
                const payload = JSON.parse(await response.data.text()) as { msg?: string };
                message = payload.msg || message;
            } catch {
                // Keep the safe fallback when the error body is not valid JSON.
            }
            throw new Error(message);
        }
        return {
            blob: response.data,
            mimeType,
            filename: cacheFileName(headerString(response.headers["content-disposition"]) || undefined, fileId),
        };
    } catch (error) {
        if (axios.isCancel(error)) throw error;
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 401) throw new Error("登录状态已失效，请重新登录");
            if (error.response?.status === 404) throw new Error("缓存文件不存在或已被移除");
        }
        if (error instanceof Error) throw error;
        throw new Error("缓存文件读取失败，请确认服务已启动");
    }
}

export function updateProjectCacheStatus(projectId: string, status: "active" | "deleted", token: string) {
    return apiPost<ProjectCacheManifest>(`/api/v1/project-cache/projects/${encodeURIComponent(projectId)}/status`, { status }, token);
}

export function moveProjectCacheFile(fileId: string, context: ProjectCacheContext, token: string) {
    return apiPost(`/api/v1/project-cache/files/${encodeURIComponent(fileId)}/move`, context, token);
}

export function setProjectCacheFileFavorite(fileId: string, favorite: boolean, token: string) {
    return apiPost<ProjectCacheFile>(`/api/v1/project-cache/files/${encodeURIComponent(fileId)}/favorite`, { favorite }, token);
}

export function deleteProjectCacheFile(fileId: string, token: string) {
    return apiDelete<boolean>(`/api/v1/project-cache/files/${encodeURIComponent(fileId)}`, token);
}

export function deleteProjectCache(projectId: string, token: string) {
    return apiDelete<boolean>(`/api/v1/project-cache/projects/${encodeURIComponent(projectId)}`, token);
}

export function preflightProjectCachePackage(projectId: string, token: string) {
    return apiPost<{ missing: string[]; fileCount: number; bytes: number }>(`/api/v1/project-cache/projects/${encodeURIComponent(projectId)}/package/preflight`, {}, token);
}

export async function downloadProjectCachePackage(projectId: string, snapshot: ProjectCachePackageSnapshot, continueOnMissing: boolean, token: string, filename: string) {
    const response = await axios.post(`/api/v1/project-cache/projects/${encodeURIComponent(projectId)}/package`, { snapshot, continueOnMissing }, { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" });
    const signature = new Uint8Array(await response.data.slice(-22, -18).arrayBuffer());
    if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x05 || signature[3] !== 0x06) {
        throw new Error("项目包生成失败，下载内容不完整");
    }
    saveAs(response.data, filename);
}

export async function downloadProjectCacheSelection(projectId: string, fileIds: string[], token: string, filename: string) {
    const response = await axios.post(`/api/v1/project-cache/projects/${encodeURIComponent(projectId)}/package/selection`, { fileIds }, { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" });
    const signature = new Uint8Array(await response.data.slice(-22, -18).arrayBuffer());
    if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x05 || signature[3] !== 0x06) {
        throw new Error("所选缓存下载失败，下载内容不完整");
    }
    saveAs(response.data, filename);
}

function cacheFileName(disposition: string | undefined, fallback: string) {
    const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded);
        } catch {
            return encoded;
        }
    }
    return disposition?.match(/filename="([^"]+)"/i)?.[1] || disposition?.match(/filename=([^;]+)/i)?.[1]?.trim() || fallback;
}

function headerString(value: unknown) {
    if (Array.isArray(value)) return value.join(", ");
    return typeof value === "string" ? value : "";
}
