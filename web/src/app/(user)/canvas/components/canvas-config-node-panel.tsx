"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { ArrowRight, AudioLines, Clapperboard, Eye, Image as ImageIcon, LoaderCircle, MessageSquare, Play, Video } from "lucide-react";
import { Alert, App, Button, Segmented } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { videoRatioLabel, videoResolutionLabel, videoSecondsLabel } from "@/components/video-settings-panel";
import { defaultConfig, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { requestCreditQuantity } from "@/constant/credit-quantity";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { resolveDreaminaVideoCapability, validateDreaminaReferences } from "@/lib/dreamina-video-capabilities";
import { defaultSeedanceImageRole, inferVideoReferenceMode, normalizeSeedanceImageRole, normalizeVideoReferenceMode, seedanceReferenceLabelRange } from "@/services/api/video-reference";
import { useThemeStore } from "@/stores/use-theme-store";
import { buildCanvasVideoConfig, buildCanvasVideoModePatch, buildCanvasVideoModelPatch, resolveCanvasVideoChannelConfig } from "../utils/canvas-video-config";
import { buildReferenceMentionOptions } from "../utils/canvas-reference-mentions";
import { promptDocumentFromText, serializePromptDocument, validatePromptDocument, type CanvasPromptDocument } from "../utils/canvas-prompt-document";
import { CANVAS_IMAGE_GENERATION_DEFAULT_COUNT } from "../constants";
import { CanvasConfigNodePreview } from "./canvas-config-node-preview";
import { CanvasConnectedMediaStrip } from "./canvas-connected-media-strip";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasVideoCapabilityHint } from "./canvas-video-capability-hint";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import type { NodeGenerationInput } from "./canvas-node-generation";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "../types";
import type { ReferenceImageRole } from "@/types/image";
import type { CanvasConnectedMediaItem } from "../utils/canvas-connected-media";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    canvasAiConfig: AiConfig;
    isRunning: boolean;
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    inputs: NodeGenerationInput[];
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onTextInputChange: (nodeId: string, content: string) => void;
    onGenerate: (nodeId: string) => void;
    onPreviewReference?: (nodeId: string) => void;
    connectedMedia?: CanvasConnectedMediaItem[];
    onDisconnectConnectedMedia?: (connectionId: string) => void;
};

