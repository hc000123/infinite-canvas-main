import type { CanvasAssistantReference } from "../types.ts";
import type { PromptAgentAction, PromptAgentComposerIntent, PromptAgentIntent, PromptAgentOutput, PromptAgentParseResult, PromptAgentPlan, PromptAgentRunMode, PromptAgentSkillPackId, PromptAgentStoryboardShot } from "./canvas-prompt-agent-types.ts";
import { buildPromptAgentSkillContext } from "./canvas-prompt-agent-skills.ts";

const intents = new Set(["image_prompt", "video_prompt", "storyboard_prompt", "rewrite_prompt", "chat"]);
const outputKinds = new Set(["image_prompt", "video_prompt", "storyboard_prompt"]);
const actionTypes = new Set(["node.create_image_config", "node.create_video_config", "node.create_storyboard_group", "image.generate"]);

export function parsePromptAgentPlan(text: string): PromptAgentParseResult {
    const jsonText = extractJsonObject(text);
    if (!jsonText) return { ok: false, text };

    try {
        const parsed = JSON.parse(jsonText);
        const plan = normalizePromptAgentPlan(parsed);
        return plan ? { ok: true, plan, text } : { ok: false, text, error: "Agent JSON 结构不完整" };
    } catch (error) {
        return { ok: false, text, error: error instanceof Error ? error.message : "Agent JSON 解析失败" };
    }
}

export function extractJsonObject(text: string) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced?.startsWith("{") && fenced.endsWith("}")) return fenced;
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    return start >= 0 && end > start ? trimmed.slice(start, end + 1) : "";
}

export function isPromptAgentRequest(text: string, intent: PromptAgentComposerIntent = "auto") {
    if (intent !== "auto" && intent !== "chat") return true;
    return /(提示词|prompt|分镜|镜头|视频|seedance|生图|图片|图像|角色|场景|道具|氛围|构图|运镜|景别|改写|优化|扩写)/i.test(text);
}

