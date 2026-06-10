"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Eye, Image as ImageIcon, LoaderCircle, MessageSquare, Play, Video } from "lucide-react";
import { App, Button, Segmented } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { ModelThinkingSettings } from "@/components/image-settings-panel";
import { inferRemoteVideoProtocol } from "@/services/api/ai-channel-boundary";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { defaultSeedanceImageRole, normalizeSeedanceImageRole, seedanceReferenceLabelRange } from "@/services/api/video-reference";
import { useThemeStore } from "@/stores/use-theme-store";
import { buildCanvasVideoConfig, buildCanvasVideoModePatch, resolveCanvasVideoChannelConfig } from "../utils/canvas-video-config";
import { CanvasConfigNodePreview } from "./canvas-config-node-preview";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import type { NodeGenerationInput } from "./canvas-node-generation";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "../types";
import type { ReferenceImageRole } from "@/types/image";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    inputs: NodeGenerationInput[];
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onTextInputChange: (nodeId: string, content: string) => void;
    onGenerate: (nodeId: string) => void;
};

export function CanvasConfigNodePanel({ node, isRunning, inputSummary, inputs, onConfigChange, onTextInputChange, onGenerate }: CanvasConfigNodePanelProps) {
    const { message } = App.useApp();
    const [previewOpen, setPreviewOpen] = useState(false);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState("");
    const localConfig = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode || "image";
    const globalConfig = resolveCanvasVideoChannelConfig(localConfig, effectiveConfig, publicSettings?.modelChannel, mode === "video" ? node.metadata?.channelMode : undefined);
    const config = buildNodeConfig(globalConfig, node, mode);
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(node.metadata?.count || 3)) || 1)));
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, fallbackModel: mode === "video" ? config.seedanceModel || config.videoModel : undefined, count: mode === "image" ? count : 1 });
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const textInputs = inputs.filter((input) => input.type === "text");
    const imageInputs = inputs.filter((input) => input.type === "image");
    const videoInputs = inputs.filter((input) => input.type === "video");
    const audioInputs = inputs.filter((input) => input.type === "audio");
    const mediaInputs = inputs.filter((input) => input.type === "image" || input.type === "video" || input.type === "audio");
    const ownPrompt = String(node.metadata?.prompt || node.metadata?.finalPrompt || "").trim();
    const promptCount = inputSummary.textCount + (ownPrompt ? 1 : 0);
    const hasGenerationInput = Boolean(promptCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasPreviewContent = Boolean(inputs.length || ownPrompt);
    const hasSourceVideo = videoInputs.some((input) => Boolean(input.video?.url));
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

            <div className="grid shrink-0 grid-cols-2 gap-1.5" onMouseDown={(event) => event.stopPropagation()}>
                <InputChip label="提示" value={`${promptCount}`} style={chipStyle} />
                <InputChip label="图" value={imageReferenceValue} style={chipStyle} />
                {mode === "video" ? <InputChip label="视频" value={videoReferenceValue} style={chipStyle} /> : null}
                {mode === "video" ? <InputChip label="音频" value={audioReferenceValue} style={chipStyle} /> : null}
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

            <div className="grid min-w-0 shrink-0 cursor-default gap-1.5" onMouseDown={(event) => event.stopPropagation()}>
                <ModelPicker
                    className="canvas-compact-control h-8 !rounded-lg !px-2 !text-xs"
                    config={config}
                    modelType={mode}
                    value={config.model}
                    onChange={(model) => onConfigChange(node.id, mode === "video" ? videoModelPatch(config, model) : { model })}
                    onMissingConfig={() => openConfigDialog(true)}
                    fullWidth
                />
                {mode === "image" ? <ModelThinkingSettings className="w-full justify-start" compact config={config} model={config.model} theme={theme} onConfigChange={(key, value) => onConfigChange(node.id, { [key]: value })} /> : null}
                {mode === "video" ? (
                    <CanvasVideoSettingsPopover
                        config={config}
                        placement="topRight"
                        showTaskMode
                        hasSourceVideo={hasSourceVideo}
                        disabled={isRunning}
                        buttonClassName="canvas-compact-control !h-8 !w-full !justify-start !rounded-lg !px-2 !text-xs"
                        onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                    />
                ) : mode === "image" ? (
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
                disabled={isRunning || !hasGenerationInput}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onGenerate(node.id)}
                title={hasGenerationInput ? "开始生成" : emptyHint}
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
                hasPreviewContent={hasPreviewContent}
                imageInputs={imageInputs}
                imageReferenceRole={imageReferenceRole}
                mediaInputs={mediaInputs}
                mode={mode}
                onChangeImageReferenceRole={changeImageReferenceRole}
                onClose={() => setPreviewOpen(false)}
                onEditingTextChange={setEditingText}
                onMoveInput={moveInput}
                onSaveTextEdit={saveTextEdit}
                onStartTextEdit={startTextEdit}
                onStopTextEdit={() => setEditingTextId(null)}
                open={previewOpen}
                ownPrompt={ownPrompt}
                promptCount={promptCount}
                textInputs={textInputs}
                theme={theme}
                videoInputs={videoInputs}
            />
        </div>
    );
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
        count: String(node.metadata?.count || (mode === "image" ? 3 : globalConfig.count) || defaultConfig.count),
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
    return { [key]: value } as Partial<CanvasNodeMetadata>;
}

function videoModelPatch(config: AiConfig, model: string): Partial<CanvasNodeMetadata> {
    return {
        model,
        provider: inferRemoteVideoProtocol(model, config.videoProtocol || "openai"),
    };
}
