"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Alert, Button, Modal } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { ModelThinkingSettings } from "@/components/image-settings-panel";
import { inferRemoteVideoProtocol } from "@/services/api/ai-channel-boundary";
import { defaultConfig, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { buildCanvasVideoConfig, resolveCanvasVideoChannelConfig } from "../utils/canvas-video-config";
import { canSubmitCanvasPrompt } from "../utils/canvas-prompt-preview";
import type { CanvasReferenceMentionOption } from "../utils/canvas-reference-mentions";
import { promptDocumentFromText, serializePromptDocument, validatePromptDocument, type CanvasPromptDocument } from "../utils/canvas-prompt-document";
import { CANVAS_IMAGE_GENERATION_DEFAULT_COUNT } from "../constants";
import { canvasPromptEditorDocument, canvasPromptEditorValue } from "../utils/canvas-media-versions";
import { CanvasImageCameraPopover } from "./canvas-image-camera-popover";
import { CanvasImagePresetPopover, type CanvasImagePreset } from "./canvas-image-preset-popover";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasMediaVersionControl } from "./canvas-media-version-control";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

const CanvasPromptEditor = dynamic(() => import("./canvas-prompt-editor").then((module) => module.CanvasPromptEditor), { ssr: false });

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    canvasAiConfig: AiConfig;
    isRunning: boolean;
    projectId?: string;
    onPromptChange: (nodeId: string, prompt: string, promptDocument?: CanvasPromptDocument) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    referenceMentionOptions?: CanvasReferenceMentionOption[];
    hasConnectedText?: boolean;
    onPreviewReference?: (nodeId: string) => void;
    onSwitchMediaVersion?: (node: CanvasNodeData, versionId: string) => void;
};