export function buildPromptAgentSystemContext({
    agentMode = "ask",
    intent,
    skillPackId = "auto",
    selectedReferences,
    workflowContext,
}: {
    agentMode?: PromptAgentRunMode;
    intent: PromptAgentComposerIntent;
    skillPackId?: PromptAgentSkillPackId;
    selectedReferences: CanvasAssistantReference[];
    workflowContext?: string;
}) {
    const referenceLines = selectedReferences.map((item, index) => `参考 ${index + 1}：${item.title}；类型 ${item.type}；${item.text ? `文本：${item.text.slice(0, 300)}` : item.dataUrl ? "包含图片" : "无内容预览"}`);
    const skillContext = buildPromptAgentSkillContext(intent, skillPackId);
    return [
        "你是画布提示词 Agent，负责把用户需求整理成可落地到画布的图片、视频或分镜提示词。",
        "只输出一个 JSON 对象，不要输出 Markdown，不要解释 JSON 之外的内容。",
        "JSON 结构必须是：{ intent, reply, outputs, actions }。",
        "intent 只能是 image_prompt、video_prompt、storyboard_prompt、rewrite_prompt、chat。",
        "图片输出 kind=image_prompt，必须包含 id、title、finalPrompt，可包含 subject、style、composition、lighting、material、color、referenceUsage、negativePrompt。",
        "视频输出 kind=video_prompt，必须包含 id、title、finalPrompt，可包含 subject、action、camera、shotSize、rhythm、duration、ratio、referenceUsage。",
        "分镜输出 kind=storyboard_prompt，必须包含 id、title、shots；每个 shot 必须包含 id、title、visual，可包含 action、shotSize、camera、emotion、videoPrompt。",
        "actions 只能使用 node.create_image_config、node.create_video_config、node.create_storyboard_group、image.generate。",
        "第一版不允许直接生成视频；视频需求只能创建视频配置节点。",
        "视频第一版只创建配置节点，不自动触发视频生成。",
        "写入画布或生图会由界面二次确认，你只需要给出 actions。",
        promptAgentModeInstruction(agentMode),
        intent !== "auto" ? `用户选择的意图：${intent}` : "用户意图：自动判断。",
        skillContext,
        referenceLines.length ? ["当前引用：", ...referenceLines].join("\n") : "当前没有选中引用。",
        workflowContext ? `\n${workflowContext}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

function promptAgentModeInstruction(agentMode: PromptAgentRunMode) {
    if (agentMode === "auto") {
        return "Agent 运行模式：自动模式。你可以给出可连续执行的画布写入 actions，但生图仍需用户确认，视频生成仍然禁止自动触发。";
    }
    if (agentMode === "review") {
        return "Agent 运行模式：审核模式。只做提示词、分镜、镜头连续性和合规检查，actions 必须为空数组。";
    }
    return "Agent 运行模式：问答模式。先解释判断和下一步计划，所有 actions 都等待用户确认。";
}

function normalizePromptAgentPlan(value: unknown): PromptAgentPlan | null {
    if (!isRecord(value)) return null;
    const intent = intents.has(String(value.intent)) ? (String(value.intent) as PromptAgentIntent) : "chat";
    const reply = readString(value.reply) || "已整理提示词。";
    const outputs = Array.isArray(value.outputs) ? value.outputs.map(normalizeOutput).filter((item): item is PromptAgentOutput => Boolean(item)) : [];
    const outputIds = new Set(outputs.map((item) => item.id));
    const actions = Array.isArray(value.actions) ? value.actions.map((item) => normalizeAction(item, outputIds)).filter((item): item is PromptAgentAction => Boolean(item)) : [];
    if (!outputs.length && intent !== "chat") return null;
    return { intent, reply, outputs, actions };
}

function normalizeOutput(value: unknown): PromptAgentOutput | null {
    if (!isRecord(value) || !outputKinds.has(String(value.kind))) return null;
    const kind = String(value.kind);
    const id = readString(value.id) || `${kind}-${Date.now().toString(36)}`;
    const title = readString(value.title) || outputKindLabel(kind);

    if (kind === "storyboard_prompt") {
        const shots = Array.isArray(value.shots) ? value.shots.map(normalizeShot).filter((item): item is PromptAgentStoryboardShot => Boolean(item)) : [];
        if (!shots.length) return null;
        return {
            id,
            kind,
            title,
            summary: readString(value.summary),
            finalPrompt: readString(value.finalPrompt),
            shots,
        };
    }

    const finalPrompt = readString(value.finalPrompt);
    if (!finalPrompt) return null;
    if (kind === "video_prompt") {
        return {
            id,
            kind,
            title,
            finalPrompt,
            subject: readString(value.subject),
            action: readString(value.action),
            camera: readString(value.camera),
            shotSize: readString(value.shotSize),
            rhythm: readString(value.rhythm),
            duration: readString(value.duration),
            ratio: readString(value.ratio),
            referenceUsage: readString(value.referenceUsage),
        };
    }
    return {
        id,
        kind: "image_prompt",
        title,
        finalPrompt,
        subject: readString(value.subject),
        style: readString(value.style),
        composition: readString(value.composition),
        lighting: readString(value.lighting),
        material: readString(value.material),
        color: readString(value.color),
        referenceUsage: readString(value.referenceUsage),
        negativePrompt: readString(value.negativePrompt),
    };
}

function normalizeShot(value: unknown): PromptAgentStoryboardShot | null {
    if (!isRecord(value)) return null;
    const visual = readString(value.visual);
    if (!visual) return null;
    return {
        id: readString(value.id) || `shot-${Date.now().toString(36)}`,
        title: readString(value.title) || "镜头",
        visual,
        action: readString(value.action),
        shotSize: readString(value.shotSize),
        camera: readString(value.camera),
        emotion: readString(value.emotion),
        videoPrompt: readString(value.videoPrompt),
    };
}

function normalizeAction(value: unknown, outputIds: Set<string>): PromptAgentAction | null {
    if (!isRecord(value) || !actionTypes.has(String(value.type))) return null;
    const outputId = readString(value.outputId);
    if (!outputId || !outputIds.has(outputId)) return null;
    return {
        id: readString(value.id) || `action-${Date.now().toString(36)}`,
        type: String(value.type) as PromptAgentAction["type"],
        outputId,
        title: readString(value.title),
    } as PromptAgentAction;
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function outputKindLabel(kind: string) {
    if (kind === "video_prompt") return "视频提示词";
    if (kind === "storyboard_prompt") return "分镜提示词";
    return "图片提示词";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
