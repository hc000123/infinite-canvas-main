"use client";

import { ArrowUp, Bot, Clapperboard, FileText, ImageIcon, Layers3, LoaderCircle, MessageSquare, Network, ShieldCheck, Sparkles, Video, Zap } from "lucide-react";
import { Button, Select, Tooltip } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { ModelThinkingSettings } from "@/components/image-settings-panel";
import type { AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { AssistantReferenceChip } from "./canvas-assistant-messages";
import type { CanvasAssistantReference } from "../types";
import { promptAgentSkillPacks } from "../utils/canvas-prompt-agent-skills";
import type { PromptAgentComposerIntent, PromptAgentRunMode, PromptAgentSkillPackId } from "../utils/canvas-prompt-agent-types";

export type AssistantMode = "ask" | "image";
export type CanvasAssistantAgentOption = { value: string; label: string };

type CanvasAssistantComposerProps = {
    mode: AssistantMode;
    agentId: string;
    agentOptions: CanvasAssistantAgentOption[];
    agentLoading: boolean;
    agentMode: PromptAgentRunMode;
    intent: PromptAgentComposerIntent;
    skillPackId: PromptAgentSkillPackId;
    prompt: string;
    isRunning: boolean;
    references: CanvasAssistantReference[];
    config: AiConfig;
    onModeChange: (mode: AssistantMode) => void;
    onAgentChange: (agentId: string) => void;
    onAgentModeChange: (mode: PromptAgentRunMode) => void;
    onIntentChange: (intent: PromptAgentComposerIntent) => void;
    onSkillPackChange: (skillPackId: PromptAgentSkillPackId) => void;
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
};

export function CanvasAssistantComposer({
    mode,
    agentId,
    agentOptions,
    agentLoading,
    agentMode,
    intent,
    skillPackId,
    prompt,
    isRunning,
    references,
    config,
    onModeChange,
    onAgentChange,
    onAgentModeChange,
    onIntentChange,
    onSkillPackChange,
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
}: CanvasAssistantComposerProps) {
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
            <div className="rounded-lg border px-3 pb-3 pt-3 shadow-[var(--studio-shadow)]" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}>
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
                    className="thin-scrollbar h-20 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none placeholder:text-[var(--studio-text-muted)]"
                    style={{ color: theme.node.text }}
                    placeholder={mode === "image" ? "描述你想生成或修改的图片" : "描述你想写的图片、视频或分镜提示词"}
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
                        {mode === "ask" ? (
                            <>
                                <PublishedAgentSelect value={agentId} options={agentOptions} loading={agentLoading} theme={theme} onChange={onAgentChange} />
                                <PromptAgentIntentSwitch intent={intent} theme={theme} onChange={onIntentChange} />
                                <PromptAgentRunModeSwitch mode={agentMode} theme={theme} onChange={onAgentModeChange} />
                                <PromptAgentSkillPackSelect value={skillPackId} theme={theme} onChange={onSkillPackChange} />
                            </>
                        ) : null}
                        <AssistantModeSwitch mode={mode} theme={theme} onChange={onModeChange} />
                        {mode === "image" ? (
                            <>
                                <ModelPicker className="h-8 shrink-0" config={config} modelType="image" value={config.imageModel || config.model} onChange={(model) => onConfigChange("imageModel", model)} onMissingConfig={onMissingConfig} />
                                <ModelThinkingSettings compact config={config} model={config.imageModel || config.model} theme={theme} onConfigChange={onConfigChange} />
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
                            <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">{agentId ? "Plan" : <><CreditSymbol />{credits.toLocaleString()}</>}</span>
                            {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PublishedAgentSelect({ value, options, loading, theme, onChange }: { value: string; options: CanvasAssistantAgentOption[]; loading: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (agentId: string) => void }) {
    return (
        <Tooltip title="选择已发布 Agent；普通对话不会创建 Plan">
            <div className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2" style={{ background: theme.node.fill, color: theme.node.text }}>
                <Bot className="size-3.5 opacity-70" />
                <Select
                    size="small"
                    variant="borderless"
                    value={value}
                    loading={loading}
                    className="w-[128px]"
                    popupMatchSelectWidth={220}
                    getPopupContainer={() => document.body}
                    options={[{ value: "", label: "普通对话" }, ...options]}
                    onChange={onChange}
                />
            </div>
        </Tooltip>
    );
}

function PromptAgentSkillPackSelect({ value, theme, onChange }: { value: PromptAgentSkillPackId; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (skillPackId: PromptAgentSkillPackId) => void }) {
    return (
        <Tooltip title="Skill Pack">
            <div className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2" style={{ background: theme.node.fill, color: theme.node.text }}>
                <Layers3 className="size-3.5 opacity-70" />
                <Select
                    size="small"
                    variant="borderless"
                    value={value}
                    className="w-[108px]"
                    popupMatchSelectWidth={160}
                    getPopupContainer={() => document.body}
                    options={promptAgentSkillPacks.map((pack) => ({ value: pack.id, label: pack.label }))}
                    onChange={(next) => onChange(next as PromptAgentSkillPackId)}
                />
            </div>
        </Tooltip>
    );
}

function PromptAgentRunModeSwitch({ mode, theme, onChange }: { mode: PromptAgentRunMode; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (mode: PromptAgentRunMode) => void }) {
    return (
        <div className="canvas-composer-mode-switch flex h-8 shrink-0 items-center rounded-full p-0.5" style={{ background: theme.node.fill }}>
            {[
                { value: "ask" as const, title: "问答", icon: <Bot className="size-3.5" /> },
                { value: "auto" as const, title: "自动", icon: <Zap className="size-3.5" /> },
                { value: "review" as const, title: "审核", icon: <ShieldCheck className="size-3.5" /> },
            ].map((item) => (
                <Tooltip key={item.value} title={`Agent ${item.title}模式`}>
                    <button
                        type="button"
                        className="canvas-composer-mode-button flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full border-0 bg-transparent px-2 text-xs transition"
                        style={{ background: mode === item.value ? theme.node.activeStroke : "transparent", color: mode === item.value ? theme.node.panel : theme.node.text }}
                        onClick={() => onChange(item.value)}
                        aria-label={`Agent ${item.title}模式`}
                    >
                        {item.icon}
                        <span>{item.title}</span>
                    </button>
                </Tooltip>
            ))}
        </div>
    );
}

function PromptAgentIntentSwitch({ intent, theme, onChange }: { intent: PromptAgentComposerIntent; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (intent: PromptAgentComposerIntent) => void }) {
    return (
        <div className="canvas-composer-mode-switch flex h-8 shrink-0 items-center rounded-full p-0.5" style={{ background: theme.node.fill }}>
            {[
                { value: "auto" as const, title: "自动", icon: <Sparkles className="size-3.5" /> },
                { value: "image_prompt" as const, title: "图片", icon: <ImageIcon className="size-3.5" /> },
                { value: "video_prompt" as const, title: "视频", icon: <Video className="size-3.5" /> },
                { value: "storyboard_prompt" as const, title: "分镜", icon: <Clapperboard className="size-3.5" /> },
            ].map((item) => (
                <Tooltip key={item.value} title={`${item.title}提示词`}>
                    <button
                        type="button"
                        className="canvas-composer-mode-button flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full border-0 bg-transparent px-2 text-xs transition"
                        style={{ background: intent === item.value ? theme.node.activeStroke : "transparent", color: intent === item.value ? theme.node.panel : theme.node.text }}
                        onClick={() => onChange(item.value)}
                        aria-label={`${item.title}提示词`}
                    >
                        {item.icon}
                        <span>{item.title}</span>
                    </button>
                </Tooltip>
            ))}
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
