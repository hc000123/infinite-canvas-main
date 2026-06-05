"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, AudioLines, Image as ImageIcon, LoaderCircle, Video } from "lucide-react";
import { Button, Segmented } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { buildCanvasVideoConfig } from "../utils/canvas-video-config";
import { promptPreviewNoZoomProps, promptPreviewTextareaClass, promptPreviewTextareaStyle } from "../utils/canvas-prompt-preview";
import { applyReferenceMention, filterReferenceMentions, findReferenceMentionTrigger, type CanvasReferenceMentionOption } from "../utils/canvas-reference-mentions";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    projectId?: string;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    referenceMentionOptions?: CanvasReferenceMentionOption[];
};

export function CanvasNodePromptPanel({ node, isRunning, projectId, onPromptChange, onConfigChange, onGenerate, onImageSettingsOpenChange, referenceMentionOptions = [] }: CanvasNodePromptPanelProps) {
    const localConfig = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const globalConfig = effectiveConfig.channelMode === "local" ? localConfig : effectiveConfig;
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const hasSourceVideo = node.type === CanvasNodeType.Video && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const [caret, setCaret] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, count: mode === "image" ? config.count : 1 });
    const mentionTrigger = mode === "video" ? findReferenceMentionTrigger(prompt, caret) : null;
    const mentionMatches = useMemo(() => (mentionTrigger ? filterReferenceMentions(referenceMentionOptions, mentionTrigger.query).slice(0, 6) : []), [mentionTrigger?.query, mentionTrigger?.start, referenceMentionOptions]);

    useEffect(() => {
        setPrompt(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    }, [isEditingExistingContent, node.id]);

    useEffect(() => {
        if (mode !== "video" || config.videoProtocol !== "volcengine-ark" || hasSourceVideo || (config.videoTaskMode !== "edit" && config.videoTaskMode !== "extend")) return;
        onConfigChange(node.id, { videoTaskMode: "generate" });
    }, [config.videoProtocol, config.videoTaskMode, hasSourceVideo, mode, node.id, onConfigChange]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (!isEditingExistingContent) onPromptChange(node.id, value);
    };
    const updateCaret = () => setCaret(textareaRef.current?.selectionStart ?? 0);
    const insertReferenceMention = (option: CanvasReferenceMentionOption) => {
        const next = applyReferenceMention(prompt, caret, option.label);
        updatePrompt(next.text);
        setCaret(next.caret);
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(next.caret, next.caret);
        });
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
        setPrompt("");
    };

    return (
        <div
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    {...promptPreviewNoZoomProps()}
                    value={prompt}
                    onChange={(event) => {
                        updatePrompt(event.target.value);
                        setCaret(event.target.selectionStart);
                    }}
                    onClick={updateCaret}
                    onKeyUp={updateCaret}
                    onSelect={updateCaret}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) return;
                        event.preventDefault();
                        submit();
                    }}
                    className={promptPreviewTextareaClass(mode)}
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, ...promptPreviewTextareaStyle(mode) }}
                    onWheelCapture={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    placeholder={
                        mode === "video"
                            ? "输入 @ 选择图片、视频或音频参考素材"
                            : mode === "image"
                              ? hasImageContent
                                  ? "请输入你想要把这张图修改成什么"
                                  : "描述要生成的图片内容"
                              : hasTextContent
                                ? "请输入你想要将本段文本修改成什么"
                                : "请输入你想要生成的文本内容"
                    }
                />
                {mentionTrigger && mentionMatches.length ? (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border p-1 shadow-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                        {mentionMatches.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    insertReferenceMention(option);
                                }}
                            >
                                <ReferenceMentionPreview option={option} />
                                <span className="min-w-0 flex-1">
                                    <span className="block font-medium">{option.label}</span>
                                    {option.detail ? <span className="block truncate opacity-55">{option.detail}</span> : null}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className={`grid min-w-0 items-center gap-2 ${mode === "text" ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-[auto_minmax(0,1fr)_156px]"}`}>
                    <CanvasPromptLibrary projectId={projectId} nodeGroup={mode} onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker className="h-10 !min-w-0" fullWidth config={config} modelType="image" value={config.model} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !w-[156px] !max-w-[156px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker className="h-10 !min-w-0" fullWidth config={config} modelType="video" value={config.model} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover
                                config={config}
                                showTaskMode
                                hasSourceVideo={hasSourceVideo}
                                buttonClassName="!h-10 !w-[156px] !max-w-[156px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                            />
                        </>
                    ) : (
                        <ModelPicker className="h-10 !min-w-0" fullWidth config={config} modelType="text" value={config.model} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                    )}
                </div>
                <Button type="primary" className="!h-10 !min-w-[84px] shrink-0 !rounded-full !px-3" disabled={isRunning || !prompt.trim()} onClick={submit} aria-label="生成">
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
    );
}

function ReferenceMentionPreview({ option }: { option: CanvasReferenceMentionOption }) {
    const content =
        option.previewUrl && option.previewType === "image" ? (
            <img src={option.previewUrl} alt={option.label} className="h-full w-full object-cover" />
        ) : option.previewUrl && option.previewType === "video" ? (
            <video src={option.previewUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : option.previewType === "video" ? (
            <Video className="size-4 opacity-70" />
        ) : option.previewType === "audio" ? (
            <AudioLines className="size-4 opacity-70" />
        ) : (
            <ImageIcon className="size-4 opacity-70" />
        );
    return <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/25">{content}</span>;
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : globalConfig.textModel;
    if (mode === "video") {
        return {
            ...buildCanvasVideoConfig(globalConfig, node.metadata),
            count: String(node.metadata?.count || globalConfig.count || defaultConfig.count),
        };
    }
    return {
        ...globalConfig,
        model: node.metadata?.model || defaultModel || globalConfig.model || defaultConfig.model,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        videoSeed: node.metadata?.seed || globalConfig.videoSeed || defaultConfig.videoSeed,
        videoPromptReviewEnabled: node.metadata?.videoPromptReviewEnabled || globalConfig.videoPromptReviewEnabled || defaultConfig.videoPromptReviewEnabled,
        count: String(node.metadata?.count || (mode === "image" ? 3 : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string): Partial<CanvasNodeMetadata> {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoSeed") return { seed: value };
    if (key === "videoPromptReviewEnabled") return { videoPromptReviewEnabled: value };
    return { [key]: value } as Partial<CanvasNodeMetadata>;
}
