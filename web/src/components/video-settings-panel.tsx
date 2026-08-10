"use client";

import { useEffect, type ReactNode } from "react";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { resolveSeedanceTaskModeForSource, seedanceReferenceImageModeOptions, shouldShowSeedanceImageControl, visibleSeedanceReferenceImageMode, visibleSeedanceTaskModeOptions } from "@/components/video-settings-options";
import { isArkSeedance25EditCredit } from "@/constant/credit-quantity";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { resolveDreaminaVideoCapability } from "@/lib/dreamina-video-capabilities";
import { normalizeVideoReferenceMode } from "@/services/api/video-reference";
import type { AiConfig } from "@/stores/use-config-store";

const defaultResolutionOptions = [
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p" },
];

const ratioOptions = [
    { value: "adaptive", label: "Auto", width: 0, height: 0 },
    { value: "16:9", label: "16:9", width: 16, height: 9 },
    { value: "4:3", label: "4:3", width: 4, height: 3 },
    { value: "1:1", label: "1:1", width: 1, height: 1 },
    { value: "3:4", label: "3:4", width: 3, height: 4 },
    { value: "9:16", label: "9:16", width: 9, height: 16 },
    { value: "21:9", label: "21:9", width: 21, height: 9 },
];

const editTypeOptions = [
    { value: "replace", label: "替换" },
    { value: "add", label: "添加" },
    { value: "remove", label: "移除" },
    { value: "inpaint", label: "重绘" },
] as const;
const extendDirectionOptions = [
    { value: "forward", label: "向后" },
    { value: "backward", label: "向前" },
] as const;

type VideoSettingsKey = "vquality" | "size" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoSeed" | "videoPromptReviewEnabled" | "videoTaskMode" | "videoEditType" | "videoExtendDirection" | "videoReferenceImageMode";

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: VideoSettingsKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    showTaskMode?: boolean;
    hasSourceVideo?: boolean;
    className?: string;
};

