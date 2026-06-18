"use client";

import { Button } from "antd";
import { CheckCircle2, CircleSlash, Clock3, Copy, ImageIcon, ListChecks, LoaderCircle, MessageSquare, Plus, RotateCcw, ShieldAlert, Sparkles, X, XCircle } from "lucide-react";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { useCopyText } from "@/hooks/use-copy-text";
import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasAssistantImage, CanvasAssistantMessage, CanvasAssistantReference, CanvasConnection, CanvasNodeData } from "../types";
import { validateAssistantCanvasActions } from "../utils/canvas-assistant-actions";
import { formatPromptAgentOutputText, promptAgentOutputLabel } from "../utils/canvas-prompt-agent-render";
import { buildPromptAgentExecutionPlan } from "../utils/canvas-prompt-agent-tools";
import type { PromptAgentExecutionStepStatus, PromptAgentOutput } from "../utils/canvas-prompt-agent-types";

export function AssistantMessages({
    messages,
    nodes,
    connections,
    onRetry,
    onInsertImage,
    onInsertText,
    onApplyAssistantActions,
    onCancelAssistantActions,
    onGeneratePromptImage,
}: {
    messages: CanvasAssistantMessage[];
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    onRetry: (message: CanvasAssistantMessage) => void;
    onInsertImage: (image: CanvasAssistantImage) => void;
    onInsertText: (text: string) => void;
    onApplyAssistantActions: (message: CanvasAssistantMessage) => void;
    onCancelAssistantActions: (message: CanvasAssistantMessage) => void;
    onGeneratePromptImage?: (message: CanvasAssistantMessage, output: PromptAgentOutput) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <>
            {messages.map((message) => (
                <div key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
                    <div
                        className="max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-6"
                        style={message.role === "user" ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { background: theme.node.fill, color: theme.node.text }}
                    >
                        {message.role === "assistant" ? (
                            <div className="mb-1 flex items-center gap-1.5 text-xs opacity-60">
                                <MessageSquare className="size-3.5" />
                                回答
                            </div>
                        ) : null}
                        {message.text}
                    </div>
                    {message.references?.length ? <MessageReferences message={message} /> : null}
                    {message.promptAgentPlan?.outputs.length ? <PromptAgentCards message={message} onInsertText={onInsertText} onGeneratePromptImage={onGeneratePromptImage} /> : null}
                    {message.promptAgentPlan?.actions.length ? <PromptAgentExecutionPlanCard message={message} /> : null}
                    {message.assistantActions?.length ? <AssistantActionPreviewCard message={message} nodes={nodes} connections={connections} onApply={() => onApplyAssistantActions(message)} onCancel={() => onCancelAssistantActions(message)} /> : null}
                    {message.isLoading ? <ImageGenerationPending compact label={message.mode === "image" ? "正在生成图片" : "正在回答"} className="w-[250px] rounded-lg border" /> : null}
                    {message.role === "assistant" && !message.isLoading ? (
                        <div className="flex gap-1">
                            <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(message)} title="重试" />
                            {!message.images?.length ? <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<Plus className="size-3.5" />} onClick={() => onInsertText(message.text)} title="插入画布" /> : null}
                        </div>
                    ) : null}
                    {message.images?.map((image) => (
                        <div key={image.id} className="w-[250px] overflow-hidden rounded-lg border" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                            <img src={image.dataUrl} alt="" className="aspect-square w-full object-cover" />
                            <Button
                                type="text"
                                className="!h-8 !w-full !rounded-none"
                                style={{ borderTop: `1px solid ${theme.node.stroke}`, color: theme.node.text }}
                                icon={<Plus className="size-3.5" />}
                                onClick={() => onInsertImage(image)}
                                title="插入画布"
                            />
                        </div>
                    ))}
                </div>
            ))}
        </>
    );
}

