import type { PromptAgentRunMode } from "./canvas-prompt-agent-types.ts";

export type CanvasAssistantToolPermission = "read_canvas" | "write_canvas" | "generate_image" | "prepare_video";
export type CanvasAssistantToolStatus = "available" | "confirm" | "blocked";

export type CanvasAssistantTool = {
    id: string;
    label: string;
    group: "读取" | "写入" | "生成";
    permission: CanvasAssistantToolPermission;
    status: CanvasAssistantToolStatus;
    description: string;
};

const assistantTools: CanvasAssistantTool[] = [
    {
        id: "canvas.summarize",
        label: "总结画布",
        group: "读取",
        permission: "read_canvas",
        status: "available",
        description: "读取当前节点、连线、状态和主要内容。",
    },
    {
        id: "node.explain_context",
        label: "解释选中节点",
        group: "读取",
        permission: "read_canvas",
        status: "available",
        description: "解释选中节点的上游、下游和引用关系。",
    },
    {
        id: "node.create_text",
        label: "创建文本节点",
        group: "写入",
        permission: "write_canvas",
        status: "confirm",
        description: "把提示词、分镜或说明写入画布文本节点。",
    },
    {
        id: "node.create_image_config",
        label: "创建图片配置",
        group: "写入",
        permission: "write_canvas",
        status: "confirm",
        description: "创建可继续生图的图片配置节点。",
    },
    {
        id: "node.create_video_config",
        label: "准备视频配置",
        group: "写入",
        permission: "prepare_video",
        status: "confirm",
        description: "创建视频配置节点，不直接触发视频生成。",
    },
    {
        id: "node.create_storyboard_group",
        label: "创建分镜组",
        group: "写入",
        permission: "write_canvas",
        status: "confirm",
        description: "把分镜拆成多个画布文本节点。",
    },
    {
        id: "image.generate",
        label: "调用生图",
        group: "生成",
        permission: "generate_image",
        status: "confirm",
        description: "使用当前图片模型生成图片，会消耗额度。",
    },
    {
        id: "video.generate",
        label: "直接视频生成",
        group: "生成",
        permission: "prepare_video",
        status: "blocked",
        description: "不支持直接视频生成；当前只能准备视频配置节点。",
    },
];

export function canvasAssistantToolsForAgentMode(agentMode: PromptAgentRunMode) {
    return assistantTools
        .filter((tool) => tool.id !== "video.generate")
        .map((tool) => (agentMode === "review" && tool.permission !== "read_canvas" ? { ...tool, status: "blocked" as const } : tool));
}

export function buildCanvasAssistantToolContext(agentMode: PromptAgentRunMode) {
    const tools = canvasAssistantToolsForAgentMode(agentMode);
    return [
        "助手可用工具：",
        ...tools.map((tool) => `- ${tool.label}（${permissionLabel(tool.permission)}，${statusLabel(tool.status)}）：${tool.description}`),
        "- 不支持直接视频生成；视频需求必须先准备视频配置节点，用户确认后再由现有视频节点流程处理。",
    ].join("\n");
}

export function assistantToolPermissionLabel(permission: CanvasAssistantToolPermission) {
    return permissionLabel(permission);
}

export function assistantToolStatusLabel(status: CanvasAssistantToolStatus) {
    return statusLabel(status);
}

function permissionLabel(permission: CanvasAssistantToolPermission) {
    if (permission === "read_canvas") return "读取画布";
    if (permission === "write_canvas") return "写入画布";
    if (permission === "generate_image") return "调用生图";
    return "准备视频";
}

function statusLabel(status: CanvasAssistantToolStatus) {
    if (status === "available") return "可直接使用";
    if (status === "blocked") return "已阻止";
    return "需要确认";
}
