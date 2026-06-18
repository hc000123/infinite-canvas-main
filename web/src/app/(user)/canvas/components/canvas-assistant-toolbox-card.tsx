"use client";

import { FileText, ImageIcon, LockKeyhole, Network, PenLine, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { assistantToolPermissionLabel, assistantToolStatusLabel, canvasAssistantToolsForAgentMode, type CanvasAssistantTool } from "../utils/canvas-assistant-toolbox";
import type { PromptAgentRunMode } from "../utils/canvas-prompt-agent-types";

export function CanvasAssistantToolboxCard({ agentMode }: { agentMode: PromptAgentRunMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const tools = canvasAssistantToolsForAgentMode(agentMode);

    return (
        <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="font-medium">助手工具</div>
                <div className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    {agentModeLabel(agentMode)}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                {tools.map((tool) => (
                    <ToolPill key={tool.id} tool={tool} />
                ))}
            </div>
            <div className="mt-2 text-[11px] leading-4" style={{ color: theme.node.muted }}>
                视频生成先准备配置节点
            </div>
        </div>
    );
}

function ToolPill({ tool }: { tool: CanvasAssistantTool }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const blocked = tool.status === "blocked";
    return (
        <div className="flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: blocked ? theme.node.muted : theme.node.text }}>
            <span className="shrink-0 opacity-70">{toolIcon(tool)}</span>
            <div className="min-w-0">
                <div className="truncate font-medium">{tool.label}</div>
                <div className="truncate text-[11px]" style={{ color: theme.node.muted }}>
                    {assistantToolPermissionLabel(tool.permission)} · {assistantToolStatusLabel(tool.status)}
                </div>
            </div>
        </div>
    );
}

function toolIcon(tool: CanvasAssistantTool) {
    if (tool.id === "canvas.summarize") return <FileText className="size-3.5" />;
    if (tool.id === "node.explain_context") return <Network className="size-3.5" />;
    if (tool.id === "image.generate") return <ImageIcon className="size-3.5" />;
    if (tool.id === "node.create_video_config") return <Video className="size-3.5" />;
    if (tool.status === "blocked") return <LockKeyhole className="size-3.5" />;
    return <PenLine className="size-3.5" />;
}

function agentModeLabel(agentMode: PromptAgentRunMode) {
    if (agentMode === "auto") return "自动";
    if (agentMode === "review") return "审核";
    return "问答";
}
