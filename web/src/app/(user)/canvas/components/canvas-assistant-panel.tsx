"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";

import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { nanoid } from "nanoid";
import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { fetchAgents } from "@/services/api/agent-registry";
import { createAgentPlan } from "@/services/api/agent-plans";
import { createArtifact, type ArtifactEnvelope } from "@/services/api/invocations";
import type { CapabilityConsumeTrace } from "@/components/capability-runtime/use-capability-run";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAgentRunnerStore } from "../../projects/use-agent-runner-store";
import { useCreativeProjectStore } from "../../projects/use-creative-project-store";
import { type CanvasAssistantImage, type CanvasAssistantMessage, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData } from "../types";
import { executeAssistantCanvasReadAction, parseAssistantCanvasActionSuggestion, type AssistantCanvasAction, type AssistantCanvasReadAction } from "../utils/canvas-assistant-actions";
import { buildAssistantReferenceImages, buildChatMessages, buildDebugAssistantActions, summarizeLocalImageInput, updateLocalImageResultSize } from "../utils/canvas-assistant-panel-utils";
import { buildCanvasAgentPlanRequest, buildCanvasAgentSourceText, canvasAgentCandidates, cloneCanvasAgentSkillRefs } from "../utils/canvas-agent-plan-model";
import { buildAssistantReferences } from "../utils/canvas-assistant-references";
import { buildCanvasAssistantWorkflowContext } from "../utils/canvas-assistant-workflow-context";
import { buildWorkflowAssistantActionSuggestion } from "../utils/canvas-assistant-workflow-actions";
import { buildPromptAgentCanvasActions } from "../utils/canvas-prompt-agent-actions";
import { buildPromptAgentSystemContext, isPromptAgentRequest, parsePromptAgentPlan } from "../utils/canvas-prompt-agent";
import type { PromptAgentComposerIntent, PromptAgentExecutionState, PromptAgentExecutionStepStatus, PromptAgentOutput, PromptAgentRunMode, PromptAgentSkillPackId } from "../utils/canvas-prompt-agent-types";
import { updatePromptAgentExecutionState } from "../utils/canvas-prompt-agent-tools";
import { useCanvasAssistantSessions } from "../hooks/use-canvas-assistant-sessions";
import { AssistantMessages } from "./canvas-assistant-messages";
import { CanvasAssistantComposer, type AssistantMode } from "./canvas-assistant-composer";
import { CanvasAssistantHistory } from "./canvas-assistant-history";
import { CanvasAssistantDeleteModal, CanvasAssistantEmptyState, CanvasAssistantHeader } from "./canvas-assistant-panel-chrome";
import { CanvasAssistantToolboxCard } from "./canvas-assistant-toolbox-card";

const PANEL_MOTION_MS = 500;
const PANEL_MOTION_SECONDS = PANEL_MOTION_MS / 1000;
type AssistantSendResult = { ok: true; imageCount?: number } | { ok: false; error: string };

type CanvasAssistantPanelProps = {
    embedded?: boolean;
    projectId: string;
    canvasId: string;
    canvasTitle: string;
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
    onConsumeAgentOutput: (input: { artifacts: ArtifactEnvelope[]; trace: CapabilityConsumeTrace; sourceNodeIds: string[]; sourceMessageId: string; agentPlanId: string }) => Promise<void>;
    onOpenWorkflowAssistant?: () => void;
    onCollapseStart: () => void;
    onCollapse: () => void;
};

const promptAgentCanvasWriteActionTypes = ["node.create_image_config", "node.create_video_config", "node.create_storyboard_group"];

function nextPromptAgentExecutionState(message: CanvasAssistantMessage, state: PromptAgentExecutionState | undefined, actionTypes: string[], status: PromptAgentExecutionStepStatus, note: string, summary: string) {
    const updates = (message.promptAgentPlan?.actions || [])
        .filter((action) => actionTypes.includes(action.type))
        .map((action) => ({
            actionId: action.id,
            status,
            note,
        }));
    return updatePromptAgentExecutionState(state, updates, summary);
}

