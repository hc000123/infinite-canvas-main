import type { PromptAgentAction, PromptAgentExecutionPlan, PromptAgentExecutionState, PromptAgentExecutionStep, PromptAgentExecutionStepStatus, PromptAgentRunMode, PromptAgentTool } from "./canvas-prompt-agent-types.ts";
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

export function buildPromptAgentExecutionPlan(plan: PromptAgentPlan, mode: PromptAgentRunMode = "ask", state?: PromptAgentExecutionState): PromptAgentExecutionPlan {
    const steps = plan.actions.map((action) => applyRuntimeStepState(buildExecutionStep(action, mode), state));
    const readyCount = steps.filter((step) => step.status === "ready").length;
    const confirmCount = steps.filter((step) => step.status === "confirm").length;
    const blockedCount = steps.filter((step) => step.status === "blocked").length;
    const runningCount = steps.filter((step) => step.status === "running").length;
    const succeededCount = steps.filter((step) => step.status === "succeeded").length;
    const failedCount = steps.filter((step) => step.status === "failed").length;
    const skippedCount = steps.filter((step) => step.status === "skipped").length;
    return {
        mode,
        summary: state?.summary || executionSummary(mode, steps.length, readyCount, confirmCount, blockedCount, runningCount, succeededCount, failedCount, skippedCount),
        steps,
        readyCount,
        confirmCount,
        blockedCount,
        runningCount,
        succeededCount,
        failedCount,
        skippedCount,
    };
}

export function updatePromptAgentExecutionState(
    state: PromptAgentExecutionState | undefined,
    updates: { actionId: string; status: PromptAgentExecutionStepStatus; note?: string }[],
    summary?: string,
    now = new Date().toISOString(),
): PromptAgentExecutionState {
    const steps = { ...(state?.steps || {}) };
    for (const update of updates) {
        steps[update.actionId] = { status: update.status, note: update.note, updatedAt: now };
    }
    return { steps, summary: summary ?? state?.summary, updatedAt: now };
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

function applyRuntimeStepState(step: PromptAgentExecutionStep, state?: PromptAgentExecutionState): PromptAgentExecutionStep {
    const runtime = state?.steps[step.actionId];
    if (!runtime) return step;
    return { ...step, status: runtime.status, note: runtime.note || step.note };
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

function executionSummary(mode: PromptAgentRunMode, total: number, readyCount: number, confirmCount: number, blockedCount: number, runningCount: number, succeededCount: number, failedCount: number, skippedCount: number) {
    if (!total) return mode === "review" ? "审核模式：当前只输出检查建议，没有可执行动作。" : "当前没有可执行动作。";
    if (failedCount) return `执行闭环：${failedCount} 个步骤失败，${succeededCount} 个步骤已完成。`;
    if (runningCount) return `执行闭环：${runningCount} 个步骤正在执行，${succeededCount} 个步骤已完成。`;
    if (succeededCount || skippedCount) return `执行闭环：${succeededCount} 个步骤已完成，${skippedCount} 个步骤已跳过。`;
    if (mode === "review") return `审核模式：仅检查提示词质量，已阻止 ${blockedCount} 个写入或生成动作。`;
    if (mode === "auto") return `自动模式：${readyCount} 个画布动作可连续执行，${confirmCount} 个生成或高成本动作仍需确认。`;
    return `问答模式：${total} 个动作等待确认后执行。`;
}