export function VideoSettingsPanel({ config, onConfigChange, theme, showTitle = true, showTaskMode = false, hasSourceVideo = false, className = "w-[320px] space-y-4 rounded-lg px-1 py-0.5" }: VideoSettingsPanelProps) {
    const secondLimits = videoSecondsLimits(config);
    const seconds = normalizeVideoSecondsValue(config.videoSeconds, config);
    const ratio = normalizeVideoRatioValue(config.size);
    const resolution = normalizeVideoResolutionValue(config.vquality, config);
    const referenceMode = normalizeVideoReferenceMode(config.videoReferenceMode);
    const dreaminaCapability = resolveDreaminaVideoCapability({
        protocol: config.videoProtocol,
        model: config.videoModel,
        mode: referenceMode === "auto" ? "text2video" : referenceMode,
    });
    const resolutionOptions = dreaminaCapability
        ? dreaminaCapability.resolutions.map((value) => ({ value, label: config.videoProtocol === "minimax" && value === "2160" ? "2K" : value === "2160" ? "4K" : `${value}p` }))
        : defaultResolutionOptions;
    const supportsGenerateAudio = config.videoProtocol !== "minimax";
    const supportsSeed = config.videoProtocol !== "minimax";
    const supportsSeedanceTaskMode = config.videoProtocol !== "minimax";
    const generateAudio = config.videoGenerateAudio === "true";
    const watermark = config.videoWatermark === "true";
    const promptReviewEnabled = config.videoPromptReviewEnabled !== "false";
    const taskMode = resolveSeedanceTaskModeForSource(config.videoTaskMode, hasSourceVideo);
    const taskOptions = visibleSeedanceTaskModeOptions(hasSourceVideo);
    const showImageControl = shouldShowSeedanceImageControl(config.videoTaskMode, hasSourceVideo);
    const referenceImageMode = visibleSeedanceReferenceImageMode(config.videoReferenceImageMode);
    const showSeedance25EditCreditHint = isArkSeedance25EditCredit({ videoProtocol: config.videoProtocol, videoModel: config.videoModel || config.seedanceModel, videoTaskMode: taskMode });

    useEffect(() => {
        if (!supportsSeedanceTaskMode || !showTaskMode || hasSourceVideo || (config.videoTaskMode !== "edit" && config.videoTaskMode !== "extend")) return;
        onConfigChange("videoTaskMode", "generate");
    }, [config.videoTaskMode, hasSourceVideo, onConfigChange, showTaskMode, supportsSeedanceTaskMode]);

    useEffect(() => {
        if (resolutionOptions.some((item) => item.value === resolution)) return;
        onConfigChange("vquality", dreaminaCapability?.fallbackResolution || "720");
    }, [dreaminaCapability?.fallbackResolution, onConfigChange, resolution, resolutionOptions]);

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                <div className="text-xs leading-5 opacity-55">生成新视频时可用图片控制首帧/首尾帧。续写请从已完成视频节点的“续写”按钮进入。</div>
                {showTaskMode && supportsSeedanceTaskMode ? (
                    <SettingGroup title="生成方式" color={theme.node.muted}>
                        <div className={`grid gap-2.5 ${hasSourceVideo ? "grid-cols-3" : "grid-cols-1"}`}>
                            {taskOptions.map((item) => (
                                <OptionPill key={item.value} selected={taskMode === item.value} theme={theme} onClick={() => onConfigChange("videoTaskMode", item.value)}>
                                    {item.label}
                                </OptionPill>
                            ))}
                        </div>
                        {taskMode === "edit" ? (
                            <div className="grid grid-cols-4 gap-2.5">
                                {editTypeOptions.map((item) => (
                                    <OptionPill key={item.value} selected={config.videoEditType === item.value} theme={theme} onClick={() => onConfigChange("videoEditType", item.value)}>
                                        {item.label}
                                    </OptionPill>
                                ))}
                            </div>
                        ) : null}
                        {showSeedance25EditCreditHint ? <div className="text-xs leading-5" style={{ color: theme.node.muted }}>Seedance 2.5 编辑任务按 30 秒预扣，后续实际时长结算另行支持。</div> : null}
                        {taskMode === "extend" ? (
                            <div className="grid grid-cols-2 gap-2.5">
                                {extendDirectionOptions.map((item) => (
                                    <OptionPill key={item.value} selected={config.videoExtendDirection === item.value} theme={theme} onClick={() => onConfigChange("videoExtendDirection", item.value)}>
                                        {item.label}
                                    </OptionPill>
                                ))}
                            </div>
                        ) : null}
                    </SettingGroup>
                ) : null}
                {showImageControl ? (
                    <SettingGroup title="图片控制" color={theme.node.muted}>
                        <div className="grid grid-cols-3 gap-2.5">
                            {seedanceReferenceImageModeOptions.map((item) => (
                                <OptionPill key={item.value} selected={referenceImageMode === item.value} theme={theme} onClick={() => onConfigChange("videoReferenceImageMode", item.value)}>
                                    {item.label}
                                </OptionPill>
                            ))}
                        </div>
                    </SettingGroup>
                ) : null}
                <SettingGroup title="清晰度" color={theme.node.muted}>
                    <div className={`grid gap-2.5 ${resolutionOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {resolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => onConfigChange("vquality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="画幅比例" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {ratioOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[78px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border bg-transparent text-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                                style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", item.value)}
                            >
                                <SizePreview width={item.width} height={item.height} color={theme.node.text} />
                                <span>{item.label}</span>
                                {item.value === "adaptive" ? null : <span className="text-[11px] leading-none opacity-55">{item.value}</span>}
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="秒数" color={theme.node.muted}>
                    <SecondRangeControl value={seconds} min={secondLimits.min} max={secondLimits.max} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                </SettingGroup>
                <SettingGroup title="生成参数" color={theme.node.muted}>
                    <div className={`grid gap-2.5 ${supportsGenerateAudio ? "grid-cols-2" : "grid-cols-1"}`}>
                        {supportsGenerateAudio ? <ToggleSwitch checked={generateAudio} label="生成音频" theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} /> : null}
                        <ToggleSwitch checked={watermark} label="水印" theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} />
                    </div>
                    {supportsSeed ? <label className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: theme.node.fill, color: theme.node.text }}>
                        <span className="shrink-0" style={{ color: theme.node.muted }}>
                            seed
                        </span>
                        <NumberInput
                            value={config.videoSeed || ""}
                            min={0}
                            placeholder="随机"
                            theme={theme}
                            className="h-8 flex-1 rounded-lg border bg-transparent px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-focus-ring)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            onChange={(value) => onConfigChange("videoSeed", value)}
                        />
                    </label> : null}
                </SettingGroup>
                <SettingGroup title="生成辅助" color={theme.node.muted}>
                    <ToggleSwitch checked={promptReviewEnabled} label="生成前提示词自审" theme={theme} onChange={(checked) => onConfigChange("videoPromptReviewEnabled", String(checked))} />
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

export type VideoResolutionConfig = Partial<Pick<AiConfig, "videoProtocol">>;

export function videoResolutionLabel(value: string, config?: VideoResolutionConfig) {
    value = normalizeVideoResolutionValue(value, config);
    return config && config.videoProtocol === "minimax" && value === "2160" ? "2K" : value === "2160" ? "4K" : `${value}p`;
}

export function videoRatioLabel(value: string) {
    const ratio = normalizeVideoRatioValue(value);
    return ratio === "adaptive" ? "Auto" : ratio;
}

export function videoSecondsLabel(value: string, config?: VideoSecondsConfig) {
    return `${normalizeVideoSecondsValue(value, config)}s`;
}

export type VideoSecondsConfig = Partial<Pick<AiConfig, "channelMode" | "videoProtocol" | "videoModel" | "videoReferenceMode">> | boolean;

export function normalizeVideoSecondsValue(value: string, config?: VideoSecondsConfig) {
    const limits = videoSecondsLimits(config);
    const fallback = 6;
    const seconds = Math.floor(Number(value) || fallback);
    return String(Math.max(limits.min, Math.min(limits.max, seconds)));
}

function videoSecondsLimits(config?: VideoSecondsConfig) {
    if (typeof config !== "object") return { min: 4, max: 15 };
    const referenceMode = normalizeVideoReferenceMode(config.videoReferenceMode);
    const dreaminaCapability = resolveDreaminaVideoCapability({
        protocol: config.videoProtocol || "openai",
        model: config.videoModel || "",
        mode: referenceMode === "auto" ? "text2video" : referenceMode,
    });
    if (dreaminaCapability) return dreaminaCapability.duration;
    return { min: 4, max: 15 };
}

export function normalizeVideoSizeValue(value: string) {
    return normalizeVideoRatioValue(value);
}

export function normalizeVideoRatioValue(value: string) {
    if (value === "auto" || value === "adaptive") return "adaptive";
    if (["21:9", "16:9", "9:16", "1:1", "4:3", "3:4"].includes(value)) return value;
    if (/^\d+x\d+$/.test(value || "")) return ratioFromDimensions(value);
    if (value === "2:3") return "9:16";
    if (value === "3:2") return "16:9";
    return "16:9";
}

export function normalizeVideoResolutionValue(value: string, config?: VideoResolutionConfig) {
    if (String(value).toLowerCase() === "4k") return "2160";
    const resolution = Number(String(value || "").replace(/p$/i, ""));
    if (config?.videoProtocol === "minimax" && resolution === 768) return "768";
    if (resolution >= 2160) return "2160";
    if (resolution >= 1080) return "1080";
    return resolution > 0 && resolution <= 480 ? "480" : "720";
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function ToggleSwitch({ checked, label, theme, onChange }: { checked: boolean; label: string; theme: CanvasTheme; onChange: (checked: boolean) => void }) {
    return (
        <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-sm" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span>{label}</span>
            <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} onMouseDown={(event) => event.stopPropagation()} />
            <span
                className="relative h-5 w-9 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--studio-focus-ring)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-transparent"
                style={{ background: checked ? theme.node.activeStroke : theme.node.stroke }}
            >
                <span className="absolute top-0.5 size-4 rounded-full transition" style={{ left: checked ? 18 : 2, background: "var(--studio-elevated-bg)", boxShadow: "0 1px 4px var(--studio-border-subtle)" }} />
            </span>
        </label>
    );
}

function SecondRangeControl({ value, min, max, theme, onChange }: { value: string; min: number; max: number; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <div className="space-y-2 rounded-xl border px-3 py-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex items-center justify-between text-xs tabular-nums" style={{ color: theme.node.muted }}>
                <span>{min}s</span>
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>
                    {value}s
                </span>
                <span>{max}s</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    className="h-8 w-full cursor-pointer accent-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    onChange={(event) => onChange(event.target.value)}
                    onMouseDown={(event) => event.stopPropagation()}
                />
                <SecondNumberInput value={value} min={min} max={max} theme={theme} onChange={onChange} />
            </div>
        </div>
    );
}

function SecondNumberInput({ value, min, max, theme, onChange }: { value: string; min: number; max?: number; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <label className="flex h-9 items-center rounded-full border px-3 text-sm focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--studio-focus-ring)]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={min}
                max={max}
                className="min-w-0 flex-1 bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <span className="shrink-0 opacity-70">s</span>
        </label>
    );
}

function NumberInput({ value, min, max, placeholder, theme, className, onChange }: { value: string; min: number; max?: number; placeholder?: string; theme: CanvasTheme; className?: string; onChange: (value: string) => void }) {
    return (
        <input
            type="number"
            min={min}
            max={max}
            placeholder={placeholder}
            className={
                className ||
                "h-9 rounded-full border bg-transparent px-3 text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-focus-ring)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            }
            style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
        />
    );
}

function SizePreview({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) return null;
    const longSide = Math.max(width, height);
    const previewWidth = Math.max(10, Math.round((width / longSide) * 26));
    const previewHeight = Math.max(10, Math.round((height / longSide) * 26));
    return <span className="rounded-[3px] border-2" style={{ width: previewWidth, height: previewHeight, borderColor: color }} />;
}

function ratioFromDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/);
    const width = Number(match?.[1]) || 16;
    const height = Number(match?.[2]) || 9;
    const ratio = width / Math.max(1, height);
    const candidates = [
        { value: "16:9", ratio: 16 / 9 },
        { value: "21:9", ratio: 21 / 9 },
        { value: "9:16", ratio: 9 / 16 },
        { value: "1:1", ratio: 1 },
        { value: "4:3", ratio: 4 / 3 },
        { value: "3:4", ratio: 3 / 4 },
    ];
    return candidates.reduce((best, item) => (Math.abs(item.ratio - ratio) < Math.abs(best.ratio - ratio) ? item : best)).value;
}
