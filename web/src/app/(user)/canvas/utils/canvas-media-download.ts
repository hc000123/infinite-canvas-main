import type { CanvasNodeData } from "../types.ts";
import { canvasGeneratedAssetTitle } from "./canvas-asset-name.ts";

export function canvasMediaDownloadFilename(node: CanvasNodeData, canvasTitle: string, nodes: CanvasNodeData[]) {
    return `${canvasGeneratedAssetTitle(node, canvasTitle, nodes)}.${canvasMediaExtension(node)}`;
}

function canvasMediaExtension(node: CanvasNodeData) {
    if (node.type === "video") return "mp4";
    if (node.type === "audio") return audioExtension(node.metadata?.mimeType);
    const content = node.metadata?.content || "";
    return content.match(/^data:image[/]([^;]+)/)?.[1] || content.match(/image[/]([^;]+)/)?.[1] || "png";
}

function audioExtension(mimeType?: string) {
    const subtype = mimeType?.split(";")[0]?.split("/")[1]?.toLowerCase();
    if (!subtype || subtype === "mpeg") return "mp3";
    if (subtype === "x-wav") return "wav";
    return subtype;
}
