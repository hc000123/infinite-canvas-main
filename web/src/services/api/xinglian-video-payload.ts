export type XinglianVideoPayloadInput = {
    model: string;
    prompt: string;
    duration: string;
    ratio: string;
    generateAudio: boolean;
    images: string[];
    videos: string[];
    audios: string[];
};

export function buildXinglianVideoPayload(input: XinglianVideoPayloadInput) {
    return {
        model: input.model,
        prompt: input.prompt,
        duration: Number(input.duration),
        ratio: input.ratio,
        generate_audio: input.generateAudio,
        ...(input.images.length ? { images: input.images } : {}),
        ...(input.videos.length ? { videos: input.videos } : {}),
        ...(input.audios.length ? { audios: input.audios } : {}),
    };
}
