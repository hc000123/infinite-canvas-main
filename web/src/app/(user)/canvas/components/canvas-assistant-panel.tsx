"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUp, FileText, History, ImageIcon, LoaderCircle, MessageSquare, Network, PanelRightClose, Plus, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";
import { motion } from "motion/react";

import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { nanoid } from "nanoid";
import { requestEdit, requestGeneration, requestImageQuestion, type ChatCompletionMessage } from "@/services/api/image";
import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useLocalAiTaskLogStore } from "@/stores/use-local-ai-task-log-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ReferenceImage } from "@/types/image";
import { DiaTextReveal } from "@/components/ui/dia-text-reveal";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { type CanvasAssistantImage, type CanvasAssistantMessage, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData } from "../types";
import {
    buildAssistantCanvasActionPreview,
    executeAssistantCanvasReadAction,
    parseAssistantCanvasActionSuggestion,
    validateAssistantCanvasAction,
    type AssistantCanvasAction,
    type AssistantCanvasReadAction,
} from "../utils/canvas-assistant-actions";
import { buildAssistantReferences } from "../utils/canvas-assistant-references";
import { useCanvasAssistantSessions } from "../hooks/use-canvas-assistant-sessions";
import { AssistantMessages, AssistantReferenceChip } from "./canvas-assistant-messages";

type AssistantMode = "ask" | "image";
const PANEL_MOTION_MS = 500;
const PANEL_MOTION_SECONDS = PANEL_MOTION_MS / 1000;

type CanvasAssistantPanelProps = {
    embedded?: boolean;
    projectId: string;
    canvasId: string;
    episodeId?: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    sessions: CanvasAssistantSession[];
    activeSessionId: string | null;
    onSelectNodeIds: (ids: Set<string>) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null, options?: { skipCanvasHistory?: boolean }) => void;
    onInsertImage: (image: CanvasAssistantImage) => void;
    onInsertText: (text: string) => void;
    onPasteImage: (file: File) => void;
    onApplyAssistantActions: (actions: AssistantCanvasAction[]) => boolean;
    onCollapseStart: () => void;
    onCollapse: () => void;
};

