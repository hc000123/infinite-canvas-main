import type { PromptAgentAction, PromptAgentExecutionPlan, PromptAgentExecutionStep, PromptAgentRunMode, PromptAgentTool } from "./canvas-prompt-agent-types.ts";
import type { PromptAgentPlan } from "./canvas-prompt-agent-types.ts";

const promptAgentTools: PromptAgentTool[] = [
    {
        actionType: "node.create_image_config",
        label: "创建图片配置",
        permission: "write_canvas",
        description: "把图片提示词写成可继续生图的配置节点。",
        requiresConfirmation: true,
    },
    {
        actionType: "node.create_video_config",
        label: "创建视频配置",
        permission: "write_canvas",
        description: "把视频提示词写成视频配置节点，不触发视频生成。",
        requiresConfirmation: true,
    },
    {
        actionType: "node.create_storyboard_group",
        label: "创建分镜文本",
        permission: "write_canvas",
        description: "把分镜拆成画布文本节点。",
        requiresConfirmation: true,
    },
    {
        actionType: "image.generate",
        label: "调用生图",
        permission: "generate_image",
        description: "使用当前图片模型生成图片。",
        requiresConfirmation: true,
        costly: true,
    },
];

export function promptAgentToolForAction(actionType: string) {
    return promptAgentTools.find((tool) => tool.actionType === actionType) || null;
}

export function buildPromptAgentExecutionPlan(plan: PromptAgentPlan, mode: PromptAgentRunMode = "ask"): PromptAgentExecutionPlan {
    const steps = plan.actions.map((action) => buildExecutionStep(action, mode));
    const readyCount = steps.filter((step) => step.status === "ready").length;
    const confirmCount = steps.filter((step) => step.status === "confirm").length;
    const blockedCount = steps.filter((step) => step.status === "blocked").length;
    return {
        mode,
        summary: executionSummary(mode, steps.length, readyCount, confirmCount, blockedCount),
        steps,
        readyCount,
        confirmCount,
        blockedCount,
    };
}

function buildExecutionStep(action: PromptAgentAction, mode: PromptAgentRunMode): PromptAgentExecutionStep {
    const tool = promptAgentToolForAction(action.type);
    if (!tool) {
        return {
            id: `${action.id}-unsupported`,
            actionId: action.id,
            actionType: action.type,
            outputId: action.outputId,
            title: action.title || "未知工具",
            toolLabel: "未知工具",
            permission: "write_canvas",
            status: "blocked",
            requiresConfirmation: true,
            note: "当前版本不支持这个工具。",
        };
    }

    return {
        id: action.id,
        actionId: action.id,
        actionType: action.type,
        outputId: action.outputId,
        title: action.title || tool.label,
        toolLabel: tool.label,
        permission: tool.permission,
        status: stepStatus(tool, mode),
        requiresConfirmation: tool.requiresConfirmation,
        note: stepNote(tool, mode),
    };
}

function stepStatus(tool: PromptAgentTool, mode: PromptAgentRunMode) {
    if (mode === "review") return "blocked";
    if (mode === "ask") return "confirm";
    return tool.permission === "write_canvas" && !tool.costly ? "ready" : "confirm";
}

function stepNote(tool: PromptAgentTool, mode: PromptAgentRunMode) {
    if (mode === "review") return "审核模式只检查内容，不写入画布或调用生成。";
    if (mode === "ask") return "问答模式下需要手动确认后执行。";
    if (tool.permission === "generate_image") return "生图会消耗额度，自动模式下仍需手动确认。";
    return "自动模式下可作为连续画布写入计划执行。";
}

function executionSummary(mode: PromptAgentRunMode, total: number, readyCount: number, confirmCount: number, blockedCount: number) {
    if (!total) return mode === "review" ? "审核模式：当前只输出检查建议，没有可执行动作。" : "当前没有可执行动作。";
    if (mode === "review") return `审核模式：仅检查提示词质量，已阻止 ${blockedCount} 个写入或生成动作。`;
    if (mode === "auto") return `自动模式：${readyCount} 个画布动作可连续执行，${confirmCount} 个生成或高成本动作仍需确认。`;
    return `问答模式：${total} 个动作等待确认后执行。`;
}
