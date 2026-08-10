const OMNI_V2V_MODEL = "omni-fast-v2v";
const OMNI_V2V_MAX_VIDEO_BYTES = 15 * 1024 * 1024;

export function isOmniV2VModel(model: string) {
    return model.trim().toLowerCase() === OMNI_V2V_MODEL;
}

export function appendOmniV2VVideoInput(body: FormData, model: string, videos: Array<File | string>) {
    if (!isOmniV2VModel(model)) return;
    if (videos.length !== 1) throw new Error(`Omni V2V 需要且只支持 1 个输入视频，当前为 ${videos.length} 个`);
    const video = videos[0];
    if (typeof video === "string") {
        validateVideoURL(video);
        body.append("input_video_url[]", video);
        return;
    }
    if (video.type !== "video/mp4" && !video.name.toLowerCase().endsWith(".mp4")) throw new Error("Omni V2V 输入视频必须是 MP4");
    if (video.size > OMNI_V2V_MAX_VIDEO_BYTES) throw new Error("Omni V2V 输入视频不能超过 15 MB");
    body.append("input_video[]", video, video.name);
}

function validateVideoURL(value: string) {
    if (value.startsWith("data:")) {
        const match = /^data:video\/mp4;base64,([a-z\d+/]*={0,2})$/i.exec(value);
        if (!match) throw new Error("Omni V2V 输入视频必须是 MP4 data URI");
        const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
        const bytes = Math.floor((match[1].length * 3) / 4) - padding;
        if (bytes > OMNI_V2V_MAX_VIDEO_BYTES) throw new Error("Omni V2V 输入视频不能超过 15 MB");
        return;
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Omni V2V 输入视频必须是公网 MP4 URL 或 MP4 data URI");
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) throw new Error("Omni V2V 输入视频必须是公网 MP4 URL 或 MP4 data URI");
}
