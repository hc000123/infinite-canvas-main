import type { CanvasNodeMetadata, CanvasNodeType } from "./types.ts";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    image: { width: 340, height: 240, title: "New Generation" },
    text: { width: 340, height: 240, title: "Note" },
    config: { width: 340, height: 240, title: "生成配置" },
    video: { width: 420, height: 236, title: "Video" },
    audio: { width: 340, height: 120, title: "Audio" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const VIDEO_NODE_MAX_WIDTH = 420;
export const VIDEO_NODE_MAX_HEIGHT = 420;

export const NODE_SPECS = {
    image: {
        ...NODE_DEFAULT_SIZE.image,
        metadata: { content: "", status: "idle" },
    },
    text: {
        ...NODE_DEFAULT_SIZE.text,
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    config: {
        ...NODE_DEFAULT_SIZE.config,
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    video: {
        ...NODE_DEFAULT_SIZE.video,
        metadata: { content: "", status: "idle" },
    },
    audio: {
        ...NODE_DEFAULT_SIZE.audio,
        metadata: { content: "", status: "idle" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
