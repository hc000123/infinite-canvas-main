import type { PromptAgentIntent, PromptAgentOutput } from "./canvas-prompt-agent-types.ts";

export function promptAgentIntentLabel(intent?: PromptAgentIntent) {
    if (intent === "video_prompt") return "视频提示词";
    if (intent === "storyboard_prompt") return "分镜提示词";
    if (intent === "rewrite_prompt") return "提示词改写";
    if (intent === "chat") return "对话";
    return "图片提示词";
}

export function promptAgentOutputLabel(kind: PromptAgentOutput["kind"]) {
    if (kind === "video_prompt") return "视频提示词";
    if (kind === "storyboard_prompt") return "分镜提示词";
    return "图片提示词";
}

export function formatPromptAgentOutputText(output: PromptAgentOutput) {
    if (output.kind === "storyboard_prompt") {
        return [
            output.title,
            output.summary ? `概述：${output.summary}` : "",
            ...output.shots.flatMap((shot, index) => [
                `${index + 1}. ${shot.title}`,
                `画面：${shot.visual}`,
                shot.action ? `动作：${shot.action}` : "",
                shot.shotSize ? `景别：${shot.shotSize}` : "",
                shot.camera ? `运镜：${shot.camera}` : "",
                shot.emotion ? `情绪：${shot.emotion}` : "",
                shot.videoPrompt ? `视频提示词：${shot.videoPrompt}` : "",
            ]),
        ]
            .filter(Boolean)
            .join("\n");
    }

    if (output.kind === "video_prompt") {
        return [
            output.title,
            output.subject ? `主体：${output.subject}` : "",
            output.action ? `动作：${output.action}` : "",
            output.shotSize ? `景别：${output.shotSize}` : "",
            output.camera ? `运镜：${output.camera}` : "",
            output.rhythm ? `节奏：${output.rhythm}` : "",
            output.duration ? `时长：${output.duration}` : "",
            output.ratio ? `比例：${output.ratio}` : "",
            output.referenceUsage ? `参考图：${output.referenceUsage}` : "",
            `最终提示词：${output.finalPrompt}`,
        ]
            .filter(Boolean)
            .join("\n");
    }

    return [
        output.title,
        output.subject ? `主体：${output.subject}` : "",
        output.style ? `风格：${output.style}` : "",
        output.composition ? `构图：${output.composition}` : "",
        output.lighting ? `光线：${output.lighting}` : "",
        output.material ? `材质：${output.material}` : "",
        output.color ? `色彩：${output.color}` : "",
        output.referenceUsage ? `参考图：${output.referenceUsage}` : "",
        output.negativePrompt ? `负面约束：${output.negativePrompt}` : "",
        `最终提示词：${output.finalPrompt}`,
    ]
        .filter(Boolean)
        .join("\n");
}
