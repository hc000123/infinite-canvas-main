import { apiPostForm } from "./request";

export type CanvasMediaCacheResult = {
    url: string;
    path: string;
    mimeType: string;
    bytes: number;
    filename: string;
};

export function cacheCanvasMedia(file: Blob, filename: string, token?: string) {
    const form = new FormData();
    form.append("file", file, filename);
    return apiPostForm<CanvasMediaCacheResult>("/api/v1/canvas/media-cache", form, token);
}
