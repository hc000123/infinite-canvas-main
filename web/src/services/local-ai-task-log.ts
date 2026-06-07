import type { AiConfig } from "@/stores/use-config-store";
import { estimateTextCost, normalizeBillingNote } from "@/services/ai-local-billing";
import { useLocalAiTaskLogStore, type LocalAiTaskSourceType } from "@/stores/use-local-ai-task-log-store";

type LocalTextTaskInput = {
    projectId: string;
    episodeId?: string;
    canvasId?: string;
    sourceType?: string;
    sourceId?: string;
    agentKind?: string;
    agentId?: string;
    agentName?: string;
    workflowId?: string;
    stageId?: string;
    model?: string;
    provider?: string;
    inputSummary?: string;
};

export function startLocalTextTask(config: AiConfig, input: LocalTextTaskInput) {
    if (config.channelMode !== "local") return undefined;
    const model = (input.model || config.textModel || config.model || "").trim();
    return useLocalAiTaskLogStore.getState().startTask({
        projectId: input.projectId,
        episodeId: input.episodeId,
        canvasId: input.canvasId,
        sourceType: normalizeTextSourceType(input.sourceType),
        sourceId: input.sourceId || input.stageId || input.agentId || "text-run",
        agentKind: input.agentKind || input.agentId || input.agentName,
        workflowId: input.workflowId,
        stageId: input.stageId,
        provider: input.provider || "openai-compatible",
        model: model || "unknown",
        channelMode: config.channelMode,
        requestType: "text",
        inputSummary: input.inputSummary || "本地直连文本调用",
        outputSummary: "本地直连文本调用中",
        estimatedCost: estimateTextCost(model, null),
        billingNote: normalizeBillingNote({ requestType: "text" }),
    });
}

export function completeLocalTextTask(id: string | undefined, output: string) {
    if (!id) return;
    useLocalAiTaskLogStore.getState().completeTask(id, {
        outputSummary: summarizeText(output) || "文本草案已生成",
        estimatedCost: null,
        billingNote: normalizeBillingNote({ requestType: "text", extra: "当前响应未返回 token usage，无法估算文本费用。" }),
    });
}

export function failLocalTextTask(id: string | undefined, errorMessage: string) {
    if (!id) return;
    useLocalAiTaskLogStore.getState().failTask(id, errorMessage, {
        outputSummary: "文本调用失败",
        estimatedCost: null,
        billingNote: normalizeBillingNote({ requestType: "text", extra: "当前响应未返回 token usage，无法估算文本费用。" }),
    });
}

export function summarizeLocalTaskText(value: string, maxLength = 180) {
    return summarizeText(value, maxLength) || "暂无摘要";
}

function normalizeTextSourceType(value?: string): LocalAiTaskSourceType {
    return value === "agent_text_run" ? "agent_text_run" : "workflow_text_stage";
}

function summarizeText(value: string, maxLength = 180) {
    const text = value.replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
