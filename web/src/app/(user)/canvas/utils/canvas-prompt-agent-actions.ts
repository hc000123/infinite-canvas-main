import type { CanvasConnection, CanvasNodeData, Position } from "../types.ts";
import { buildAssistantCanvasActionPreview, validateAssistantCanvasAction, type AssistantCanvasAction, type AssistantCanvasSuggestionResult } from "./canvas-assistant-actions.ts";
import type { PromptAgentAction, PromptAgentImageOutput, PromptAgentOutput, PromptAgentPlan, PromptAgentStoryboardOutput, PromptAgentVideoOutput } from "./canvas-prompt-agent-types.ts";

export function buildPromptAgentCanvasActions({
    connections,
    nodes,
    plan,
    selectedNodeIds,
}: {
    connections: CanvasConnection[];
    nodes: CanvasNodeData[];
    plan: PromptAgentPlan;
    selectedNodeIds: string[];
}): AssistantCanvasSuggestionResult {
    const drafts = plan.actions.flatMap((action) => promptAgentActionToCanvasActions(action, plan.outputs, nodes, selectedNodeIds));
    if (!drafts.length) return null;

    const actions: AssistantCanvasAction[] = [];
    let nextNodes = nodes;
    let nextConnections = connections;
    for (const draft of drafts) {
        const validation = validateAssistantCanvasAction(draft, nextNodes, nextConnections);
        if (!validation.ok || validation.action.kind !== "write") return null;
        const preview = buildAssistantCanvasActionPreview(validation.action, nextNodes, nextConnections);
        const action = { ...validation.action, preview };
        actions.push(action);
        nextNodes = [...nextNodes, ...(preview.createdNodes || [])];
        nextConnections = [...nextConnections, ...(preview.createdConnections || [])];
    }

    return actions.length ? { actions, reason: plan.reply || "提示词 Agent 建议修改画布" } : null;
}

function promptAgentActionToCanvasActions(action: PromptAgentAction, outputs: PromptAgentOutput[], nodes: CanvasNodeData[], selectedNodeIds: string[]): AssistantCanvasAction[] {
    const output = outputs.find((item) => item.id === action.outputId);
    if (!output) return [];
    const position = positionNearNode(nodes, selectedNodeIds[0]);

    if (action.type === "node.create_image_config" && output.kind === "image_prompt") {
        return [
            {
                id: action.id,
                kind: "write",
                type: "node.create_config",
                reason: action.title || `创建图片提示词配置：${output.title}`,
                payload: {
                    mode: "image",
                    title: action.title || output.title,
                    config: imageOutputConfig(output),
                    position,
                },
            },
        ];
    }

    if (action.type === "node.create_video_config" && output.kind === "video_prompt") {
        return [
            {
                id: action.id,
                kind: "write",
                type: "node.create_config",
                reason: action.title || `创建视频提示词配置：${output.title}`,
                payload: {
                    mode: "video",
                    title: action.title || output.title,
                    config: videoOutputConfig(output),
                    position,
                },
            },
        ];
    }

    if (action.type === "node.create_storyboard_group" && output.kind === "storyboard_prompt") {
        return output.shots.map((shot, index) => ({
            id: `${action.id}-${shot.id || index + 1}`,
            kind: "write" as const,
            type: "node.create_text" as const,
            reason: action.title || `创建分镜文本：${shot.title}`,
            payload: {
                title: shot.title || `${output.title} ${index + 1}`,
                content: storyboardShotContent(output, index),
                position: { x: position.x + index * 380, y: position.y },
            },
        }));
    }

    return [];
}

function imageOutputConfig(output: PromptAgentImageOutput) {
    return {
        prompt: output.finalPrompt,
        finalPrompt: output.finalPrompt,
        sourceType: "manual" as const,
        promptAgent: {
            kind: output.kind,
            title: output.title,
            subject: output.subject,
            style: output.style,
            composition: output.composition,
            lighting: output.lighting,
            material: output.material,
            color: output.color,
            referenceUsage: output.referenceUsage,
            negativePrompt: output.negativePrompt,
        },
    };
}

function videoOutputConfig(output: PromptAgentVideoOutput) {
    return {
        prompt: output.finalPrompt,
        finalPrompt: output.finalPrompt,
        duration: output.duration || "6",
        seconds: output.duration || "6",
        ratio: output.ratio,
        size: output.ratio,
        sourceType: "manual" as const,
        storyboardRole: "video_config",
        promptAgent: {
            kind: output.kind,
            title: output.title,
            subject: output.subject,
            action: output.action,
            camera: output.camera,
            shotSize: output.shotSize,
            rhythm: output.rhythm,
            referenceUsage: output.referenceUsage,
        },
    };
}

function storyboardShotContent(output: PromptAgentStoryboardOutput, index: number) {
    const shot = output.shots[index];
    return [
        `${index + 1}. ${shot.title}`,
        output.summary ? `整体：${output.summary}` : "",
        `画面：${shot.visual}`,
        shot.action ? `动作：${shot.action}` : "",
        shot.shotSize ? `景别：${shot.shotSize}` : "",
        shot.camera ? `运镜：${shot.camera}` : "",
        shot.emotion ? `情绪：${shot.emotion}` : "",
        shot.videoPrompt ? `视频提示词：${shot.videoPrompt}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

function positionNearNode(nodes: CanvasNodeData[], nodeId?: string): Position {
    const node = nodes.find((item) => item.id === nodeId);
    if (node) return { x: node.position.x + node.width + 96, y: node.position.y };
    const right = nodes.reduce((max, item) => Math.max(max, item.position.x + item.width), 0);
    return { x: right + 96, y: nodes[0]?.position.y || 0 };
}