export function CanvasNodePromptPanel({ node, canvasAiConfig, isRunning, projectId, onPromptChange, onConfigChange, onGenerate, onImageSettingsOpenChange, referenceMentionOptions = [], hasConnectedText = false, onPreviewReference, onSwitchMediaVersion }: CanvasNodePromptPanelProps) {
    const localConfig = useConfigStore((state) => state.config);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const globalConfig = resolveCanvasVideoChannelConfig(localConfig, canvasAiConfig, publicSettings?.modelChannel, mode === "video" ? node.metadata?.channelMode : undefined);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const hasSourceVideo = node.type === CanvasNodeType.Video && Boolean(node.metadata?.content);
    const isGeneratedMedia = hasImageContent || hasSourceVideo;
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const initialPrompt = canvasPromptEditorValue(node);
    const [prompt, setPrompt] = useState(initialPrompt);
    const [promptDocument, setPromptDocument] = useState<CanvasPromptDocument>(() => canvasPromptEditorDocument(node) || promptDocumentFromText(initialPrompt));
    const [editorRevision, setEditorRevision] = useState(0);
    const [expandedEditorOpen, setExpandedEditorOpen] = useState(false);
    const [expandedPromptDocument, setExpandedPromptDocument] = useState(promptDocument);
    const latestNodeRef = useRef(node);
    latestNodeRef.current = node;
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, fallbackModel: mode === "video" ? config.seedanceModel || config.videoModel : undefined, count: mode === "image" ? config.count : 1 });
    const missingReferenceIds = validatePromptDocument(promptDocument, referenceMentionOptions);
    const canSubmit = canSubmitCanvasPrompt(prompt, isRunning, hasConnectedText) && missingReferenceIds.length === 0;

    useEffect(() => {
        const currentNode = latestNodeRef.current;
        const nextPrompt = canvasPromptEditorValue(currentNode);
        setPrompt(nextPrompt);
        setPromptDocument(canvasPromptEditorDocument(currentNode) || promptDocumentFromText(nextPrompt));
        setEditorRevision((revision) => revision + 1);
    }, [node.id, node.metadata?.currentMediaVersionId]);

    useEffect(() => {
        if (mode !== "video" || config.videoProtocol !== "volcengine-ark" || hasSourceVideo || (config.videoTaskMode !== "edit" && config.videoTaskMode !== "extend")) return;
        onConfigChange(node.id, { videoTaskMode: "generate" });
    }, [config.videoProtocol, config.videoTaskMode, hasSourceVideo, mode, node.id, onConfigChange]);

    const updatePrompt = (value: string) => {
        const nextDocument = promptDocumentFromText(value);
        setPrompt(value);
        setPromptDocument(nextDocument);
        setEditorRevision((revision) => revision + 1);
        onPromptChange(node.id, value, nextDocument);
    };
    const updatePromptDocument = (nextDocument: CanvasPromptDocument) => {
        const value = serializePromptDocument(nextDocument, referenceMentionOptions);
        setPromptDocument(nextDocument);
        setPrompt(value);
        onPromptChange(node.id, value, nextDocument);
    };
    const openExpandedEditor = () => {
        setExpandedPromptDocument(promptDocument);
        setExpandedEditorOpen(true);
    };
    const saveExpandedEditor = () => {
        updatePromptDocument(expandedPromptDocument);
        setEditorRevision((revision) => revision + 1);
        setExpandedEditorOpen(false);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!canSubmit) return;
        onGenerate(node.id, mode, mode === "image" ? appendImageCameraPrompt(text, node.metadata) : text);
        if (!isGeneratedMedia) {
            setPrompt("");
            setPromptDocument(promptDocumentFromText(""));
            setEditorRevision((revision) => revision + 1);
        }
    };

    const applyImagePreset = (preset: CanvasImagePreset) => {
        updatePrompt(preset.prompt);
        onConfigChange(node.id, {
            imagePresetId: preset.id,
            imagePresetLabel: preset.label,
            quality: preset.quality,
            size: preset.size,
            ...(!isEditingExistingContent ? { prompt: preset.prompt } : {}),
        });
    };

    return (
        <div
            className="rounded-lg border px-4 pb-3 pt-3 shadow-[var(--studio-shadow)] backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <CanvasMediaVersionControl node={node} disabled={isRunning} variant="panel" className="mb-3" onSwitch={onSwitchMediaVersion} />
            <CanvasPromptEditor
                key={`${node.id}:${editorRevision}`}
                initialDocument={promptDocument}
                options={referenceMentionOptions}
                placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
                onChange={updatePromptDocument}
                onPreviewReference={onPreviewReference}
                onExpand={openExpandedEditor}
            />
            {missingReferenceIds.length ? <Alert className="mt-2" type="warning" showIcon message="有参考素材已被删除，请移除失效的引用后再生成" /> : null}

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
                    <CanvasPromptLibrary projectId={projectId} nodeGroup={mode} onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker className="h-10 !min-w-[150px] flex-1" fullWidth config={config} modelType="image" value={config.model} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !w-[220px] !max-w-full !justify-start !rounded-lg !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                            <CanvasImagePresetPopover value={node.metadata?.imagePresetId} buttonClassName="!h-10 !w-[150px] !max-w-full !justify-start !rounded-lg !px-3" onSelect={applyImagePreset} />
                            <CanvasImageCameraPopover
                                value={node.metadata}
                                buttonClassName="!h-10 !w-[132px] !max-w-full !justify-start !rounded-lg !px-3"
                                onChange={(patch) => onConfigChange(node.id, patch)}
                            />
                            <ModelThinkingSettings className="min-w-[236px] flex-1" config={config} model={config.model} theme={theme} onConfigChange={(key, value) => onConfigChange(node.id, { [key]: value })} />
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
                <Button type="primary" className="!h-10 !min-w-[126px] shrink-0 !rounded-full !px-3" disabled={!canSubmit} onClick={submit} aria-label={isGeneratedMedia ? "生成新版本" : "生成"} title={isGeneratedMedia ? "生成新版本" : "生成"}>
                    <span className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{isGeneratedMedia ? "新版本" : "生成"}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                            <CreditSymbol />
                            {credits.toLocaleString()}
                        </span>
                        {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                    </span>
                </Button>
            </div>
            <Modal
                rootClassName="studio-modal"
                title="展开编辑提示词"
                open={expandedEditorOpen}
                width="min(1040px, calc(100vw - 32px))"
                okText="保存"
                cancelText="取消"
                destroyOnHidden
                onCancel={() => setExpandedEditorOpen(false)}
                onOk={saveExpandedEditor}
            >
                <CanvasPromptEditor
                    key={`${node.id}:expanded:${expandedEditorOpen}`}
                    initialDocument={expandedPromptDocument}
                    options={referenceMentionOptions}
                    placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
                    expanded
                    onChange={setExpandedPromptDocument}
                    onPreviewReference={onPreviewReference}
                />
            </Modal>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : "image";
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    const action = mode === "image" ? (hasImageContent ? "描述要如何修改图片" : "描述要生成的图片") : mode === "text" ? (hasTextContent ? "输入文本修改要求" : "输入文本生成要求") : "描述要生成或修改的视频";
    return `${action}，输入 @ 选择已连接的参考素材`;
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

function appendImageCameraPrompt(prompt: string, metadata?: CanvasNodeMetadata) {
    const cameraParts = [
        metadata?.imageCameraName ? `摄影机 ${metadata.imageCameraName}` : "",
        metadata?.imageLensName ? `镜头 ${metadata.imageLensName}` : "",
        metadata?.imageFocalLength ? `焦距 ${metadata.imageFocalLength}mm` : "",
        metadata?.imageAperture ? `光圈 ${metadata.imageAperture}` : "",
    ].filter(Boolean);
    if (!cameraParts.length) return prompt;
    return `${prompt}\n\n摄影参数：${cameraParts.join("，")}，真实电影摄影质感，自然景深和真实光学成像。`;
}
