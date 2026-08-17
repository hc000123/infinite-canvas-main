import { inferVideoReferenceMode, type SeedanceImageRole, type VideoReferenceMode } from "./video-reference.ts";

export type DreaminaVideoPayloadInput = {
    model: string;
    prompt: string;
    duration: string;
    ratio: string;
    resolution: string;
    mode: VideoReferenceMode;
    transitionPrompts?: string[];
    images: Array<{ file: File; role: SeedanceImageRole }>;
    videos: File[];
    audios: File[];
};

export function buildDreaminaVideoPayload(input: DreaminaVideoPayloadInput): FormData {
    const mode = input.mode === "auto" ? inferDreaminaMode(input) : input.mode;
    const transitionPrompts = input.transitionPrompts?.map((prompt) => prompt.trim()) || [];
    validateDreaminaMedia(mode, input, transitionPrompts);
    const body = new FormData();
    body.append("model", input.model);
    body.append("prompt", input.prompt);
    body.append("duration", input.duration);
    body.append("ratio", input.ratio);
    body.append("resolution", input.resolution);
    body.append("dreamina_mode", mode);
    if (mode === "multiframe2video" && input.images.length > 2) transitionPrompts.forEach((prompt) => body.append("transition_prompt[]", prompt));
    input.images.forEach(({ file, role }) => {
        body.append("input_image[]", file, file.name);
        body.append("input_image_role[]", role);
    });
    input.videos.forEach((file) => body.append("input_video[]", file, file.name));
    input.audios.forEach((file) => body.append("input_audio[]", file, file.name));
    return body;
}

function inferDreaminaMode(input: DreaminaVideoPayloadInput) {
    const roles = input.images.map((image) => image.role);
    const imageRoleMode = roles[0] === "first_frame" && roles[1] === "last_frame" ? "first_last_frame" : roles[0] === "first_frame" ? "first_frame" : "reference";
    return inferVideoReferenceMode({ imageCount: input.images.length, videoCount: input.videos.length, audioCount: input.audios.length, imageRoleMode });
}

function validateDreaminaMedia(mode: Exclude<VideoReferenceMode, "auto">, input: DreaminaVideoPayloadInput, transitionPrompts: string[]) {
    const { images, videos, audios } = input;
    if (mode === "text2video" && (images.length || videos.length || audios.length)) throw new Error("文生视频不能携带参考素材");
    if (mode === "image2video" && (images.length !== 1 || videos.length || audios.length)) throw new Error("图生视频需要恰好 1 张图片");
    if (mode === "frames2video" && (images.length !== 2 || videos.length || audios.length)) throw new Error("首尾帧需要恰好 2 张图片");
    if (mode === "multiframe2video" && (images.length < 2 || images.length > 20 || videos.length || audios.length)) throw new Error("多帧故事需要 2-20 张图片，且不能包含视频或音频");
    if (mode === "multiframe2video" && images.length > 2 && (transitionPrompts.length !== images.length - 1 || transitionPrompts.some((prompt) => !prompt))) throw new Error(`多帧故事需要分别填写 ${images.length - 1} 段转场提示词`);
    if (mode !== "multimodal2video") return;
    if (input.model === "seedance2.5") {
        if (!images.length && !videos.length && !audios.length) throw new Error("全能参考至少添加一种参考素材");
        if (images.length > 30 || videos.length > 10 || audios.length > 10 || images.length + videos.length + audios.length > 50) throw new Error("Seedance 2.5 全能参考最多支持 30 张图片、10 个视频、10 个音频且素材总数不超过 50 个");
        return;
    }
    if (!images.length && !videos.length) throw new Error("全能参考至少添加图片或视频");
    if (images.length > 9 || videos.length > 3 || audios.length > 3 || images.length + videos.length + audios.length > 12) throw new Error("全能参考最多支持 9 张图片、3 个视频、3 个音频且素材总数不超过 12 个");
}
