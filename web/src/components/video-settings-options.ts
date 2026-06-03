export type VideoTaskModeOption = "generate" | "edit" | "extend";
export type VideoReferenceImageModeOption = "reference" | "first_frame" | "first_last_frame";

export const seedanceTaskModeOptions: Array<{ value: VideoTaskModeOption; label: string }> = [
    { value: "generate", label: "生成新视频" },
    { value: "edit", label: "编辑视频" },
    { value: "extend", label: "延长视频" },
];

export const seedanceReferenceImageModeOptions: Array<{ value: VideoReferenceImageModeOption; label: string }> = [
    { value: "reference", label: "普通参考" },
    { value: "first_frame", label: "作为首帧" },
    { value: "first_last_frame", label: "首尾帧" },
];

export function visibleSeedanceTaskModeOptions(hasSourceVideo: boolean) {
    return hasSourceVideo ? seedanceTaskModeOptions : seedanceTaskModeOptions.filter((option) => option.value === "generate");
}

export function resolveSeedanceTaskModeForSource(mode: string | undefined, hasSourceVideo: boolean): VideoTaskModeOption {
    if (!hasSourceVideo) return "generate";
    return mode === "edit" || mode === "extend" ? mode : "generate";
}

export function shouldShowSeedanceImageControl(mode: string | undefined, hasSourceVideo: boolean) {
    return resolveSeedanceTaskModeForSource(mode, hasSourceVideo) === "generate";
}

export function visibleSeedanceReferenceImageMode(mode: string | undefined): VideoReferenceImageModeOption {
    return mode === "first_frame" || mode === "first_last_frame" ? mode : "reference";
}

export function isSeedanceVideoProtocol(config?: { videoProtocol?: string } | boolean) {
    if (typeof config === "boolean") return config;
    return config?.videoProtocol === "volcengine-ark";
}
