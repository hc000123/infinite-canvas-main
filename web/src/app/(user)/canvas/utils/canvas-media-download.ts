import type { CanvasNodeData } from "../types.ts";
import { currentCanvasMediaVersion } from "./canvas-media-versions.ts";

export function canvasMediaDownloadFilename(node: CanvasNodeData) {
    const version = currentCanvasMediaVersion(node);
    const versionSuffix = version ? `-v${version.versionNumber}` : "";
    return `canvas-${node.type}-${node.id}${versionSuffix}.${canvasMediaExtension(node)}`;
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
