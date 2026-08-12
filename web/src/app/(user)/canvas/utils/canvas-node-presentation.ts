import type { CanvasNodeData } from "../types";

export type CanvasNodePresentation = {
    body: "logo" | "media" | "content";
    overlay: "none" | "loading" | "error";
    preserveMedia: boolean;
};

export function deriveCanvasNodePresentation(node: CanvasNodeData): CanvasNodePresentation {
    const isMedia = node.type === "image" || node.type === "video" || node.type === "audio";
    const hasMedia = isMedia && Boolean(node.metadata?.content);
    const overlay = node.metadata?.status === "loading" || node.metadata?.status === "error" ? node.metadata.status : "none";

    return {
        body: isMedia ? (hasMedia ? "media" : "logo") : "content",
        overlay,
        preserveMedia: Boolean(hasMedia && overlay !== "none"),
    };
}
