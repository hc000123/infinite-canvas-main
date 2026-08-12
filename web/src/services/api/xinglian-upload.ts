export type XinglianUploadType = "image" | "video" | "audio";

export type XinglianUploadSignInput = {
    model: string;
    filename: string;
    contentType: string;
    size: number;
    type: XinglianUploadType;
};

export type XinglianUploadSign = {
    method: string;
    uploadUrl: string;
    publicUrl: string;
    key: string;
    expiresAt?: string;
    headers?: Record<string, string>;
};

export type XinglianUploadCompleteInput = {
    model: string;
    key: string;
    filename: string;
    type: XinglianUploadType;
};

export type XinglianUploadComplete = {
    recorded: boolean;
    key: string;
    url: string;
    thumbnailUrl?: string;
};

type XinglianUploadDependencies = {
    sign: (input: XinglianUploadSignInput) => Promise<XinglianUploadSign>;
    put: (uploadUrl: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;
    complete: (input: XinglianUploadCompleteInput) => Promise<XinglianUploadComplete>;
};

export async function uploadXinglianBlob(input: { model: string; filename: string; type: XinglianUploadType; blob: Blob }, dependencies: XinglianUploadDependencies) {
    const contentType = input.blob.type || "application/octet-stream";
    const sign = await dependencies.sign({ model: input.model, filename: input.filename, contentType, size: input.blob.size, type: input.type });
    const uploaded = await dependencies.put(sign.uploadUrl, { method: sign.method || "PUT", headers: sign.headers, body: input.blob });
    if (!uploaded.ok) throw new Error(`星链云 OSS 上传失败：HTTP ${uploaded.status}`);
    const complete = await dependencies.complete({ model: input.model, key: sign.key, filename: input.filename, type: input.type });
    const url = complete.url || sign.publicUrl;
    if (!url.startsWith("https://")) throw new Error("星链云 OSS 未返回 HTTPS 素材地址");
    return url;
}