export function CanvasAssistantPanel({
    embedded = false,
    projectId,
    canvasId,
    canvasTitle,
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
    onConsumeAgentOutput,
    onOpenWorkflowAssistant,
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
    const creativeProject = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const workflowRuns = useAgentRunnerStore((state) => state.workflowRuns);
    const workflowOutputs = useAgentRunnerStore((state) => state.workflowOutputs);
    const workflowMappingPreviews = useAgentRunnerStore((state) => state.workflowMappingPreviews);
    const workflowAppliedPreviewItemIds = useAgentRunnerStore((state) => state.workflowAppliedPreviewItemIds);
    const [width, setWidth] = useState(390);
    const [mode, setMode] = useState<AssistantMode>("ask");
    const [agentMode, setAgentMode] = useState<PromptAgentRunMode>("ask");
    const [promptIntent, setPromptIntent] = useState<PromptAgentComposerIntent>("auto");
    const [promptSkillPackId, setPromptSkillPackId] = useState<PromptAgentSkillPackId>("auto");
    const [selectedAgentId, setSelectedAgentId] = useState("");
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
    const agentsQuery = useQuery({ queryKey: ["canvas-agent-options", projectId], queryFn: () => fetchAgents(projectId), enabled: Boolean(projectId), retry: false, staleTime: 30_000 });
    const agentCandidates = useMemo(() => canvasAgentCandidates(agentsQuery.data || []), [agentsQuery.data]);
    const selectedAgent = agentCandidates.find((item) => item.agent.id === selectedAgentId);
    const workflowContext = useMemo(
        () =>
            buildCanvasAssistantWorkflowContext({
                appliedPreviewItemIds: workflowAppliedPreviewItemIds,
                canvasId,
                canvasTitle,
                connections,
                creativeProject,
                episodeId,
                nodes,
                previews: workflowMappingPreviews,
                projectId,
                workflowRuns,
            }),
        [canvasId, canvasTitle, connections, creativeProject, episodeId, nodes, projectId, workflowAppliedPreviewItemIds, workflowMappingPreviews, workflowRuns],
    );

    useEffect(() => {
        setRemovedReferenceIds(new Set());
    }, [selectedNodeKey]);

    const sendMessage = async (text: string, nextMode: AssistantMode, history: CanvasAssistantMessage[], savedReferences?: CanvasAssistantReference[]): Promise<AssistantSendResult> => {
        const requestConfig = { ...effectiveConfig, model: nextMode === "image" ? effectiveConfig.imageModel || effectiveConfig.model : effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(requestConfig, requestConfig.model)) {
            openConfigDialog(true);
            return { ok: false, error: "AI 配置未完成" };
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
                const referenceImages = await buildAssistantReferenceImages(refs);
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
                return { ok: true, imageCount: storedImages.length };
            }

            const answer = await requestImageQuestion(requestConfig, await buildChatMessages([...history, userMessage], workflowContext.text), (streamed) => {
                updateMessage(session.id, assistantId, { text: streamed, isLoading: false });
            });
            updateMessage(session.id, assistantId, { text: answer, isLoading: false });
            return { ok: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : "操作失败";
            updateMessage(session.id, assistantId, { text: message, isLoading: false });
            return { ok: false, error: message };
        } finally {
            setIsRunning(false);
        }
    };

    const submit = async () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        const suggestion =
            buildWorkflowAssistantActionSuggestion({
                appliedPreviewItemIds: workflowAppliedPreviewItemIds,
                connections,
                nodes,
                outputs: workflowOutputs,
                previews: workflowMappingPreviews,
                text,
                workflowRun: workflowContext.workflowRun,
            }) || parseAssistantCanvasActionSuggestion({ text, nodes, connections, selectedNodeIds: Array.from(selectedNodeIds) });
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
        if (mode === "ask" && selectedAgent) {
            await sendCanvasAgentPlanMessage(text, selectedAgent);
            return;
        }
        if (mode === "ask" && (agentMode !== "ask" || isPromptAgentRequest(text, promptIntent))) {
            await sendPromptAgentMessage(text, messages);
            return;
        }
        await sendMessage(text, mode, messages);
    };

    async function sendCanvasAgentPlanMessage(text: string, agent: (typeof agentCandidates)[number]) {
        const packageValue = agent.recommendedPackage;
        if (!packageValue) return;
        const session = ensureActiveSession();
        const refs = selectedReferences;
        const userMessage: CanvasAssistantMessage = { id: nanoid(), role: "user", mode: "ask", text, references: refs };
        const assistantId = nanoid();
        appendMessage(session.id, userMessage);
        appendMessage(session.id, { id: assistantId, role: "assistant", mode: "ask", text: "正在创建 Temporary Plan", isLoading: true });
        setPrompt("");
        setIsRunning(true);
        try {
            const skillRefs = cloneCanvasAgentSkillRefs(packageValue.defaultSkillRefs);
            if (!skillRefs.length) throw new Error("当前 Agent 没有可运行的 Skill");
            const sourceBindingName = skillRefs[0].inputBindings.find((binding) => !binding.fromStepKey)?.bindingName || "source_text";
            const sourceText = buildCanvasAgentSourceText(text, refs);
            const sourceArtifact = await createArtifact({ artifactType: "source_text", schemaVersion: "1.0.0", projectId, episodeId, payload: { text: sourceText } });
            const detail = await createAgentPlan(
                buildCanvasAgentPlanRequest({
                    projectId,
                    episodeId,
                    agentId: agent.agent.id,
                    agentVersionId: agent.agent.recommendedVersionId,
                    goal: text,
                    sourceArtifact: { artifactId: sourceArtifact.artifact.id, contentHash: sourceArtifact.artifact.contentHash },
                    sourceBindingName,
                    skillRefs,
                    idempotencyKey: globalThis.crypto.randomUUID(),
                }),
            );
            updateMessage(session.id, assistantId, {
                text: `已创建 ${agent.agent.name} 的可编辑 Temporary Plan，确认前不会执行 Skill。`,
                isLoading: false,
                agentPlanRun: {
                    planId: detail.plan.id,
                    agentId: agent.agent.id,
                    agentVersionId: agent.agent.recommendedVersionId,
                    agentName: agent.agent.name,
                    sourceArtifactRef: { bindingName: sourceBindingName, artifactId: sourceArtifact.artifact.id, contentHash: sourceArtifact.artifact.contentHash },
                    sourceNodeIds: refs.map((reference) => reference.id).filter((id) => nodes.some((node) => node.id === id)),
                    skillRefs,
                },
            });
        } catch (error) {
            updateMessage(session.id, assistantId, { text: error instanceof Error ? error.message : "Temporary Plan 创建失败", isLoading: false });
        } finally {
            setIsRunning(false);
        }
    }

    const sendPromptAgentMessage = async (text: string, history: CanvasAssistantMessage[], options?: { agentMode?: PromptAgentRunMode; references?: CanvasAssistantReference[]; skillPackId?: PromptAgentSkillPackId }) => {
        const nextAgentMode = options?.agentMode || agentMode;
        const nextSkillPackId = options?.skillPackId || promptSkillPackId;
        const requestConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(requestConfig, requestConfig.model)) {
            openConfigDialog(true);
            return;
        }

        const session = ensureActiveSession();
        const refs = options?.references || selectedReferences;
        const userMessage: CanvasAssistantMessage = { id: nanoid(), role: "user", mode: "ask", text, references: refs, promptAgentMode: nextAgentMode, promptAgentSkillPackId: nextSkillPackId };
        const assistantId = nanoid();
        appendMessage(session.id, userMessage);
        appendMessage(session.id, { id: assistantId, role: "assistant", mode: "ask", text: "正在整理提示词", isLoading: true });
        setPrompt("");
        setIsRunning(true);

        try {
            const systemContext = buildPromptAgentSystemContext({ agentMode: nextAgentMode, intent: promptIntent, skillPackId: nextSkillPackId, selectedReferences: refs, workflowContext: workflowContext.text });
            const answer = await requestImageQuestion(requestConfig, await buildChatMessages([...history, userMessage], systemContext));
            const parsed = parsePromptAgentPlan(answer);
            if (!parsed.ok) {
                updateMessage(session.id, assistantId, { text: parsed.text, isLoading: false });
                return;
            }

            const suggestion = buildPromptAgentCanvasActions({
                connections,
                agentMode: nextAgentMode,
                nodes,
                plan: parsed.plan,
                selectedNodeIds: Array.from(selectedNodeIds),
            });
            updateMessage(session.id, assistantId, {
                text: parsed.plan.reply,
                isLoading: false,
                promptAgentIntent: parsed.plan.intent,
                promptAgentMode: nextAgentMode,
                promptAgentSkillPackId: nextSkillPackId,
                promptAgentPlan: parsed.plan,
                assistantActions: suggestion?.actions,
                assistantActionStatus: suggestion?.actions.length ? "pending" : undefined,
            });
        } catch (error) {
            updateMessage(session.id, assistantId, { text: error instanceof Error ? error.message : "提示词 Agent 处理失败", isLoading: false });
        } finally {
            setIsRunning(false);
        }
    };

    const generatePromptAgentImage = async (message: CanvasAssistantMessage, output: PromptAgentOutput) => {
        if (output.kind !== "image_prompt") return;
        const sessionId = activeSession?.id || "";
        let executionState = message.promptAgentExecutionState;
        const updateExecution = (actionTypes: string[], status: PromptAgentExecutionStepStatus, note: string, summary: string) => {
            if (!sessionId || !message.promptAgentPlan) return;
            executionState = nextPromptAgentExecutionState(message, executionState, actionTypes, status, note, summary);
            updateMessage(sessionId, message.id, { promptAgentExecutionState: executionState });
        };

        if (message.assistantActionStatus === "pending" && message.assistantActions?.length) {
            const applied = onApplyAssistantActions(message.assistantActions);
            if (!applied) {
                updateExecution(promptAgentCanvasWriteActionTypes, "failed", "画布写入失败，已停止生图", "画布写入失败");
                return;
            }
            executionState = nextPromptAgentExecutionState(message, executionState, promptAgentCanvasWriteActionTypes, "succeeded", "已写入画布", "画布写入完成");
            updateMessage(sessionId, message.id, {
                assistantActionStatus: "applied",
                assistantActionAppliedAt: new Date().toISOString(),
                promptAgentExecutionState: executionState,
            });
        }

        updateExecution(["image.generate"], "running", "正在调用生图", "正在生图");
        const result = await sendMessage(output.finalPrompt, "image", messages, selectedReferences);
        if (result.ok) {
            updateExecution(["image.generate"], "succeeded", `生成了 ${result.imageCount || 0} 张图片`, `生图完成：${result.imageCount || 0} 张`);
            return;
        }
        updateExecution(["image.generate"], "failed", result.error, `生图失败：${result.error}`);
    };

    const retryMessage = (message: CanvasAssistantMessage) => {
        const index = messages.findIndex((item) => item.id === message.id);
        const userIndex = messages.slice(0, index).findLastIndex((item) => item.role === "user");
        const user = messages[userIndex];
        if (!user) return;
        if (message.promptAgentPlan || message.promptAgentIntent || user.promptAgentMode) {
            void sendPromptAgentMessage(user.text, messages.slice(0, userIndex), { agentMode: message.promptAgentMode || user.promptAgentMode || agentMode, references: user.references, skillPackId: message.promptAgentSkillPackId || user.promptAgentSkillPackId || promptSkillPackId });
            return;
        }
        void sendMessage(user.text, user.mode, messages.slice(0, userIndex), user.references);
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
        appendAssistantMessage({ id: nanoid(), role: "assistant", mode: "ask", text: [result.text, action.type === "canvas.summarize" ? workflowContext.text : ""].filter(Boolean).join("\n\n") }, { skipCanvasHistory: true });
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
            <CanvasAssistantHeader
                view={view}
                checkedCount={checkedChatIds.length}
                historyCount={historySessions.length}
                canStartChat={hasMessages}
                onDeleteSelected={() => setDeleteChatIds(checkedChatIds)}
                onDeleteAll={() => setDeleteChatIds(historySessions.map((session) => session.id))}
                onToggleView={() => setView(view === "history" ? "chat" : "history")}
                onStartChat={() => {
                    startChatSession();
                    setView("chat");
                }}
                onOpenWorkflowAssistant={onOpenWorkflowAssistant}
                onOpenConfig={() => openConfigDialog(false)}
                onCollapse={collapse}
            />

            <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="rounded-xl border px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.muted }}>
                    <span className="font-medium" style={{ color: theme.node.text }}>
                        工作流上下文
                    </span>
                    <span className="ml-2">{workflowContext.summary}</span>
                </div>
                {view === "chat" ? <CanvasAssistantToolboxCard agentMode={agentMode} /> : null}
                {view === "history" ? (
                    <CanvasAssistantHistory
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
                        projectId={projectId}
                        nodes={nodes}
                        connections={connections}
                        onRetry={retryMessage}
                        onInsertImage={onInsertImage}
                        onInsertText={onInsertText}
                        onApplyAssistantActions={(message) => {
                            if (!message.assistantActions?.length) return;
                            const applied = onApplyAssistantActions(message.assistantActions);
                            const sessionId = activeSession?.id || "";
                            if (!sessionId) return;
                            updateMessage(sessionId, message.id, {
                                assistantActionStatus: applied ? "applied" : "pending",
                                assistantActionAppliedAt: applied ? new Date().toISOString() : undefined,
                                promptAgentExecutionState: message.promptAgentPlan
                                    ? nextPromptAgentExecutionState(message, message.promptAgentExecutionState, promptAgentCanvasWriteActionTypes, applied ? "succeeded" : "failed", applied ? "已写入画布" : "画布写入失败", applied ? "画布写入完成" : "画布写入失败")
                                    : message.promptAgentExecutionState,
                            });
                        }}
                        onCancelAssistantActions={(message) =>
                            updateMessage(activeSession?.id || "", message.id, {
                                assistantActionStatus: "cancelled",
                                promptAgentExecutionState: message.promptAgentPlan ? nextPromptAgentExecutionState(message, message.promptAgentExecutionState, promptAgentCanvasWriteActionTypes, "skipped", "用户取消写入画布", "已取消画布写入") : message.promptAgentExecutionState,
                            })
                        }
                        onGeneratePromptImage={(message, output) => {
                            void generatePromptAgentImage(message, output);
                        }}
                        onAgentPlanRunPatch={(message, patch) => {
                            if (!message.agentPlanRun) return;
                            updateMessage(activeSession?.id || "", message.id, { agentPlanRun: { ...message.agentPlanRun, ...patch } });
                        }}
                        onConsumeAgentOutput={onConsumeAgentOutput}
                    />
                ) : (
                    <CanvasAssistantEmptyState onOpenWorkflowAssistant={onOpenWorkflowAssistant} />
                )}
            </div>

            {view === "chat" ? (
                <CanvasAssistantComposer
                    mode={mode}
                    agentId={selectedAgentId}
                    agentOptions={agentCandidates.map((item) => ({ value: item.agent.id, label: `${item.agent.name} · ${item.recommendedPackage?.defaultSkillRefs.length || 0} 步` }))}
                    agentLoading={agentsQuery.isLoading}
                    agentMode={agentMode}
                    intent={promptIntent}
                    skillPackId={promptSkillPackId}
                    prompt={prompt}
                    isRunning={isRunning}
                    references={selectedReferences}
                    config={effectiveConfig}
                    onModeChange={setMode}
                    onAgentChange={setSelectedAgentId}
                    onAgentModeChange={setAgentMode}
                    onIntentChange={setPromptIntent}
                    onSkillPackChange={setPromptSkillPackId}
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

            <CanvasAssistantDeleteModal
                count={deleteChatIds.length}
                deletingAll={deleteChatIds.length === historySessions.length}
                onCancel={() => setDeleteChatIds([])}
                onClearAll={() => {
                    clearSessions();
                    setDeleteChatIds([]);
                }}
                onRemoveSelected={() => {
                    removeSessions(deleteChatIds);
                    setDeleteChatIds([]);
                }}
            />
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
