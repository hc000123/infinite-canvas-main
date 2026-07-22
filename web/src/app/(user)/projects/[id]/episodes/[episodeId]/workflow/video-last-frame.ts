import type { UploadedImage } from "@/services/image-storage";

export function selectLastFrameSource(input: { lastFrameUrl?: string; videoUrl?: string }) {
    if (input.lastFrameUrl) return { kind: "provider" as const, url: input.lastFrameUrl };
    if (input.videoUrl) return { kind: "video" as const, url: input.videoUrl };
    return null;
}

export async function archiveVideoLastFrame(input: { lastFrameUrl?: string; videoUrl?: string }): Promise<UploadedImage | null> {
    const { uploadImage } = await import("@/services/image-storage");
    const source = selectLastFrameSource(input);
    if (!source) return null;
    if (source.kind === "provider") {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error("视频尾帧读取失败");
        return uploadImage(await response.blob());
    }
    return uploadImage(await extractLastFrame(source.url));
}

function extractLastFrame(url: string) {
    return new Promise<Blob>((resolve, reject) => {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.crossOrigin = "anonymous";
        video.onerror = () => reject(new Error("本地视频无法提取尾帧"));
        video.onloadedmetadata = () => { video.currentTime = Math.max(0, video.duration - 0.08); };
        video.onseeked = () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("尾帧编码失败")), "image/jpeg", 0.92);
        };
        video.src = url;
    });
}
