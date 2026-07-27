import { getNodeSpec } from "../constants.ts";
import type { CanvasNodeData } from "../types.ts";
import type { CanvasEpisodeContext } from "./canvas-episode-context.ts";

export function createEpisodeMainCanvasScriptNode(context: CanvasEpisodeContext): CanvasNodeData | undefined {
    const content = context.scriptSnapshot.trim();
    if (!content) return undefined;
    const spec = getNodeSpec("text" as CanvasNodeData["type"]);
    return {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "text" as CanvasNodeData["type"],
        title: "本集剧本",
        position: { x: 40, y: 40 },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, content, status: "success" },
    };
}
