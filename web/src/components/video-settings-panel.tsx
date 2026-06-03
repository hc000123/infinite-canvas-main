"use client";

import { useEffect, type ReactNode } from "react";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { resolveSeedanceTaskModeForSource, seedanceReferenceImageModeOptions, shouldShowSeedanceImageControl, visibleSeedanceReferenceImageMode, visibleSeedanceTaskModeOptions } from "@/components/video-settings-options";
import { type CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";

const resolutionOptions = [
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p" },
];

const ratioOptions = [
    { value: "16:9", label: "横屏", width: 16, height: 9 },
    { value: "9:16", label: "竖屏", width: 9, height: 16 },
    { value: "1:1", label: "方形", width: 1, height: 1 },
    { value: "4:3", label: "经典横屏", width: 4, height: 3 },
    { value: "3:4", label: "经典竖屏", width: 3, height: 4 },
    { value: "adaptive", label: "自适应", width: 0, height: 0 },
];

const openAISecondOptions = [5, 6, 10, 15, 20];
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

type VideoSettingsKey = "vquality" | "size" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoSeed" | "videoTaskMode" | "videoEditType" | "videoExtendDirection" | "videoReferenceImageMode";

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: VideoSettingsKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    showTaskMode?: boolean;
    hasSourceVideo?: boolean;
    className?: string;
};

