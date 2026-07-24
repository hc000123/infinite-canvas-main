import type { CanvasConnection, CanvasNodeData } from "../types";

export type CanvasConnectedMediaItem = {
    connectionId: string;
    nodeId: string;
    type: "image" | "video" | "audio";
    label: string;
    title: string;
    previewUrl?: string;
    role?: string;
};

export function buildCanvasConnectedMedia(targetNodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasConnectedMediaItem[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const counts = { image: 0, video: 0, audio: 0 };

    return connections.flatMap((connection) => {
        if (connection.toNodeId !== targetNodeId) return [];
        const node = nodeById.get(connection.fromNodeId);
        if (!node || (node.type !== "image" && node.type !== "video" && node.type !== "audio")) return [];
        const type = node.type as CanvasConnectedMediaItem["type"];
        counts[type] += 1;
        const baseLabel = `${type === "image" ? "图片" : type === "video" ? "视频" : "音频"} ${counts[type]}`;
        const roleLabel = connection.toHandle === "first_frame" ? "首帧" : connection.toHandle === "last_frame" ? "尾帧" : "";

        return [{
            connectionId: connection.id,
            nodeId: node.id,
            type,
            label: roleLabel ? `${roleLabel} · ${baseLabel}` : baseLabel,
            title: node.title,
            previewUrl: node.metadata?.content,
            ...(connection.toHandle ? { role: connection.toHandle } : {}),
        }];
    });
}
