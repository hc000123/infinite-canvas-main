import { nanoid } from "nanoid";

import type { ChatCompletionMessage } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { useLocalAiTaskLogStore } from "@/stores/use-local-ai-task-log-store";
import type { ReferenceImage } from "@/types/image";
import type { CanvasAssistantMessage, CanvasAssistantReference, CanvasConnection, CanvasNodeData } from "../types";
import { buildAssistantCanvasActionPreview, validateAssistantCanvasAction, type AssistantCanvasAction } from "./canvas-assistant-actions";

export function buildDebugAssistantActions(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedNodeIds: string[]): AssistantCanvasAction[] {
    const selectedIds = selectedNodeIds.filter((id) => nodes.some((node) => node.id === id));
    const anchor = nodes.find((node) => node.id === selectedIds[0]) || nodes[0];
    const base = anchor ? { x: anchor.position.x + anchor.width + 96, y: anchor.position.y } : undefined;
    const drafts: AssistantCanvasAction[] =
        selectedIds.length >= 2
            ? [
                  {
                      id: nanoid(),
                      kind: "write",
                      type: "connection.create",
                      reason: "开发调试：连接两个已选节点，验证连线预览和确认应用流程",
                      payload: { fromNodeId: selectedIds[0], toNodeId: selectedIds[1] },
                  },
              ]
            : [
                  {
                      id: nanoid(),
                      kind: "write",
                      type: "node.create_text",
                      reason: "开发调试：创建文本节点，验证动作预览不会自动修改画布",
                      payload: { title: "助手文本预览", content: "这是助手动作预览创建的文本节点。", position: base },
                  },
                  {
                      id: nanoid(),
                      kind: "write",
                      type: "node.create_config",
                      reason: "开发调试：创建视频配置节点，验证配置节点预览",
                      payload: { mode: "video", title: "助手配置预览", position: base ? { x: base.x, y: base.y + 280 } : undefined },
                  },
              ];

    return drafts.map((action) => {
        const validation = validateAssistantCanvasAction(action, nodes, connections);
        return validation.ok ? { ...validation.action, preview: buildAssistantCanvasActionPreview(validation.action, nodes, connections) } : action;
    });
}

export async function buildAssistantReferenceImages(refs: CanvasAssistantReference[]): Promise<ReferenceImage[]> {
    return Promise.all(refs.filter((item) => item.dataUrl).map(async (item) => ({ id: item.id, name: `${item.title}.png`, type: "image/png", dataUrl: await imageToDataUrl(item), storageKey: item.storageKey })));
}

export async function buildChatMessages(messages: CanvasAssistantMessage[], systemContext?: string): Promise<ChatCompletionMessage[]> {
    const chatMessages: ChatCompletionMessage[] = await Promise.all(
        messages.map(async (message, index) => {
            if (message.role === "assistant") return { role: "assistant" as const, content: message.text };
            if (index !== messages.length - 1) return { role: "user" as const, content: message.text };
            const refs = message.references || [];
            return {
                role: "user" as const,
                content: [
                    ...refs.flatMap((item) => (item.text ? [{ type: "text" as const, text: item.text }] : [])),
                    { type: "text", text: message.text },
                    ...(await Promise.all(refs.filter((item) => item.dataUrl).map(async (item) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl(item) } })))),
                ],
            };
        }),
    );
    return systemContext?.trim() ? [{ role: "system", content: systemContext.trim() }, ...chatMessages] : chatMessages;
}

export function updateLocalImageResultSize(localAiTaskId: string, width: number, height: number) {
    const resultImageSize = `${width}x${height}`;
    useLocalAiTaskLogStore.getState().updateTask(localAiTaskId, {
        resultImageSize,
        outputSummary: `图片已生成，返回尺寸 ${resultImageSize}`,
    });
}

export function summarizeLocalImageInput(prompt: string, referenceCount: number) {
    const text = prompt.replace(/\s+/g, " ").trim();
    const summary = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    return referenceCount ? `${summary || "生图提示词为空"}；参考图 ${referenceCount} 张` : summary || "生图提示词为空";
}
