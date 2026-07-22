"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Alert, Button } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { ModelThinkingSettings } from "@/components/image-settings-panel";
import { inferRemoteVideoProtocol } from "@/services/api/ai-channel-boundary";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { buildCanvasVideoConfig, resolveCanvasVideoChannelConfig } from "../utils/canvas-video-config";
import { promptPreviewNoZoomProps, promptPreviewTextareaClass, promptPreviewTextareaStyle } from "../utils/canvas-prompt-preview";
import type { CanvasReferenceMentionOption } from "../utils/canvas-reference-mentions";
import { promptDocumentFromText, serializePromptDocument, validatePromptDocument, type CanvasPromptDocument } from "../utils/canvas-prompt-document";
import { CANVAS_IMAGE_GENERATION_DEFAULT_COUNT } from "../constants";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

const CanvasPromptEditor = dynamic(() => import("./canvas-prompt-editor").then((module) => module.CanvasPromptEditor), { ssr: false });

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    projectId?: string;
    onPromptChange: (nodeId: string, prompt: string, promptDocument?: CanvasPromptDocument) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    referenceMentionOptions?: CanvasReferenceMentionOption[];
    onPreviewReference?: (nodeId: string) => void;
};

export function CanvasNodePromptPanel({ node, isRunning, projectId, onPromptChange, onConfigChange, onGenerate, onImageSettingsOpenChange, referenceMentionOptions = [], onPreviewReference }: CanvasNodePromptPanelProps) {
    const localConfig = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const globalConfig = resolveCanvasVideoChannelConfig(localConfig, effectiveConfig, publicSettings?.modelChannel, mode === "video" ? node.metadata?.channelMode : undefined);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const hasSourceVideo = node.type === CanvasNodeType.Video && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const [promptDocument, setPromptDocument] = useState<CanvasPromptDocument>(() => node.metadata?.promptDocument || promptDocumentFromText(isEditingExistingContent ? "" : node.metadata?.prompt || ""));
    const [editorRevision, setEditorRevision] = useState(0);
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, fallbackModel: mode === "video" ? config.seedanceModel || config.videoModel : undefined, count: mode === "image" ? config.count : 1 });
    const missingReferenceIds = mode === "video" ? validatePromptDocument(promptDocument, referenceMentionOptions) : [];

    useEffect(() => {
        if (mode !== "video" || config.videoProtocol !== "volcengine-ark" || hasSourceVideo || (config.videoTaskMode !== "edit" && config.videoTaskMode !== "extend")) return;
        onConfigChange(node.id, { videoTaskMode: "generate" });
    }, [config.videoProtocol, config.videoTaskMode, hasSourceVideo, mode, node.id, onConfigChange]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (mode === "video") {
            const nextDocument = promptDocumentFromText(value);
            setPromptDocument(nextDocument);
            setEditorRevision((revision) => revision + 1);
            if (!isEditingExistingContent) onPromptChange(node.id, value, nextDocument);
        } else if (!isEditingExistingContent) onPromptChange(node.id, value);
    };
    const updatePromptDocument = (nextDocument: CanvasPromptDocument) => {
        const value = serializePromptDocument(nextDocument, referenceMentionOptions);
        setPromptDocument(nextDocument);
        setPrompt(value);
        if (!isEditingExistingContent) onPromptChange(node.id, value, nextDocument);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning || missingReferenceIds.length) return;
        onGenerate(node.id, mode, text);
        setPrompt("");
        if (mode === "video") {
            setPromptDocument(promptDocumentFromText(""));
            setEditorRevision((revision) => revision + 1);
        }
    };

    return (
        <div
            className="rounded-lg border p-3 shadow-[var(--studio-shadow)] backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {mode === "video" ? (
                <CanvasPromptEditor
                    key={`${node.id}:${editorRevision}`}
                    initialDocument={promptDocument}
                    options={referenceMentionOptions}
                    placeholder="输入 @ 选择图片、视频或音频参考素材"
                    onChange={updatePromptDocument}
                    onPreviewReference={onPreviewReference}
                />
            ) : (
            <div className="relative">
                <textarea
                    {...promptPreviewNoZoomProps()}
                    value={prompt}
                    onChange={(event) => {
                        updatePrompt(event.target.value);
                    }}
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
                        mode === "image"
                              ? hasImageContent
                                  ? "请输入你想要把这张图修改成什么"
                                  : "描述要生成的图片内容"
                              : hasTextContent
                                ? "请输入你想要将本段文本修改成什么"
                                : "请输入你想要生成的文本内容"
                    }
                />
            </div>
            )}
            {missingReferenceIds.length ? <Alert className="mt-2" type="warning" showIcon message="有参考素材已被删除，请移除失效的引用后再生成" /> : null}

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
                    <CanvasPromptLibrary projectId={projectId} nodeGroup={mode} onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker className="h-10 !min-w-[140px] flex-1" fullWidth config={config} modelType="image" value={config.model} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                            <ModelThinkingSettings className="min-w-[236px] flex-1" config={config} model={config.model} theme={theme} onConfigChange={(key, value) => onConfigChange(node.id, { [key]: value })} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !w-[156px] !max-w-full !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker
                                className="h-10 !min-w-[120px] flex-1"
                                fullWidth
                                config={config}
                                modelType="video"
                                value={config.model}
                                onChange={(model) => onConfigChange(node.id, videoModelPatch(config, model))}
                                onMissingConfig={() => openConfigDialog(true)}
                            />
                            <CanvasVideoSettingsPopover
                                config={config}
                                showTaskMode
                                hasSourceVideo={hasSourceVideo}
                                disabled={isRunning}
                                buttonClassName="!h-10 !w-[142px] !max-w-full !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                            />
                        </>
                    ) : (
                        <ModelPicker className="h-10 !min-w-[140px] flex-1" fullWidth config={config} modelType="text" value={config.model} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                    )}
                </div>
                <Button type="primary" className="!h-10 !min-w-[84px] shrink-0 !rounded-full !px-3" disabled={isRunning || !prompt.trim() || Boolean(missingReferenceIds.length)} onClick={submit} aria-label="生成">
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
        count: String(node.metadata?.count || (mode === "image" ? CANVAS_IMAGE_GENERATION_DEFAULT_COUNT : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string): Partial<CanvasNodeMetadata> {
    if (key === "videoSeconds") return { seconds: value, duration: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoSeed") return { seed: value };
    if (key === "videoPromptReviewEnabled") return { videoPromptReviewEnabled: value };
    return { [key]: value } as Partial<CanvasNodeMetadata>;
}

function videoModelPatch(config: AiConfig, model: string): Partial<CanvasNodeMetadata> {
    return {
        model,
        provider: inferRemoteVideoProtocol(model, config.videoProtocol || "openai", config.modelProtocols || []),
    };
}