export function CanvasAssistantPanel({
    embedded = false,
    projectId,
    canvasId,
    episodeId,
    nodes,
    connections,
    selectedNodeIds,
    sessions,
    activeSessionId,
    onSelectNodeIds,
    onSessionsChange,
    onInsertImage,
    onInsertText,
    onPasteImage,
    onApplyAssistantActions,
    onCollapseStart,
    onCollapse,
}: CanvasAssistantPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const effectiveConfig = useEffectiveConfig();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [width, setWidth] = useState(390);
    const [mode, setMode] = useState<AssistantMode>("image");
    const [prompt, setPrompt] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [closing, setClosing] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [removedReferenceIds, setRemovedReferenceIds] = useState<Set<string>>(new Set());
    const {
        activeSession,
        appendAssistantMessage,
        appendMessage,
        checkedChatIds,
        clearSessions,
        deleteChatIds,
        ensureActiveSession,
        hasMessages,
        historySessions,
        messages,
        removeSessions,
        setActiveSessionId,
        setCheckedChatIds,
        setDeleteChatIds,
        setView,
        startChatSession,
        updateMessage,
        view,
    } = useCanvasAssistantSessions({ activeSessionId, cleanupImages, onSessionsChange, sessions });
    const selectedNodeKey = useMemo(() => Array.from(selectedNodeIds).sort().join(","), [selectedNodeIds]);
    const allSelectedReferences = useMemo(() => buildAssistantReferences(nodes, selectedNodeIds, connections), [connections, nodes, selectedNodeIds]);
    const selectedReferences = useMemo(() => allSelectedReferences.filter((item) => !removedReferenceIds.has(item.id)), [allSelectedReferences, removedReferenceIds]);
    const iconButtonStyle = { color: theme.node.muted };

    useEffect(() => {
        setRemovedReferenceIds(new Set());
    }, [selectedNodeKey]);

    const sendMessage = async (text: string, nextMode: AssistantMode, history: CanvasAssistantMessage[], savedReferences?: CanvasAssistantReference[]) => {
        const requestConfig = { ...effectiveConfig, model: nextMode === "image" ? effectiveConfig.imageModel || effectiveConfig.model : effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(requestConfig, requestConfig.model)) {
            openConfigDialog(true);
            return;
        }

        const session = ensureActiveSession();

        const refs = savedReferences || selectedReferences;
        const userMessage: CanvasAssistantMessage = { id: nanoid(), role: "user", mode: nextMode, text, references: refs };
        const assistantId = nanoid();
        appendMessage(session.id, userMessage);
        appendMessage(session.id, { id: assistantId, role: "assistant", mode: nextMode, text: nextMode === "image" ? "正在生成图片" : "正在回答", isLoading: true });
        setPrompt("");
        setIsRunning(true);

        try {
            if (nextMode === "image") {
                const referenceImages: ReferenceImage[] = await Promise.all(
                    refs.filter((item) => item.dataUrl).map(async (item) => ({ id: item.id, name: `${item.title}.png`, type: "image/png", dataUrl: await imageToDataUrl(item), storageKey: item.storageKey })),
                );
                const images = referenceImages.length
                    ? await requestEdit(requestConfig, text, referenceImages, undefined, {
                          projectId,
                          canvasId,
                          episodeId,
                          sourceType: "image_generation",
                          sourceId: session.id,
                          inputSummary: summarizeLocalImageInput(text, referenceImages.length),
                      })
                    : await requestGeneration(requestConfig, text, undefined, {
                          projectId,
                          canvasId,
                          episodeId,
                          sourceType: "image_generation",
                          sourceId: session.id,
                          inputSummary: summarizeLocalImageInput(text, 0),
                      });
                const storedImages = await Promise.all(images.map((image) => uploadImage(image.dataUrl)));
                images.forEach((image, index) => {
                    const stored = storedImages[index];
                    if (image.localAiTaskId && stored) updateLocalImageResultSize(image.localAiTaskId, stored.width, stored.height);
                });
                updateMessage(session.id, assistantId, {
                    text: `生成了 ${storedImages.length} 张图片`,
                    images: storedImages.map((image, index) => ({ id: images[index].id, dataUrl: image.url, storageKey: image.storageKey, prompt: text })),
                    isLoading: false,
                });
                return;
            }

            const answer = await requestImageQuestion(requestConfig, await buildChatMessages([...history, userMessage]), (streamed) => {
                updateMessage(session.id, assistantId, { text: streamed, isLoading: false });
            });
            updateMessage(session.id, assistantId, { text: answer, isLoading: false });
        } catch (error) {
            updateMessage(session.id, assistantId, { text: error instanceof Error ? error.message : "操作失败", isLoading: false });
        } finally {
            setIsRunning(false);
        }
    };

    const submit = async () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        const suggestion = parseAssistantCanvasActionSuggestion({ text, nodes, connections, selectedNodeIds: Array.from(selectedNodeIds) });
        if (suggestion?.actions.length) {
            setPrompt("");
            appendAssistantMessage({
                id: nanoid(),
                role: "assistant",
                mode: "ask",
                text: `${suggestion.reason}。确认前不会修改画布。`,
                assistantActions: suggestion.actions,
                assistantActionStatus: "pending",
            });
            return;
        }
        await sendMessage(text, mode, messages);
    };

    const retryMessage = (message: CanvasAssistantMessage) => {
        const index = messages.findIndex((item) => item.id === message.id);
        const userIndex = messages.slice(0, index).findLastIndex((item) => item.role === "user");
        const user = messages[userIndex];
        if (user) void sendMessage(user.text, user.mode, messages.slice(0, userIndex), user.references);
    };

    const createDebugActionPreview = () => {
        const actions = buildDebugAssistantActions(nodes, connections, Array.from(selectedNodeIds));
        appendAssistantMessage({
            id: nanoid(),
            role: "assistant",
            mode: "ask",
            text: "已生成一个画布动作预览。确认前不会修改画布。",
            assistantActions: actions,
            assistantActionStatus: "pending",
        });
    };

    const runReadAction = (action: AssistantCanvasReadAction) => {
        const result = executeAssistantCanvasReadAction(action, nodes, connections);
        appendAssistantMessage({ id: nanoid(), role: "assistant", mode: "ask", text: result.text }, { skipCanvasHistory: true });
    };

    const startResize = () => {
        const move = (event: MouseEvent) => setWidth(Math.min(760, Math.max(320, window.innerWidth - event.clientX)));
        const stop = () => {
            setResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    };

    const collapse = () => {
        setClosing(true);
        onCollapseStart();
        window.setTimeout(onCollapse, PANEL_MOTION_MS);
    };

    const content = (
        <>
                {!embedded ? <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onMouseDown={startResize} aria-label="调整右侧面板宽度" /> : null}
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4" />
                        {view === "history" ? "历史记录" : "画布助手"}
                    </div>
                    <div className="flex items-center gap-1">
                        {view === "history" ? (
                            <>
                                <Tooltip title="删除选中">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Trash2 className="size-4" />} disabled={!checkedChatIds.length} onClick={() => setDeleteChatIds(checkedChatIds)} />
                                </Tooltip>
                                <Tooltip title="删除全部">
                                    <Button
                                        type="text"
                                        shape="circle"
                                        className="!h-8 !w-8 !min-w-8"
                                        style={iconButtonStyle}
                                        icon={<X className="size-4" />}
                                        disabled={!historySessions.length}
                                        onClick={() => setDeleteChatIds(historySessions.map((session) => session.id))}
                                    />
                                </Tooltip>
                            </>
                        ) : null}
                        <Tooltip title={view === "history" ? "返回对话" : "历史记录"}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<History className="size-4" />} onClick={() => setView(view === "history" ? "chat" : "history")} />
                        </Tooltip>
                        <Tooltip title="新对话">
                            <Button
                                type="text"
                                shape="circle"
                                className="!h-8 !w-8 !min-w-8"
                                style={iconButtonStyle}
                                icon={<Plus className="size-4" />}
                                disabled={!hasMessages}
                                onClick={() => {
                                    startChatSession();
                                    setView("chat");
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="配置">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Settings2 className="size-4" />} onClick={() => openConfigDialog(false)} />
                        </Tooltip>
                        <Tooltip title="收起对话">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<PanelRightClose className="size-4" />} onClick={collapse} />
                        </Tooltip>
                    </div>
                </div>

                <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                    {view === "history" ? (
                        <AssistantHistory
                            sessions={historySessions}
                            activeSession={activeSession}
                            checkedIds={checkedChatIds.filter((id) => historySessions.some((session) => session.id === id))}
                            onToggleChecked={(id, checked) => setCheckedChatIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)))}
                            onOpen={(id) => {
                                setActiveSessionId(id);
                                setView("chat");
                            }}
                            onDelete={(id) => setDeleteChatIds([id])}
                        />
                    ) : messages.length ? (
                        <AssistantMessages
                            messages={messages}
                            nodes={nodes}
                            connections={connections}
                            onRetry={retryMessage}
                            onInsertImage={onInsertImage}
                            onInsertText={onInsertText}
                            onApplyAssistantActions={(message) => {
                                if (!message.assistantActions?.length) return;
                                const applied = onApplyAssistantActions(message.assistantActions);
                                if (applied) updateMessage(activeSession?.id || "", message.id, { assistantActionStatus: "applied", assistantActionAppliedAt: new Date().toISOString() });
                            }}
                            onCancelAssistantActions={(message) => updateMessage(activeSession?.id || "", message.id, { assistantActionStatus: "cancelled" })}
                        />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center px-1 text-center">
                            <div className="relative font-serif text-4xl font-bold italic tracking-normal" style={{ color: theme.node.text }}>
                                <span>眨眼之间</span>
                                <DiaTextReveal className="absolute inset-0" colors={["#A97CF8", "#F38CB8", "#FDCC92"]} textColor="transparent" duration={1.8} startOnView={false} text="眨眼之间" />
                            </div>
                            <div className="mt-3 text-base tracking-wide opacity-60">一眨眼，把灵感铺成画布</div>
                        </div>
                    )}
                </div>

                {view === "chat" ? (
                    <AssistantComposer
                        mode={mode}
                        prompt={prompt}
                        isRunning={isRunning}
                        references={selectedReferences}
                        config={effectiveConfig}
                        onModeChange={setMode}
                        onPromptChange={setPrompt}
                        onSubmit={submit}
                        onConfigChange={updateConfig}
                        onMissingConfig={() => openConfigDialog(true)}
                        onCreateDebugActionPreview={createDebugActionPreview}
                        onSummarizeCanvas={() => runReadAction({ id: nanoid(), kind: "read", type: "canvas.summarize", reason: "总结当前画布" })}
                        onExplainSelectedNodes={() => {
                            const nodeIds = Array.from(selectedNodeIds);
                            if (!nodeIds.length) {
                                appendAssistantMessage({ id: nanoid(), role: "assistant", mode: "ask", text: "请先选中一个节点，我再解释它的上下游关系。" }, { skipCanvasHistory: true });
                                return;
                            }
                            runReadAction({ id: nanoid(), kind: "read", type: "node.explain_context", reason: "解释选中节点上下游", payload: { nodeIds } });
                        }}
                        onRemoveReference={(id) => {
                            setRemovedReferenceIds((prev) => new Set(prev).add(id));
                            if (selectedNodeIds.has(id)) onSelectNodeIds(new Set(Array.from(selectedNodeIds).filter((nodeId) => nodeId !== id)));
                        }}
                        onPasteImage={onPasteImage}
                        modelCosts={modelCosts}
                    />
                ) : null}

                <Modal
                    title="删除对话记录？"
                    open={deleteChatIds.length > 0}
                    centered
                    onCancel={() => setDeleteChatIds([])}
                    footer={
                        <>
                            <Button onClick={() => setDeleteChatIds([])}>取消</Button>
                            <Button
                                danger
                                type="primary"
                                onClick={() => {
                                    deleteChatIds.length === historySessions.length ? clearSessions() : removeSessions(deleteChatIds);
                                    setDeleteChatIds([]);
                                }}
                            >
                                删除
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">将删除 {deleteChatIds.length} 条对话记录，此操作不可撤销。</p>
                </Modal>
        </>
    );

    if (embedded) {
        return (
            <div className="relative flex h-full min-h-0 flex-col" style={{ background: theme.node.panel, color: theme.node.text }}>
                {content}
            </div>
        );
    }

    return (
        <motion.div
            className="flex shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: closing ? 0 : width + 1, opacity: closing ? 0 : 1 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: closing ? "none" : undefined }}
        >
            <motion.aside
                className="relative flex shrink-0 flex-col border-l"
                initial={{ x: 48 }}
                animate={{ x: closing ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            >
                {content}
            </motion.aside>
        </motion.div>
    );
}

function AssistantComposer({
    mode,
    prompt,
    isRunning,
    references,
    config,
    onModeChange,
    onPromptChange,
    onSubmit,
    onConfigChange,
    onMissingConfig,
    onCreateDebugActionPreview,
    onSummarizeCanvas,
    onExplainSelectedNodes,
    onRemoveReference,
    onPasteImage,
    modelCosts,
}: {
    mode: AssistantMode;
    prompt: string;
    isRunning: boolean;
    references: CanvasAssistantReference[];
    config: AiConfig;
    onModeChange: (mode: AssistantMode) => void;
    onPromptChange: (prompt: string) => void;
    onSubmit: () => void;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig: () => void;
    onCreateDebugActionPreview: () => void;
    onSummarizeCanvas: () => void;
    onExplainSelectedNodes: () => void;
    onRemoveReference: (id: string) => void;
    onPasteImage: (file: File) => void;
    modelCosts?: { model: string; credits: number }[];
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const activeModel = mode === "image" ? config.imageModel || config.model : config.textModel || config.model;
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: activeModel, count: mode === "image" ? config.count : 1 });

    return (
        <div className="px-2 pb-2" onWheelCapture={(event) => event.stopPropagation()}>
            {references.length ? (
                <div className="thin-scrollbar mb-1.5 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
                    {references.map((item) => (
                        <AssistantReferenceChip key={item.id} item={item} onRemove={() => onRemoveReference(item.id)} />
                    ))}
                </div>
            ) : null}
            <div className="rounded-[28px] border px-3 pb-3 pt-3 shadow-lg" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}>
                <textarea
                    value={prompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    onPaste={(event) => {
                        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
                        if (!file) return;
                        event.preventDefault();
                        onPasteImage(file);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) return;
                        event.preventDefault();
                        void onSubmit();
                    }}
                    className="thin-scrollbar h-20 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none placeholder:text-stone-400"
                    style={{ color: theme.node.text }}
                    placeholder={mode === "image" ? "描述你想生成或修改的图片" : "输入你想问的问题"}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="canvas-composer-tools flex min-w-0 flex-1 items-center gap-1">
                        <CanvasPromptLibrary nodeGroup={mode === "image" ? "image" : "text"} onSelect={onPromptChange} />
                        <Tooltip title="总结当前画布">
                            <Button type="text" shape="circle" className="canvas-composer-icon !h-8 !min-w-8 !rounded-full !px-2" icon={<FileText className="size-4" />} onClick={onSummarizeCanvas} />
                        </Tooltip>
                        <Tooltip title="解释选中节点">
                            <Button type="text" shape="circle" className="canvas-composer-icon !h-8 !min-w-8 !rounded-full !px-2" icon={<Network className="size-4" />} onClick={onExplainSelectedNodes} />
                        </Tooltip>
                        <Tooltip title="开发调试：生成动作预览">
                            <Button type="text" shape="circle" className="canvas-composer-icon !h-8 !min-w-8 !rounded-full !px-2" icon={<Sparkles className="size-4" />} onClick={onCreateDebugActionPreview} />
                        </Tooltip>
                        <AssistantModeSwitch mode={mode} theme={theme} onChange={onModeChange} />
                        {mode === "image" ? (
                            <>
                                <ModelPicker className="h-8 shrink-0" config={config} modelType="image" value={config.imageModel || config.model} onChange={(model) => onConfigChange("imageModel", model)} onMissingConfig={onMissingConfig} />
                                <CanvasImageSettingsPopover
                                    config={config}
                                    placement="topRight"
                                    getPopupContainer={() => document.body}
                                    buttonClassName="canvas-composer-settings canvas-composer-icon !h-8 !min-w-8 !rounded-full !px-2"
                                    onConfigChange={onConfigChange}
                                    onMissingConfig={onMissingConfig}
                                />
                            </>
                        ) : (
                            <ModelPicker className="h-8 shrink-0" config={config} modelType="text" value={config.textModel || config.model} onChange={(model) => onConfigChange("textModel", model)} onMissingConfig={onMissingConfig} />
                        )}
                    </div>
                    <Button type="primary" className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3" disabled={isRunning || !prompt.trim()} onClick={() => void onSubmit()} aria-label="发送">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                                <CreditSymbol />
                                {credits.toLocaleString()}
                            </span>
                            {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

function AssistantModeSwitch({ mode, theme, onChange }: { mode: AssistantMode; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (mode: AssistantMode) => void }) {
    return (
        <div className="canvas-composer-mode-switch flex h-8 shrink-0 items-center rounded-full p-0.5" style={{ background: theme.node.fill }}>
            {[
                { value: "ask" as const, title: "对话", icon: <MessageSquare className="size-4" /> },
                { value: "image" as const, title: "生图", icon: <ImageIcon className="size-4" /> },
            ].map((item) => (
                <Tooltip key={item.value} title={item.title}>
                    <button
                        type="button"
                        className="canvas-composer-mode-button flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full border-0 bg-transparent transition"
                        style={{ background: mode === item.value ? theme.node.activeStroke : "transparent", color: mode === item.value ? theme.node.panel : theme.node.text }}
                        onClick={() => onChange(item.value)}
                        aria-label={item.title}
                    >
                        {item.icon}
                        <span>{item.title}</span>
                    </button>
                </Tooltip>
            ))}
        </div>
    );
}

function AssistantHistory({
    sessions,
    activeSession,
    checkedIds,
    onToggleChecked,
    onOpen,
    onDelete,
}: {
    sessions: CanvasAssistantSession[];
    activeSession: CanvasAssistantSession | null;
    checkedIds: string[];
    onToggleChecked: (id: string, checked: boolean) => void;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-1">
            {sessions.map((session) => (
                <div key={session.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-black/5 dark:hover:bg-white/10" style={session.id === activeSession?.id ? { background: theme.node.fill } : undefined}>
                    <input type="checkbox" className="size-4 accent-stone-950" checked={checkedIds.includes(session.id)} onChange={(event) => onToggleChecked(session.id, event.target.checked)} />
                    <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => onOpen(session.id)}>
                        <span className="block truncate">{session.title}</span>
                        <span className="text-xs opacity-50">{session.messages.length} 条消息</span>
                    </button>
                    <Button type="text" shape="circle" size="small" className="opacity-0 transition group-hover:opacity-100" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(session.id)} title="删除" />
                </div>
            ))}
        </div>
    );
}

function buildDebugAssistantActions(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedNodeIds: string[]): AssistantCanvasAction[] {
    const selectedIds = selectedNodeIds.filter((id) => nodes.some((node) => node.id === id));
    const anchor = nodes.find((node) => node.id === selectedIds[0]) || nodes[0];
    const base = anchor ? { x: anchor.position.x + anchor.width + 96, y: anchor.position.y } : undefined;
    const drafts: AssistantCanvasAction[] =
        selectedIds.length >= 2
            ? [
                  {
                      id: nanoid(),
                      kind: "write",
                      type: "connection.create",
                      reason: "开发调试：连接两个已选节点，验证连线预览和确认应用流程",
                      payload: { fromNodeId: selectedIds[0], toNodeId: selectedIds[1] },
                  },
              ]
            : [
                  {
                      id: nanoid(),
                      kind: "write",
                      type: "node.create_text",
                      reason: "开发调试：创建文本节点，验证动作预览不会自动修改画布",
                      payload: { title: "助手文本预览", content: "这是助手动作预览创建的文本节点。", position: base },
                  },
                  {
                      id: nanoid(),
                      kind: "write",
                      type: "node.create_config",
                      reason: "开发调试：创建视频配置节点，验证配置节点预览",
                      payload: { mode: "video", title: "助手配置预览", position: base ? { x: base.x, y: base.y + 280 } : undefined },
                  },
              ];

    return drafts.map((action) => {
        const validation = validateAssistantCanvasAction(action, nodes, connections);
        return validation.ok ? { ...validation.action, preview: buildAssistantCanvasActionPreview(validation.action, nodes, connections) } : action;
    });
}

async function buildChatMessages(messages: CanvasAssistantMessage[]): Promise<ChatCompletionMessage[]> {
    return Promise.all(
        messages.map(async (message, index) => {
            if (message.role === "assistant") return { role: "assistant", content: message.text };
            if (index !== messages.length - 1) return { role: "user", content: message.text };
            const refs = message.references || [];
            return {
                role: "user",
                content: [
                    ...refs.flatMap((item) => (item.text ? [{ type: "text" as const, text: item.text }] : [])),
                    { type: "text", text: message.text },
                    ...(await Promise.all(refs.filter((item) => item.dataUrl).map(async (item) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl(item) } })))),
                ],
            };
        }),
    );
}

function updateLocalImageResultSize(localAiTaskId: string, width: number, height: number) {
    const resultImageSize = `${width}x${height}`;
    useLocalAiTaskLogStore.getState().updateTask(localAiTaskId, {
        resultImageSize,
        outputSummary: `图片已生成，返回尺寸 ${resultImageSize}`,
    });
}

function summarizeLocalImageInput(prompt: string, referenceCount: number) {
    const text = prompt.replace(/\s+/g, " ").trim();
    const summary = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    return referenceCount ? `${summary || "生图提示词为空"}；参考图 ${referenceCount} 张` : summary || "生图提示词为空";
}