export function CanvasConfigNodePanel({ node, canvasAiConfig, isRunning, inputSummary, inputs, onConfigChange, onTextInputChange, onGenerate, onPreviewReference, connectedMedia = [], onDisconnectConnectedMedia }: CanvasConfigNodePanelProps) {
    const { message } = App.useApp();
    const [previewOpen, setPreviewOpen] = useState(false);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState("");
    const localConfig = useConfigStore((state) => state.config);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode || "image";
    const globalConfig = resolveCanvasVideoChannelConfig(localConfig, canvasAiConfig, publicSettings?.modelChannel, mode === "video" ? node.metadata?.channelMode : undefined);
    const config = buildNodeConfig(globalConfig, node, mode);
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(node.metadata?.count || CANVAS_IMAGE_GENERATION_DEFAULT_COUNT)) || 1)));
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, fallbackModel: mode === "video" ? config.seedanceModel || config.videoModel : undefined, count: mode === "video" ? requestCreditQuantity({ count: config.videoSeconds, videoProtocol: config.videoProtocol, videoModel: config.videoModel || config.seedanceModel || config.model, videoTaskMode: config.videoTaskMode }) : mode === "image" ? count : 1 });
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const textInputs = inputs.filter((input) => input.type === "text");
    const imageInputs = inputs.filter((input) => input.type === "image");
    const videoInputs = inputs.filter((input) => input.type === "video");
    const audioInputs = inputs.filter((input) => input.type === "audio");
    const mediaInputs = inputs.filter((input) => input.type === "image" || input.type === "video" || input.type === "audio");
    const ownPrompt = String(node.metadata?.prompt || node.metadata?.finalPrompt || "");
    const referenceMentionOptions = buildReferenceMentionOptions(inputs);
    const ownPromptDocument = node.metadata?.promptDocument || promptDocumentFromText(ownPrompt);
    const missingReferenceIds = validatePromptDocument(ownPromptDocument, referenceMentionOptions);
    const promptCount = inputSummary.textCount + (ownPrompt.trim() ? 1 : 0);
    const hasGenerationInput = Boolean(promptCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasSourceVideo = videoInputs.some((input) => Boolean(input.video?.url));
    const storedVideoReferenceMode = normalizeVideoReferenceMode(config.videoReferenceMode);
    const resolvedVideoReferenceMode = storedVideoReferenceMode === "auto"
        ? inferVideoReferenceMode({ imageCount: imageInputs.length, videoCount: videoInputs.length, audioCount: audioInputs.length, imageRoleMode: config.videoReferenceImageMode })
        : storedVideoReferenceMode;
    const videoCapability = mode === "video" ? resolveDreaminaVideoCapability({ protocol: config.videoProtocol, model: config.videoModel, mode: resolvedVideoReferenceMode }) : null;
    const videoReferenceValidation = mode === "video"
        ? validateDreaminaReferences({ protocol: config.videoProtocol, model: config.videoModel, mode: resolvedVideoReferenceMode, images: imageInputs.length, videos: videoInputs.length, audios: audioInputs.length })
        : { error: "", usageLabel: "", detailLabel: "" };
    const generationBlocked = isRunning || !hasGenerationInput || missingReferenceIds.length > 0 || Boolean(videoReferenceValidation.error);
    const imageReferenceValue = mode === "video" && imageInputs.length ? seedanceReferenceLabelRange("image", imageInputs.length) : `${inputSummary.imageCount} 张`;
    const videoReferenceValue = videoInputs.length ? seedanceReferenceLabelRange("video", videoInputs.length) : `${inputSummary.videoCount} 个`;
    const audioReferenceValue = audioInputs.length ? seedanceReferenceLabelRange("audio", audioInputs.length) : `${inputSummary.audioCount} 个`;
    const modeLabel = mode === "video" ? "视频生成方案" : mode === "text" ? "文本生成方案" : "图片生成方案";
    const modeHint = mode === "video" ? "收集提示词、参考素材和模型参数，用来生成视频版本" : mode === "text" ? "收集上下文和模型参数，用来生成文本结果" : "收集提示词、参考图和模型参数，用来生成图片";
    const emptyHint = mode === "video" ? "先连接提示词或参考素材，再生成视频版本" : mode === "text" ? "先连接文本上下文，再生成文本结果" : "先连接提示词或参考图，再生成图片";

    const moveInput = (input: NodeGenerationInput, offset: number, scopedInputs?: NodeGenerationInput[]) => {
        const sameTypeInputs = scopedInputs || inputs.filter((item) => item.type === input.type);
        const sameTypeIndex = sameTypeInputs.findIndex((item) => item.nodeId === input.nodeId);
        const targetInput = sameTypeInputs[sameTypeIndex + offset];
        if (!targetInput) return;
        const index = inputs.findIndex((item) => item.nodeId === input.nodeId);
        const targetIndex = inputs.findIndex((item) => item.nodeId === targetInput.nodeId);
        const next = [...inputs];
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        onConfigChange(node.id, { inputOrder: next.map((input) => input.nodeId) });
        message.success("已调整输入顺序");
    };
    const imageReferenceRole = (input: NodeGenerationInput, index: number): ReferenceImageRole => {
        const configuredRole = node.metadata?.referenceRoles?.find((item) => item.kind === "image" && item.nodeId === input.nodeId)?.role;
        return normalizeSeedanceImageRole(configuredRole) || defaultSeedanceImageRole(index, config.videoReferenceImageMode);
    };
    const changeImageReferenceRole = (input: NodeGenerationInput, index: number, role: ReferenceImageRole) => {
        const current = node.metadata?.referenceRoles || [];
        const next = [
            ...current.filter((item) => !(item.kind === "image" && item.nodeId === input.nodeId)),
            {
                nodeId: input.nodeId,
                kind: "image" as const,
                role,
                index: index + 1,
            },
        ];
        onConfigChange(node.id, { referenceRoles: next });
    };
    const startTextEdit = (input: NodeGenerationInput) => {
        setEditingTextId(input.nodeId);
        setEditingText(input.text || "");
    };
    const changeOwnPrompt = (document: CanvasPromptDocument) => {
        onConfigChange(node.id, {
            promptDocument: document,
            prompt: serializePromptDocument(document, referenceMentionOptions),
        });
    };

    useEffect(() => {
        if (mode !== "video" || config.videoProtocol !== "volcengine-ark" || hasSourceVideo || (config.videoTaskMode !== "edit" && config.videoTaskMode !== "extend")) return;
        onConfigChange(node.id, { videoTaskMode: "generate" });
    }, [config.videoProtocol, config.videoTaskMode, hasSourceVideo, mode, node.id, onConfigChange]);

    const saveTextEdit = () => {
        if (!editingTextId) return;
        onTextInputChange(editingTextId, editingText);
        setEditingText("");
        setEditingTextId(null);
        message.success("已保存文本提示词");
    };

    if (mode === "video") {
        const videoPromptPreview = ownPrompt || textInputs.map((input) => input.text).filter(Boolean).join("\n\n");
        const referencePreset = resolveVideoReferencePreset(config.videoReferenceMode, config.videoReferenceImageMode, imageInputs.length, videoInputs.length, audioInputs.length);
        const imageReferences = imageInputs.map((input, index) => ({ input, role: imageReferenceRole(input, index) }));
        return (
            <div className="flex h-full w-full cursor-move flex-col gap-2 overflow-hidden p-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
                <div className="flex shrink-0 items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>
                            <Clapperboard className="size-4.5" />
                        </span>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold leading-5">视频生成方案</div>
                            <div className="truncate text-[10px] leading-4 opacity-55">{videoConfigSummary(config)}</div>
                        </div>
                    </div>
                    <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                        <Segmented
                            size="small"
                            className="canvas-config-mode !rounded-md !p-0.5"
                            value={mode}
                            onChange={(value) => onConfigChange(node.id, generationModePatch(globalConfig, value as CanvasGenerationMode))}
                            options={[
                                { value: "image", label: <ImageIcon className="size-3.5" /> },
                                { value: "text", label: <MessageSquare className="size-3.5" /> },
                                { value: "video", label: <Video className="size-3.5" /> },
                            ]}
                        />
                    </div>
                </div>

                {onDisconnectConnectedMedia ? <CanvasConnectedMediaStrip items={connectedMedia} onPreview={onPreviewReference} onDisconnect={onDisconnectConnectedMedia} /> : null}

                <VideoReferenceModeTabs
                    imageCount={imageInputs.length}
                    mediaCount={mediaInputs.length}
                    preset={referencePreset}
                    showMultiFrame={config.videoProtocol !== "minimax"}
                    theme={theme}
                    onModeChange={(videoReferenceMode, videoReferenceImageMode) => onConfigChange(node.id, { videoReferenceMode, videoReferenceImageMode })}
                />

                <CanvasVideoCapabilityHint
                    compact
                    theme={theme}
                    label={videoCapability?.label}
                    notice={videoCapability?.notice}
                    usageLabel={videoReferenceValidation.usageLabel}
                    detailLabel={videoReferenceValidation.detailLabel}
                    error={videoReferenceValidation.error}
                />

                <VideoReferenceDisplay imageReferences={imageReferences} inputs={mediaInputs} preset={referencePreset} theme={theme} />

                <button
                    type="button"
                    className="min-h-0 flex-1 cursor-pointer rounded-lg border p-2 text-left transition hover:opacity-90"
                    style={{ background: `${theme.node.fill}cc`, borderColor: theme.node.stroke, color: theme.node.text }}
                    onClick={() => setPreviewOpen(true)}
                    onMouseDown={(event) => event.stopPropagation()}
                    title="打开输入预览"
                >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium opacity-55">
                        <span>提示词</span>
                        <span>{promptCount ? `${promptCount} 段` : "未连接"}</span>
                    </div>
                    <div className={`thin-scrollbar max-h-full overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-5 ${videoPromptPreview ? "" : "opacity-55"}`}>
                        {videoPromptPreview || emptyHint}
                    </div>
                </button>

                {missingReferenceIds.length ? <Alert type="warning" showIcon message="有参考素材已断开，请移除失效引用或恢复连线" /> : null}

                <div className="flex shrink-0 items-center gap-1.5" onMouseDown={(event) => event.stopPropagation()}>
                    <ModelPicker
                        className="canvas-compact-control h-8 !min-w-[78px] !flex-1 !rounded-lg !px-2 !text-xs"
                        config={config}
                        modelType="video"
                        value={config.model}
                        onChange={(model) => onConfigChange(node.id, buildCanvasVideoModelPatch(config, model))}
                        onMissingConfig={() => openConfigDialog(true)}
                        fullWidth
                    />
                    <CanvasVideoSettingsPopover
                        config={config}
                        placement="topRight"
                        showTaskMode
                        hasSourceVideo={hasSourceVideo}
                        disabled={isRunning}
                        buttonClassName="canvas-compact-control !h-8 !w-[124px] !justify-start !rounded-lg !px-2 !text-xs"
                        onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                    />
                    <button
                        type="button"
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border transition hover:opacity-80"
                        style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                        onClick={() => setPreviewOpen(true)}
                        title="输入预览"
                    >
                        <Eye className="size-3.5" />
                    </button>
                    <Button
                        type="primary"
                        className="!h-8 !min-w-[68px] shrink-0 !cursor-pointer !rounded-lg !px-2"
                        disabled={generationBlocked}
                        onClick={() => onGenerate(node.id)}
                        title={videoReferenceValidation.error || (missingReferenceIds.length ? "请先处理失效的素材引用" : hasGenerationInput ? "开始生成" : emptyHint)}
                    >
                        <span className="inline-flex items-center gap-1">
                            <span className="inline-flex items-center gap-0.5 text-[11px]">
                                <CreditSymbol />
                                {credits.toLocaleString()}
                            </span>
                            {isRunning ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                        </span>
                    </Button>
                </div>

                <CanvasConfigNodePreview
                    audioInputs={audioInputs}
                    editingText={editingText}
                    editingTextId={editingTextId}
                    imageInputs={imageInputs}
                    imageReferenceRole={imageReferenceRole}
                    mediaInputs={mediaInputs}
                    mode={mode}
                    onChangeImageReferenceRole={changeImageReferenceRole}
                    onClose={() => setPreviewOpen(false)}
                    onEditingTextChange={setEditingText}
                    onMoveInput={moveInput}
                    onOwnPromptChange={changeOwnPrompt}
                    onPreviewReference={onPreviewReference}
                    onSaveTextEdit={saveTextEdit}
                    onStartTextEdit={startTextEdit}
                    onStopTextEdit={() => setEditingTextId(null)}
                    open={previewOpen}
                    ownPromptDocument={ownPromptDocument}
                    referenceMentionOptions={referenceMentionOptions}
                    textInputs={textInputs}
                    theme={theme}
                    videoInputs={videoInputs}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full w-full cursor-move flex-col gap-2 overflow-hidden px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5">
                <div className="min-w-0 shrink">
                    <div className="truncate text-sm font-semibold leading-5">{modeLabel}</div>
                    <div className="truncate text-[10px] leading-4 opacity-55">{modeHint}</div>
                </div>
                <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        size="small"
                        className="canvas-config-mode !rounded-md !p-0.5"
                        value={mode}
                        onChange={(value) => onConfigChange(node.id, generationModePatch(globalConfig, value as CanvasGenerationMode))}
                        options={[
                            {
                                value: "image",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <ImageIcon className="size-3.5" />
                                        生图
                                    </span>
                                ),
                            },
                            {
                                value: "text",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <MessageSquare className="size-3.5" />
                                        文本
                                    </span>
                                ),
                            },
                            {
                                value: "video",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Video className="size-3.5" />
                                        视频
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>

            {onDisconnectConnectedMedia ? <CanvasConnectedMediaStrip items={connectedMedia} onPreview={onPreviewReference} onDisconnect={onDisconnectConnectedMedia} /> : null}

            <div className="grid shrink-0 grid-cols-2 gap-1.5" onMouseDown={(event) => event.stopPropagation()}>
                <InputChip label="提示" value={`${promptCount}`} style={chipStyle} />
                <InputChip label="图" value={imageReferenceValue} style={chipStyle} />
                <button type="button" className="inline-flex h-6 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md border px-2 text-[11px]" style={chipStyle} onClick={() => setPreviewOpen(true)}>
                    <Eye className="size-3.5" />
                    预览
                </button>
            </div>

            {!hasGenerationInput ? (
                <div className="shrink-0 rounded-md border border-dashed px-2 py-1.5 text-[11px] leading-4 opacity-65" style={{ borderColor: theme.node.stroke, background: `${theme.node.fill}88` }}>
                    {emptyHint}
                </div>
            ) : null}

            {missingReferenceIds.length ? <Alert type="warning" showIcon message="有参考素材已断开，请移除失效引用或恢复连线" /> : null}

            <div className="grid min-w-0 shrink-0 cursor-default gap-1.5" onMouseDown={(event) => event.stopPropagation()}>
                <ModelPicker
                    className="canvas-compact-control h-8 !rounded-lg !px-2 !text-xs"
                    config={config}
                    modelType={mode}
                    value={config.model}
                    onChange={(model) => onConfigChange(node.id, { model })}
                    onMissingConfig={() => openConfigDialog(true)}
                    fullWidth
                />
                {mode === "image" ? (
                    <CanvasImageSettingsPopover
                        config={config}
                        placement="topRight"
                        autoAdjustOverflow={false}
                        buttonClassName="canvas-compact-control !h-8 !w-full !justify-start !rounded-lg !px-2 !text-xs"
                        onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                    />
                ) : null}
            </div>

            <Button
                type="primary"
                className="mt-auto !h-9 !w-full !cursor-pointer !rounded-lg"
                disabled={isRunning || !hasGenerationInput || missingReferenceIds.length > 0}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onGenerate(node.id)}
                title={missingReferenceIds.length ? "请先处理失效的素材引用" : hasGenerationInput ? "开始生成" : emptyHint}
            >
                <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1">
                        <CreditSymbol />
                        {credits.toLocaleString()}
                    </span>
                    {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                    <span>{hasGenerationInput ? "开始生成" : "等待输入"}</span>
                </span>
            </Button>
            <CanvasConfigNodePreview
                audioInputs={audioInputs}
                editingText={editingText}
                editingTextId={editingTextId}
                imageInputs={imageInputs}
                imageReferenceRole={imageReferenceRole}
                mediaInputs={mediaInputs}
                mode={mode}
                onChangeImageReferenceRole={changeImageReferenceRole}
                onClose={() => setPreviewOpen(false)}
                onEditingTextChange={setEditingText}
                onMoveInput={moveInput}
                onOwnPromptChange={changeOwnPrompt}
                onPreviewReference={onPreviewReference}
                onSaveTextEdit={saveTextEdit}
                onStartTextEdit={startTextEdit}
                onStopTextEdit={() => setEditingTextId(null)}
                open={previewOpen}
                ownPromptDocument={ownPromptDocument}
                referenceMentionOptions={referenceMentionOptions}
                textInputs={textInputs}
                theme={theme}
                videoInputs={videoInputs}
            />
        </div>
    );
}

type VideoReferencePreset = "text" | "all_reference" | "first_frame" | "first_last_frame" | "multi_frame";

function VideoReferenceModeTabs({
    imageCount,
    mediaCount,
    preset,
    showMultiFrame,
    theme,
    onModeChange,
}: {
    imageCount: number;
    mediaCount: number;
    preset: VideoReferencePreset;
    showMultiFrame: boolean;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onModeChange: (mode: NonNullable<CanvasNodeMetadata["videoReferenceMode"]>, imageMode: NonNullable<CanvasNodeMetadata["videoReferenceImageMode"]>) => void;
}) {
    const items: Array<{ value: VideoReferencePreset; label: string; disabled?: boolean; mode: NonNullable<CanvasNodeMetadata["videoReferenceMode"]>; imageMode: NonNullable<CanvasNodeMetadata["videoReferenceImageMode"]> }> = [
        { value: "text", label: "文生视频", disabled: mediaCount > 0, mode: "text2video", imageMode: "reference" },
        { value: "first_frame", label: "图生视频", disabled: imageCount === 0, mode: "image2video", imageMode: "first_frame" },
        { value: "first_last_frame", label: "首尾帧", disabled: imageCount < 2, mode: "frames2video", imageMode: "first_last_frame" },
        { value: "multi_frame", label: "多帧故事 · 固定模型", disabled: imageCount < 2, mode: "multiframe2video", imageMode: "reference" },
        { value: "all_reference", label: "全能参考", disabled: mediaCount === 0, mode: "multimodal2video", imageMode: "reference" },
    ];
    const visibleItems = items.filter((item) => showMultiFrame || item.value !== "multi_frame");

    return (
        <div className="thin-scrollbar flex shrink-0 gap-1 overflow-x-auto pb-0.5" onMouseDown={(event) => event.stopPropagation()}>
            {visibleItems.map((item) => {
                const active = preset === item.value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        className="h-8 shrink-0 cursor-pointer rounded-lg border px-2 text-[11px] font-medium transition hover:opacity-85 disabled:cursor-not-allowed disabled:hover:opacity-40"
                        style={{
                            background: active ? theme.toolbar.activeBg : theme.node.fill,
                            borderColor: active ? theme.node.activeStroke : theme.node.stroke,
                            color: active ? theme.toolbar.activeText : theme.node.text,
                            opacity: item.disabled && !active ? 0.4 : 1,
                        }}
                        disabled={item.disabled}
                        title={item.value === "multi_frame" ? "多帧故事使用 CLI 固定模型，不受当前 2.5 选择影响" : item.label}
                        onClick={() => onModeChange(item.mode, item.imageMode)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}

function VideoReferenceDisplay({
    imageReferences,
    inputs,
    preset,
    theme,
}: {
    imageReferences: Array<{ input: NodeGenerationInput; role: ReferenceImageRole }>;
    inputs: NodeGenerationInput[];
    preset: VideoReferencePreset;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
}) {
    if (preset === "first_last_frame") {
        const first = imageReferences.find((item) => item.role === "first_frame")?.input || imageReferences[0]?.input;
        const last = imageReferences.find((item) => item.role === "last_frame")?.input || imageReferences.find((item) => item.input.nodeId !== first?.nodeId)?.input;
        const extraCount = Math.max(0, inputs.length - [first?.nodeId, last?.nodeId].filter(Boolean).length);
        return <FirstLastFrameStrip first={first} last={last} extraCount={extraCount} theme={theme} />;
    }
    return <VideoReferenceStrip inputs={inputs} theme={theme} />;
}

function FirstLastFrameStrip({
    first,
    last,
    extraCount,
    theme,
}: {
    first?: NodeGenerationInput;
    last?: NodeGenerationInput;
    extraCount: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
}) {
    return (
        <div className="grid h-[72px] shrink-0 grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)] items-stretch gap-1.5 rounded-lg border p-1.5" style={{ background: `${theme.node.fill}99`, borderColor: theme.node.stroke }} onMouseDown={(event) => event.stopPropagation()}>
            <FrameSlot input={first} label="首帧" theme={theme} />
            <div className="grid place-items-center" style={{ color: theme.node.muted }}>
                <ArrowRight className="size-4" />
            </div>
            <FrameSlot input={last} label="尾帧" theme={theme} badge={extraCount ? `+${extraCount}` : undefined} />
        </div>
    );
}

function FrameSlot({ input, label, badge, theme }: { input?: NodeGenerationInput; label: string; badge?: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="relative min-w-0 overflow-hidden rounded-md border" style={{ background: theme.node.fill, borderColor: input?.image?.dataUrl ? "transparent" : theme.node.stroke }}>
            {input?.image?.dataUrl ? <img src={input.image.dataUrl} alt={label} className="h-full w-full object-cover" draggable={false} /> : <div className="grid h-full w-full place-items-center opacity-45"><ImageIcon className="size-5" /></div>}
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium leading-none text-white">{label}</span>
            {badge ? <span className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium leading-none text-white">{badge}</span> : null}
            <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-none text-white/90">{input?.title || "未连接"}</span>
        </div>
    );
}

function VideoReferenceStrip({ inputs, theme }: { inputs: NodeGenerationInput[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    if (!inputs.length) {
        return (
            <div className="flex h-12 shrink-0 items-center gap-2 rounded-lg border border-dashed px-2 text-[11px] opacity-65" style={{ background: `${theme.node.fill}88`, borderColor: theme.node.stroke }}>
                <ImageIcon className="size-3.5 shrink-0" />
                <span className="truncate">连接图片、视频或音频参考后会在这里显示</span>
            </div>
        );
    }

    const visibleInputs = inputs.slice(0, 6);
    return (
        <div className="thin-scrollbar flex h-14 shrink-0 gap-1.5 overflow-x-auto pb-0.5" onMouseDown={(event) => event.stopPropagation()}>
            {visibleInputs.map((input, index) => (
                <VideoReferenceThumb key={input.nodeId} input={input} index={index} theme={theme} />
            ))}
            {inputs.length > visibleInputs.length ? (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border text-xs font-medium" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                    +{inputs.length - visibleInputs.length}
                </div>
            ) : null}
        </div>
    );
}

function VideoReferenceThumb({ input, index, theme }: { input: NodeGenerationInput; index: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const label = videoReferenceThumbLabel(input);
    return (
        <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded-lg border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }} title={input.title}>
            {input.image?.dataUrl ? (
                <img src={input.image.dataUrl} alt={input.title} className="h-full w-full object-cover" draggable={false} />
            ) : input.video?.url ? (
                <video src={input.video.url} className="h-full w-full object-cover" muted playsInline preload="metadata" data-canvas-no-zoom />
            ) : (
                <div className="grid h-full w-full place-items-center opacity-65">{input.type === "audio" ? <AudioLines className="size-4" /> : <ImageIcon className="size-4" />}</div>
            )}
            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-black/60 text-[9px] font-medium leading-none text-white">{index + 1}</span>
            <span className="absolute bottom-1 left-1 max-w-[44px] truncate rounded bg-black/55 px-1 py-0.5 text-[9px] leading-none text-white">{label}</span>
        </div>
    );
}

function videoReferenceThumbLabel(input: NodeGenerationInput) {
    if (input.image?.seedanceRole === "first_frame") return "首帧";
    if (input.image?.seedanceRole === "last_frame") return "尾帧";
    if (input.type === "video") return "视频";
    if (input.type === "audio") return "音频";
    return "图片";
}

function resolveVideoReferencePreset(referenceMode: AiConfig["videoReferenceMode"], imageMode: AiConfig["videoReferenceImageMode"], imageCount: number, videoCount: number, audioCount: number): VideoReferencePreset {
    if (referenceMode === "text2video") return "text";
    if (referenceMode === "image2video") return "first_frame";
    if (referenceMode === "frames2video") return "first_last_frame";
    if (referenceMode === "multiframe2video") return "multi_frame";
    if (referenceMode === "multimodal2video") return "all_reference";
    if (imageMode === "first_last_frame") return "first_last_frame";
    if (imageMode === "first_frame") return "first_frame";
    const mediaCount = imageCount + videoCount + audioCount;
    if (!mediaCount) return "text";
    if (videoCount || audioCount || imageCount > 1) return "all_reference";
    return "first_frame";
}

function videoConfigSummary(config: AiConfig) {
    const audio = config.videoGenerateAudio === "true" ? "音频开" : "音频关";
    const summary = `${videoRatioLabel(config.size)} · ${videoResolutionLabel(config.vquality, config).toUpperCase()} · ${videoSecondsLabel(config.videoSeconds, config)}`;
    return config.videoProtocol === "minimax" ? summary : `${summary} · ${audio}`;
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-6 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span className="shrink-0 opacity-70">{label}</span>
            <span className="min-w-0 truncate font-medium">{value}</span>
        </div>
    );
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
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

function generationModePatch(config: AiConfig, mode: CanvasGenerationMode): Partial<CanvasNodeMetadata> {
    if (mode === "video") return buildCanvasVideoModePatch(config);
    return {
        generationMode: mode,
        model: (mode === "image" ? config.imageModel : config.textModel) || config.model || defaultConfig.model,
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string): Partial<CanvasNodeMetadata> {
    if (key === "videoSeconds") return { seconds: value, duration: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoSeed") return { seed: value };
    if (key === "videoPromptReviewEnabled") return { videoPromptReviewEnabled: value };
    if (key === "videoReferenceImageMode") return { videoReferenceImageMode: value as CanvasNodeMetadata["videoReferenceImageMode"] };
    if (key === "videoReferenceMode") return { videoReferenceMode: value as CanvasNodeMetadata["videoReferenceMode"] };
    return { [key]: value } as Partial<CanvasNodeMetadata>;
}
