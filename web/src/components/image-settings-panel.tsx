"use client";

import { type ReactNode } from "react";
import { ConfigProvider } from "antd";

import { type CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";

const qualityOptions = [
    { value: "auto", label: "自动" },
    { value: "high", label: "高" },
    { value: "medium", label: "中" },
    { value: "low", label: "低" },
];

const aspectOptions = [
    { value: "1:1", label: "1:1", width: 1024, height: 1024, icon: "square" },
    { value: "3:2", label: "3:2", width: 1536, height: 1024, icon: "landscape" },
    { value: "2:3", label: "2:3", width: 1024, height: 1536, icon: "portrait" },
    { value: "4:3", label: "4:3", width: 1344, height: 1024, icon: "landscape" },
    { value: "3:4", label: "3:4", width: 1024, height: 1344, icon: "portrait" },
    { value: "9:16", label: "9:16", width: 1024, height: 1792, icon: "portrait" },
    { value: "1:1-2k", label: "1:1(2k)", size: "2048x2048", width: 2048, height: 2048, icon: "square" },
    { value: "16:9-2k", label: "16:9(2k)", size: "2048x1152", width: 2048, height: 1152, icon: "landscape" },
    { value: "9:16-2k", label: "9:16(2k)", size: "1152x2048", width: 1152, height: 2048, icon: "portrait" },
    { value: "16:9-4k", label: "16:9(4k)", size: "3840x2160", width: 3840, height: 2160, icon: "landscape" },
    { value: "9:16-4k", label: "9:16(4k)", size: "2160x3840", width: 2160, height: 3840, icon: "portrait" },
    { value: "auto", label: "auto", width: 0, height: 0, icon: "auto" },
];

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: <K extends ImageSettingsKey>(key: K, value: AiConfig[K]) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
    compact?: boolean;
};
type ImageSettingsKey = "quality" | "size" | "count" | "thinkingMode" | "reasoningEffort";

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5", maxCount = 15, quickCount = 10, compact = false }: ImageSettingsPanelProps) {
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(maxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const imageModel = config.imageModel || config.model;
    const thinkingSupported = supportsImageThinkingModel(imageModel);
    const selectedAspect = aspectOptions.find((item) => (item.size || item.value) === activeSize || item.value === activeSize);
    const dimensions = readSizeDimensions(activeSize, selectedAspect || aspectOptions[0]);
    const selectAspect = (value: string) => {
        const option = aspectOptions.find((item) => item.value === value);
        onConfigChange("size", option?.size || option?.value || "auto");
    };
    const updateDimension = (key: "width" | "height", value: number | null) => {
        const next = Math.max(1, Math.floor(value || dimensions[key] || 1024));
        onConfigChange("size", `${key === "width" ? next : dimensions.width}x${key === "height" ? next : dimensions.height}`);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">图像设置</div> : null}
                <div className={compact ? "space-y-2" : "space-y-2.5"}>
                    <SettingTitle color={theme.node.muted}>质量</SettingTitle>
                    <div className={compact ? "grid grid-cols-4 gap-1.5" : "grid grid-cols-4 gap-2.5"}>
                        {qualityOptions.map((item) => (
                            <OptionPill key={item.value} selected={quality === item.value} theme={theme} onClick={() => onConfigChange("quality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </div>
                <div className={compact ? "space-y-2" : "space-y-2.5"}>
                    <SettingTitle color={theme.node.muted}>思考模式</SettingTitle>
                    <div className="rounded-xl border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="min-w-0 text-xs leading-5" style={{ color: theme.node.muted }}>
                                {thinkingSupported ? "当前模型可使用思考参数" : "仅支持思考参数的模型生效"}
                            </div>
                            <div className="grid shrink-0 grid-cols-2 gap-1">
                                <SmallOptionPill selected={config.thinkingMode !== "true"} theme={theme} onClick={() => onConfigChange("thinkingMode", "false")}>
                                    关
                                </SmallOptionPill>
                                <SmallOptionPill selected={config.thinkingMode === "true"} theme={theme} onClick={() => onConfigChange("thinkingMode", "true")}>
                                    开
                                </SmallOptionPill>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 opacity-100">
                            {[
                                { value: "minimal", label: "极低" },
                                { value: "low", label: "低" },
                                { value: "medium", label: "中" },
                                { value: "high", label: "高" },
                            ].map((item) => (
                                <SmallOptionPill key={item.value} selected={config.reasoningEffort === item.value} disabled={config.thinkingMode !== "true"} theme={theme} onClick={() => onConfigChange("reasoningEffort", item.value as AiConfig["reasoningEffort"])}>
                                    {item.label}
                                </SmallOptionPill>
                            ))}
                        </div>
                    </div>
                </div>
                <div className={compact ? "space-y-2" : "space-y-2.5"}>
                    <SettingTitle color={theme.node.muted}>尺寸</SettingTitle>
                    <div className={compact ? "grid grid-cols-[1fr_auto_1fr] items-center gap-1.5" : "grid grid-cols-[1fr_auto_1fr] items-center gap-2.5"}>
                        <DimensionInput prefix="W" value={dimensions.width} disabled={activeSize === "auto"} theme={theme} onChange={(value) => updateDimension("width", value)} />
                        <span className="text-lg opacity-45">↔</span>
                        <DimensionInput prefix="H" value={dimensions.height} disabled={activeSize === "auto"} theme={theme} onChange={(value) => updateDimension("height", value)} />
                    </div>
                </div>
                <div className={compact ? "space-y-2" : "space-y-2.5"}>
                    <SettingTitle color={theme.node.muted}>宽高比</SettingTitle>
                    <div className={compact ? "grid grid-cols-4 gap-1.5" : "grid grid-cols-4 gap-2"}>
                        {aspectOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className={`cursor-pointer rounded-full border bg-transparent px-2 text-center transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f80ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${compact ? "h-8 text-xs" : "h-9 text-sm"}`}
                                style={{ borderColor: selectedAspect?.value === item.value ? theme.node.text : theme.node.stroke, background: selectedAspect?.value === item.value ? theme.node.panel : "transparent", color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => selectAspect(item.value)}
                            >
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className={compact ? "space-y-2" : "space-y-2.5"}>
                    <SettingTitle color={theme.node.muted}>生成张数</SettingTitle>
                    <div className={compact ? "grid grid-cols-4 gap-1.5" : "grid grid-cols-4 gap-2.5"}>
                        {Array.from({ length: quickCount }, (_, index) => index + 1).map((value) => (
                            <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))}>
                                {value} 张
                            </OptionPill>
                        ))}
                        <CountInput value={count} max={maxCount} theme={theme} onChange={(value) => onConfigChange("count", String(value || 1))} />
                    </div>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: { Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text } },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string) {
    return ({ auto: "自动", high: "高", medium: "中", low: "低" } as Record<string, string>)[value] || value;
}

export function imageSizeLabel(size: string) {
    return aspectOptions.find((item) => (item.size || item.value) === size || item.value === size)?.label || size;
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f80ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function SmallOptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className="h-7 cursor-pointer rounded-full border px-2 text-xs transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f80ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{ background: selected ? theme.node.panel : "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function DimensionInput({ prefix, value, disabled, theme, onChange }: { prefix: string; value: number; disabled: boolean; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input
                type="number"
                min={1}
                disabled={disabled}
                className="min-w-0 flex-1 bg-transparent px-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2f80ff]/70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function CountInput({ value, max, theme, onChange }: { value: number; max: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="col-span-2 flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={1}
                max={max}
                className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2f80ff]/70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}

function supportsImageThinkingModel(model: string) {
    const value = model.toLowerCase();
    return value.includes("gemini-3") || value.includes("gemini-2.5") || value.includes("thinking");
}

function readSizeDimensions(size: string, fallback: { width: number; height: number }) {
    const match = size?.match(/^(\d+)x(\d+)$/);
    return {
        width: match ? Number(match[1]) : fallback.width,
        height: match ? Number(match[2]) : fallback.height,
    };
}
