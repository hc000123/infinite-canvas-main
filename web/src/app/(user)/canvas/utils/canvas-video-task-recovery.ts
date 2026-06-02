import type { CanvasNodeData } from "../types.ts";

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => {
        if (node.metadata?.status !== "loading") return node;
        if (node.type === "video" && node.metadata.taskId) return node;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: "error" as const,
                errorDetails: node.type === "video" ? "任务创建未完成，请重新生成。" : "页面刷新后生成已中断，请重新生成。",
            },
        };
    });
}

export function recoverableVideoTaskNodes(nodes: CanvasNodeData[]) {
    return nodes.filter((node) => node.type === "video" && Boolean(node.metadata?.taskId) && node.metadata?.status === "loading");
}

export function recoveredVideoTaskNodeStatus(taskStatus?: string) {
    const status = (taskStatus || "").toLowerCase();
    if (status === "failed" || status === "cancelled" || status === "canceled") return "error";
    if (status === "succeeded" || status === "completed" || status === "success") return "success";
    return "loading";
}