export function VideoSettingsPanel({ config, onConfigChange, theme, showTitle = true, showTaskMode = false, hasSourceVideo = false, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: VideoSettingsPanelProps) {
    const isSeedance = isSeedanceVideoConfig(config);
    const secondOptions = openAISecondOptions;
    const secondLimits = videoSecondsLimits(config);
    const seconds = normalizeVideoSecondsValue(config.videoSeconds, config);
    const ratio = normalizeVideoRatioValue(config.size);
    const resolution = normalizeVideoResolutionValue(config.vquality);
    const generateAudio = config.videoGenerateAudio === "true";
    const watermark = config.videoWatermark === "true";
    const taskMode = resolveSeedanceTaskModeForSource(config.videoTaskMode, hasSourceVideo);
    const taskOptions = visibleSeedanceTaskModeOptions(hasSourceVideo);
    const showImageControl = shouldShowSeedanceImageControl(config.videoTaskMode, hasSourceVideo);
    const referenceImageMode = visibleSeedanceReferenceImageMode(config.videoReferenceImageMode);

    useEffect(() => {
        if (!isSeedance || !showTaskMode || hasSourceVideo || (config.videoTaskMode !== "edit" && config.videoTaskMode !== "extend")) return;
        onConfigChange("videoTaskMode", "generate");
    }, [config.videoTaskMode, hasSourceVideo, isSeedance, onConfigChange, showTaskMode]);

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                {isSeedance ? <div className="text-xs leading-5 opacity-55">生成新视频时可用图片控制首帧/首尾帧。续写请从已完成视频节点的“续写”按钮进入。</div> : null}
                {showTaskMode && isSeedance ? (
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
                {isSeedance && showImageControl ? (
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
                    <div className="grid grid-cols-2 gap-2.5">
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
                                className="flex h-[78px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent text-sm transition hover:opacity-80"
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
                    {isSeedance ? (
                        <SecondRangeControl value={seconds} min={secondLimits.min} max={secondLimits.max} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                    ) : (
                        <div className="grid grid-cols-3 gap-2.5">
                            {secondOptions.map((value) => (
                                <OptionPill key={value} selected={seconds === String(value)} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                    {value}s
                                </OptionPill>
                            ))}
                            <NumberInput value={seconds} min={secondLimits.min} max={secondLimits.max} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                        </div>
                    )}
                </SettingGroup>
                <SettingGroup title="Ark 参数" color={theme.node.muted}>
                    <div className="grid grid-cols-2 gap-2.5">
                        <ToggleSwitch checked={generateAudio} label="生成音频" theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} />
                        <ToggleSwitch checked={watermark} label="水印" theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} />
                    </div>
                    <label className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: theme.node.fill, color: theme.node.text }}>
                        <span className="shrink-0" style={{ color: theme.node.muted }}>
                            seed
                        </span>
                        <NumberInput
                            value={config.videoSeed || ""}
                            min={0}
                            placeholder="随机"
                            theme={theme}
                            className="h-8 flex-1 rounded-lg border bg-transparent px-3 text-left text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            onChange={(value) => onConfigChange("videoSeed", value)}
                        />
                    </label>
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

export function videoResolutionLabel(value: string) {
    return `${normalizeVideoResolutionValue(value)}p`;
}

export function videoRatioLabel(value: string) {
    return normalizeVideoRatioValue(value);
}

export function videoSecondsLabel(value: string, config?: VideoSecondsConfig) {
    return `${normalizeVideoSecondsValue(value, config)}s`;
}

export type VideoSecondsConfig = Pick<AiConfig, "channelMode" | "videoProtocol"> | boolean;

export function normalizeVideoSecondsValue(value: string, config?: VideoSecondsConfig) {
    const limits = videoSecondsLimits(config);
    const fallback = isSeedanceVideoConfig(config) ? 5 : 6;
    const seconds = Math.floor(Number(value) || fallback);
    return String(Math.max(limits.min, Math.min(limits.max, seconds)));
}

function videoSecondsLimits(config?: VideoSecondsConfig) {
    return isSeedanceVideoConfig(config) ? { min: 4, max: 15 } : { min: 1, max: 20 };
}

function isSeedanceVideoConfig(config?: VideoSecondsConfig) {
    if (typeof config === "boolean") return config;
    return config?.channelMode === "local" && config.videoProtocol === "volcengine-ark";
}

export function normalizeVideoSizeValue(value: string) {
    return normalizeVideoRatioValue(value);
}

export function normalizeVideoRatioValue(value: string) {
    if (value === "auto" || value === "adaptive") return "adaptive";
    if (["16:9", "9:16", "1:1", "4:3", "3:4"].includes(value)) return value;
    if (/^\d+x\d+$/.test(value || "")) return ratioFromDimensions(value);
    if (value === "2:3") return "9:16";
    if (value === "3:2") return "16:9";
    return "16:9";
}

export function normalizeVideoResolutionValue(value: string) {
    const resolution = Number(String(value || "").replace(/p$/i, ""));
    return resolution >= 1080 ? "1080" : "720";
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80"
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
            <input type="checkbox" className="sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} onMouseDown={(event) => event.stopPropagation()} />
            <span className="relative h-5 w-9 rounded-full transition" style={{ background: checked ? theme.node.activeStroke : theme.node.stroke }}>
                <span className="absolute top-0.5 size-4 rounded-full bg-white transition" style={{ left: checked ? 18 : 2 }} />
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
                <input type="range" min={min} max={max} step={1} value={value} className="h-8 w-full cursor-pointer accent-[#2f80ff]" onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />
                <NumberInput
                    value={value}
                    min={min}
                    max={max}
                    theme={theme}
                    className="h-8 rounded-lg border bg-transparent px-2 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    onChange={onChange}
                />
            </div>
        </div>
    );
}

function NumberInput({ value, min, max, placeholder, theme, className, onChange }: { value: string; min: number; max?: number; placeholder?: string; theme: CanvasTheme; className?: string; onChange: (value: string) => void }) {
    return (
        <input
            type="number"
            min={min}
            max={max}
            placeholder={placeholder}
            className={className || "h-9 rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"}
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
        { value: "9:16", ratio: 9 / 16 },
        { value: "1:1", ratio: 1 },
        { value: "4:3", ratio: 4 / 3 },
        { value: "3:4", ratio: 3 / 4 },
    ];
    return candidates.reduce((best, item) => (Math.abs(item.ratio - ratio) < Math.abs(best.ratio - ratio) ? item : best)).value;
}
