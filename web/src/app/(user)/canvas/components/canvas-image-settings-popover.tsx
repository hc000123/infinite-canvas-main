"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button } from "antd";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft" }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const quality = normalizeImageQuality(config.quality);
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const ratio = imageRatioFromSize(activeSize);
    const resolution = imageResolutionFromSize(activeSize, quality);
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
            onOpenChange?.(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [onOpenChange, open]);

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} onConfigChange={onConfigChange} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={<Settings2 className="size-3.5" />}
                    onClick={() => updateOpen(!open)}
                >
                    <span className="truncate">
                        {imageRatioLabel(ratio)} · {imageQualityLabel(quality)} · {imageResolutionLabel(resolution)} · {count} 张
                    </span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
}) {
    const gap = 8;
    const margin = 12;
    const width = Math.min(680, Math.max(320, window.innerWidth - margin * 2));
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 8,
        boxShadow: "var(--studio-shadow)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div ref={panelRef} className="canvas-image-settings-popover" style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <CanvasImageNodeSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} />
        </div>,
        document.body,
    );
}

const qualityOptions = [
    { value: "low", label: "低画质" },
    { value: "medium", label: "标准画质" },
    { value: "high", label: "高画质" },
] as const;

const resolutionOptions = [
    { value: "1k", label: "1K" },
    { value: "2k", label: "2K" },
    { value: "4k", label: "4K" },
] as const;

const ratioOptions = [
    { value: "auto", label: "自适应", width: 1, height: 1 },
    { value: "1:1", label: "1:1", width: 1, height: 1 },
    { value: "1:2", label: "1:2", width: 1, height: 2 },
    { value: "2:1", label: "2:1", width: 2, height: 1 },
    { value: "9:16", label: "9:16", width: 9, height: 16 },
    { value: "16:9", label: "16:9", width: 16, height: 9 },
    { value: "3:4", label: "3:4", width: 3, height: 4 },
    { value: "4:3", label: "4:3", width: 4, height: 3 },
    { value: "3:2", label: "3:2", width: 3, height: 2 },
    { value: "2:3", label: "2:3", width: 2, height: 3 },
    { value: "5:4", label: "5:4", width: 5, height: 4 },
    { value: "4:5", label: "4:5", width: 4, height: 5 },
    { value: "21:9", label: "21:9", width: 21, height: 9 },
    { value: "9:21", label: "9:21", width: 9, height: 21 },
] as const;

function CanvasImageNodeSettingsPanel({ config, onConfigChange, theme }: { config: AiConfig; onConfigChange: (key: keyof AiConfig, value: string) => void; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const quality = normalizeImageQuality(config.quality);
    const ratio = imageRatioFromSize(config.size || "auto");
    const resolution = imageResolutionFromSize(config.size || "auto", quality);
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const setRatio = (value: string) => onConfigChange("size", imageSizeFromRatioResolution(value, resolution));
    const setResolution = (value: string) => onConfigChange("size", imageSizeFromRatioResolution(ratio, value));

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="space-y-4" style={{ color: theme.node.text }}>
                <SettingGroup title="画质" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-3">
                        {qualityOptions.map((item) => (
                            <SegmentButton key={item.value} selected={quality === item.value} theme={theme} onClick={() => onConfigChange("quality", item.value)}>
                                {item.label}
                            </SegmentButton>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="清晰度" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-3">
                        {resolutionOptions.map((item) => (
                            <SegmentButton key={item.value} selected={resolution === item.value} theme={theme} onClick={() => setResolution(item.value)}>
                                {item.label}
                            </SegmentButton>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="比例" color={theme.node.muted}>
                    <div className="grid grid-cols-5 gap-3">
                        {ratioOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[84px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-transparent text-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                                style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, background: ratio === item.value ? theme.node.panel : "transparent", color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => setRatio(item.value)}
                            >
                                <RatioPreview width={item.width} height={item.height} color={theme.node.text} auto={item.value === "auto"} />
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="生成张数" color={theme.node.muted}>
                    <div className="grid grid-cols-6 gap-2">
                        {[1, 2, 3, 4, 6].map((value) => (
                            <SegmentButton key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))}>
                                {value} 张
                            </SegmentButton>
                        ))}
                        <label className="flex h-10 overflow-hidden rounded-lg border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                            <input
                                type="number"
                                min={1}
                                max={15}
                                className="min-w-0 flex-1 bg-transparent px-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-focus-ring)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                                value={count}
                                onChange={(event) => onConfigChange("count", String(Math.max(1, Math.min(15, Math.floor(Number(event.target.value) || 1)))))}
                                onMouseDown={(event) => event.stopPropagation()}
                            />
                        </label>
                    </div>
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-sm font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function SegmentButton({ selected, theme, onClick, children }: { selected: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-10 cursor-pointer rounded-lg border px-3 text-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
            style={{ borderColor: selected ? theme.node.text : theme.node.stroke, background: selected ? theme.node.panel : "transparent", color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function RatioPreview({ width, height, color, auto = false }: { width: number; height: number; color: string; auto?: boolean }) {
    const longSide = Math.max(width, height);
    const previewWidth = Math.max(12, Math.round((width / longSide) * 28));
    const previewHeight = Math.max(12, Math.round((height / longSide) * 28));
    return <span className={auto ? "rounded-[4px] border-2 border-dashed" : "rounded-[4px] border-2"} style={{ width: previewWidth, height: previewHeight, borderColor: color }} />;
}

function normalizeImageQuality(value?: string) {
    return value === "low" || value === "high" || value === "medium" ? value : "medium";
}

function imageQualityLabel(value: string) {
    if (value === "low") return "低画质";
    if (value === "high") return "高画质";
    return "标准画质";
}

function imageResolutionLabel(value: string) {
    if (value === "1k") return "1K";
    if (value === "4k") return "4K";
    return "2K";
}

function imageRatioLabel(value: string) {
    return value === "auto" ? "自适应" : value;
}

function imageResolutionFromSize(size: string, quality: string) {
    const match = size.match(/^(\d+)x(\d+)$/);
    if (match) {
        const longSide = Math.max(Number(match[1]), Number(match[2]));
        if (longSide >= 3200) return "4k";
        if (longSide >= 1536) return "2k";
        return "1k";
    }
    if (quality === "high") return "4k";
    if (quality === "low") return "1k";
    return "2k";
}

function imageRatioFromSize(size: string) {
    if (!size || size === "auto") return "auto";
    if (ratioOptions.some((item) => item.value === size)) return size;
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return "auto";
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = width / Math.max(1, height);
    return ratioOptions
        .filter((item) => item.value !== "auto")
        .reduce((best, item) => {
            const itemRatio = item.width / item.height;
            const bestRatio = best.width / best.height;
            return Math.abs(itemRatio - ratio) < Math.abs(bestRatio - ratio) ? item : best;
        }, ratioOptions[1]).value;
}

function imageSizeFromRatioResolution(ratio: string, resolution: string) {
    if (ratio === "auto") return "auto";
    const option = ratioOptions.find((item) => item.value === ratio) || ratioOptions[1];
    const longSide = resolution === "4k" ? 3840 : resolution === "1k" ? 1024 : 2048;
    const landscape = option.width >= option.height;
    const longRatio = landscape ? option.width / option.height : option.height / option.width;
    const shortSide = Math.max(16, Math.round(longSide / longRatio / 16) * 16);
    return landscape ? `${longSide}x${shortSide}` : `${shortSide}x${longSide}`;
}
