import type { AiConfig } from "@/stores/use-config-store";
import type { SeedanceImageRoleMode } from "@/services/api/video-reference";

export type PromptReviewLevel = "pass" | "warning" | "risk";
export type PromptReviewIssueType = "space" | "negative" | "positive" | "style" | "motion" | "reference" | "seedance";

export type PromptReviewIssue = {
    type: PromptReviewIssueType;
    level: Exclude<PromptReviewLevel, "pass">;
    title: string;
    description: string;
    suggestion?: string;
};

export type PromptReviewResult = {
    level: PromptReviewLevel;
    summary: string;
    issues: PromptReviewIssue[];
};

export type VideoPromptReviewInput = {
    prompt: string;
    seconds?: string;
    taskMode?: AiConfig["videoTaskMode"];
    referenceImageMode?: SeedanceImageRoleMode;
    imageReferenceCount?: number;
    videoReferenceCount?: number;
    audioReferenceCount?: number;
};

const negativePattern = /不要|不能|没有|避免|禁止|不出现|不要出现|去掉|移除/g;
const actionPattern = /走|跑|看|转身|推近|拉远|摇移|跟拍|抬头|低头|开口|挥手|坐下|站起|移动|飞过|出现|消失/g;
const positiveHintPattern = /人物|主体|角色|场景|镜头|画面|动作|光线|构图|景别|背景|环境|风格|运镜/;
const referenceHintPattern = /参考|图片|图像|视频|音频|首帧|尾帧|源视频|素材|上一段/;

export function reviewVideoPromptBeforeGeneration(input: VideoPromptReviewInput): PromptReviewResult {
    const prompt = input.prompt.trim();
    const issues: PromptReviewIssue[] = [];
    const seconds = Math.floor(Number(input.seconds) || 0);
    const referenceCount = (input.imageReferenceCount || 0) + (input.videoReferenceCount || 0) + (input.audioReferenceCount || 0);
    const negativeMatches = prompt.match(negativePattern) || [];
    const actionMatches = prompt.match(actionPattern) || [];

    if (!prompt || prompt.length < 12 || !positiveHintPattern.test(prompt)) {
        issues.push({
            type: "positive",
            level: "risk",
            title: "主体和画面描述不足",
            description: "提示词缺少明确主体、动作、场景或镜头信息，视频结果容易跑偏。",
            suggestion: "补充谁在什么场景里做什么，以及景别、运镜和光线。",
        });
    }

    if (negativeMatches.length >= 4) {
        issues.push({
            type: "negative",
            level: negativeMatches.length >= 7 ? "risk" : "warning",
            title: "否定表达过多",
            description: `检测到 ${negativeMatches.length} 个否定表达，模型可能难以稳定理解你真正想要的画面。`,
            suggestion: "把“不要什么”改成“画面应该出现什么”的正向描述。",
        });
    }

    if (hasStyleConflict(prompt)) {
        issues.push({
            type: "style",
            level: "warning",
            title: "风格词可能冲突",
            description: "提示词里同时出现写实、动漫、3D、纪实等不同风格方向。",
            suggestion: "保留一个主风格，其他风格改成具体画面质感要求。",
        });
    }

    if (seconds && seconds <= 5 && actionMatches.length >= 6) {
        issues.push({
            type: "motion",
            level: "warning",
            title: "短时长动作过多",
            description: "当前视频时长较短，但提示词包含较多动作或运镜，容易导致镜头混乱。",
            suggestion: "把 5 秒内的动作压缩为 1 到 2 个关键动作。",
        });
    }

    if (referenceCount > 0 && !referenceHintPattern.test(prompt)) {
        issues.push({
            type: "reference",
            level: "warning",
            title: "参考素材用途不明确",
            description: "当前有参考图片、视频或音频输入，但提示词没有说明这些素材的用途。",
            suggestion: "写明图片/视频/音频分别作为角色参考、首帧、尾帧、风格参考或源视频。",
        });
    }

    if ((input.taskMode === "edit" || input.taskMode === "extend") && !seedanceModeMatchesPrompt(input.taskMode, prompt)) {
        issues.push({
            type: "seedance",
            level: "warning",
            title: "任务模式和提示词表达不匹配",
            description: input.taskMode === "edit" ? "当前是编辑视频模式，但提示词没有明确替换、添加、移除或重绘目标。" : "当前是延长视频模式，但提示词没有明确延续、向前或向后扩展的意图。",
            suggestion: input.taskMode === "edit" ? "补充要编辑的区域、对象和期望变化。" : "补充希望从源视频向前或向后延续的画面内容。",
        });
    }

    const level = highestPromptReviewLevel(issues);
    return {
        level,
        summary: level === "pass" ? "提示词自审通过，可以继续生成。" : level === "risk" ? `发现 ${issues.length} 个问题，其中包含高风险项，建议先修改后再生成。` : `发现 ${issues.length} 个提醒项，建议确认后再生成。`,
        issues,
    };
}

export function shouldRunVideoPromptReview(config: Pick<AiConfig, "videoPromptReviewEnabled">) {
    return config.videoPromptReviewEnabled !== "false";
}

function highestPromptReviewLevel(issues: PromptReviewIssue[]): PromptReviewLevel {
    if (issues.some((issue) => issue.level === "risk")) return "risk";
    if (issues.length) return "warning";
    return "pass";
}

function hasStyleConflict(prompt: string) {
    const realistic = /写实|真实|纪实|电影感/.test(prompt);
    const stylized = /动漫|二次元|卡通|3D|三维|游戏/.test(prompt);
    return realistic && stylized;
}

function seedanceModeMatchesPrompt(taskMode: AiConfig["videoTaskMode"], prompt: string) {
    if (taskMode === "edit") return /编辑|修改|替换|添加|移除|删除|重绘|补画|换成/.test(prompt);
    if (taskMode === "extend") return /延长|延续|续写|继续|接着|向前|向后|上一段|下一段/.test(prompt);
    return true;
}