function PromptAgentExecutionPlanCard({ message }: { message: CanvasAssistantMessage }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!message.promptAgentPlan) return null;
    const execution = buildPromptAgentExecutionPlan(message.promptAgentPlan, message.promptAgentMode || "ask", message.promptAgentExecutionState);
    if (!execution.steps.length) return null;

    return (
        <div className="w-[290px] rounded-lg border p-3 text-sm" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium opacity-70">
                    <ListChecks className="size-3.5" />
                    执行计划
                </div>
                <span className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    {promptAgentModeLabel(execution.mode)}
                </span>
            </div>
            <div className="text-xs leading-5" style={{ color: theme.node.muted }}>
                {execution.summary}
            </div>
            <div className="mt-2 space-y-1.5">
                {execution.steps.map((step, index) => {
                    const status = promptAgentStepStatusView(step.status, theme);
                    return (
                        <div key={step.id} className="rounded-md border p-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 text-xs font-medium">
                                    {index + 1}. {step.toolLabel}
                                </div>
                                <div className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: status.color }}>
                                    {status.icon}
                                    {status.label}
                                </div>
                            </div>
                            <div className="mt-1 break-words text-xs leading-5">{step.title}</div>
                            <div className="mt-1 text-[11px] leading-4" style={{ color: theme.node.muted }}>
                                {promptAgentPermissionLabel(step.permission)} · {step.note}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function PromptAgentCards({ message, onInsertText, onGeneratePromptImage }: { message: CanvasAssistantMessage; onInsertText: (text: string) => void; onGeneratePromptImage?: (message: CanvasAssistantMessage, output: PromptAgentOutput) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const copyText = useCopyText();
    const outputs = message.promptAgentPlan?.outputs || [];

    return (
        <div className="grid w-[290px] gap-2">
            {outputs.map((output) => {
                const text = formatPromptAgentOutputText(output);
                const canGenerateImage = output.kind === "image_prompt" && Boolean(onGeneratePromptImage);
                return (
                    <div key={output.id} className="rounded-lg border p-3 text-sm" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium opacity-70">
                                <Sparkles className="size-3.5" />
                                <span>{promptAgentOutputLabel(output.kind)}</span>
                            </div>
                            {output.kind === "image_prompt" ? <ImageIcon className="size-3.5 opacity-50" /> : null}
                        </div>
                        <div className="font-medium">{output.title}</div>
                        <pre className="mt-2 max-h-52 whitespace-pre-wrap break-words rounded-md border p-2 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {text}
                        </pre>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(text, "已复制提示词")}>
                                复制
                            </Button>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => onInsertText(text)}>
                                文本节点
                            </Button>
                            {canGenerateImage ? (
                                <Button size="small" type="primary" onClick={() => onGeneratePromptImage?.(message, output)}>
                                    创建并生图
                                </Button>
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function promptAgentModeLabel(mode: "ask" | "auto" | "review") {
    if (mode === "auto") return "自动";
    if (mode === "review") return "审核";
    return "问答";
}

function promptAgentPermissionLabel(permission: "write_canvas" | "generate_image") {
    if (permission === "generate_image") return "生成额度";
    return "写入画布";
}

function promptAgentStepStatusView(status: PromptAgentExecutionStepStatus, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    if (status === "running") return { label: "执行中", color: theme.node.activeStroke, icon: <LoaderCircle className="size-3 animate-spin" /> };
    if (status === "succeeded") return { label: "已完成", color: theme.node.activeStroke, icon: <CheckCircle2 className="size-3" /> };
    if (status === "failed") return { label: "失败", color: "var(--studio-danger)", icon: <XCircle className="size-3" /> };
    if (status === "skipped") return { label: "已跳过", color: theme.node.muted, icon: <CircleSlash className="size-3" /> };
    if (status === "ready") return { label: "可执行", color: theme.node.activeStroke, icon: <CheckCircle2 className="size-3" /> };
    if (status === "blocked") return { label: "已阻止", color: "var(--studio-danger)", icon: <ShieldAlert className="size-3" /> };
    return { label: "需确认", color: theme.node.muted, icon: <Clock3 className="size-3" /> };
}

function AssistantActionPreviewCard({ message, nodes, connections, onApply, onCancel }: { message: CanvasAssistantMessage; nodes: CanvasNodeData[]; connections: CanvasConnection[]; onApply: () => void; onCancel: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const actions = message.assistantActions || [];
    const status = message.assistantActionStatus || "pending";
    const validationErrors = status === "pending" ? validateAssistantCanvasActions(actions, nodes, connections) : [];
    const missingPreviewCount = status === "pending" ? actions.filter((action) => action.kind === "write" && !action.preview).length : 0;
    const previews = actions.flatMap((action) => (action.kind === "write" && action.preview ? [action.preview] : []));
    const createdNodeCount = previews.reduce((count, preview) => count + (preview.createdNodes?.length || 0), 0);
    const createdConnectionCount = previews.reduce((count, preview) => count + (preview.createdConnections?.length || 0), 0);
    const affectedNodeIds = unique(previews.flatMap((preview) => preview.affectedNodeIds));
    const affectedConnectionIds = unique(previews.flatMap((preview) => preview.affectedConnectionIds));
    const reasons = actions.map((action) => action.reason).filter(Boolean);
    const risk = [...validationErrors, ...(missingPreviewCount ? [`${missingPreviewCount} 个动作缺少预览`] : [])];
    const canApply = status === "pending" && actions.length > 0 && risk.length === 0;

    return (
        <div className="w-[290px] rounded-lg border p-3 text-sm" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="mb-2 text-xs font-medium opacity-60">动作预览</div>
            <div className="space-y-1.5 leading-5">
                <div>
                    <span className="opacity-60">原因：</span>
                    {reasons.length ? reasons.join("；") : "助手建议修改画布"}
                </div>
                <div>
                    <span className="opacity-60">将创建：</span>
                    {createdNodeCount} 个节点，{createdConnectionCount} 条连线
                </div>
                <div>
                    <span className="opacity-60">影响节点：</span>
                    {affectedNodeIds.length ? affectedNodeIds.join("、") : "无"}
                </div>
                <div>
                    <span className="opacity-60">影响连线：</span>
                    {affectedConnectionIds.length ? affectedConnectionIds.join("、") : "无"}
                </div>
                <div style={{ color: risk.length ? "var(--studio-danger)" : theme.node.muted }}>
                    <span className="opacity-60">风险/校验：</span>
                    {risk.length ? unique(risk).join("；") : status === "pending" ? "校验通过，等待确认" : status === "applied" ? "已应用到画布" : "已取消"}
                </div>
            </div>
            {status === "pending" ? (
                <div className="mt-3 flex gap-2">
                    <Button size="small" type="primary" disabled={!canApply} onClick={onApply}>
                        应用到画布
                    </Button>
                    <Button size="small" onClick={onCancel}>
                        取消
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function MessageReferences({ message }: { message: CanvasAssistantMessage }) {
    return (
        <div className={cn("flex max-w-[88%] flex-wrap gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.references?.map((item) => (
                <AssistantReferenceChip key={item.id} item={item} />
            ))}
        </div>
    );
}

export function AssistantReferenceChip({ item, onRemove }: { item: CanvasAssistantReference; onRemove?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const text = (item.text || item.title).replace(/\s+/g, " ").trim().slice(0, 1) || "文";
    return (
        <div className="group/chip relative inline-flex h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-lg text-sm" style={{ color: theme.node.text }}>
            {item.dataUrl ? (
                <img src={item.dataUrl} alt="" className="size-8 rounded-lg object-cover" />
            ) : (
                <span className="grid size-8 place-items-center rounded-lg border text-sm font-medium" style={{ background: theme.node.panel, borderColor: theme.node.activeStroke }}>
                    {text}
                </span>
            )}
            {onRemove ? (
                <button
                    type="button"
                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover/chip:opacity-100"
                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}
                    onClick={onRemove}
                    aria-label="移除引用"
                >
                    <X className="size-3" />
                </button>
            ) : null}
        </div>
    );
}

function unique<T>(items: T[]) {
    return Array.from(new Set(items));
}
