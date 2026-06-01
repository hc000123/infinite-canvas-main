import type { ChatCompletionMessage } from "@/services/api/image";
import type { CanvasConnection, CanvasNodeData } from "../types";
import { buildCanvasGenerationContext, buildCanvasGenerationInputs, type NodeGenerationContext, type NodeGenerationInput } from "../utils/canvas-generation-inputs";

export type { NodeGenerationContext, NodeGenerationInput } from "../utils/canvas-generation-inputs";

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    return buildCanvasGenerationContext(nodeId, nodes, connections, prompt);
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    return buildCanvasGenerationInputs(nodeId, nodes, connections);
}

export function buildNodeChatMessages(context: NodeGenerationContext): ChatCompletionMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    return { ...context, referenceImages: await Promise.all(context.referenceImages.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) }))) };
}
