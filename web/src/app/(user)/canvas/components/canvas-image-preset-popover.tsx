"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasImagePreset = {
    id: string;
    label: string;
    description: string;
    prompt: string;
    quality: string;
    size: string;
};

export const canvasImagePresets: CanvasImagePreset[] = [
    {
        id: "character-face-turnaround",
        label: "角色脸部三视图",
        description: "白底正面肖像特写与左右侧脸参考。",
        quality: "high",
        size: "2048x1152",
        prompt: "生成白底角色脸部三视图：左侧正面平视大头部特写，中间左侧脸，右侧右侧脸，保持同一人物五官、发型、肤色、年龄感和气质一致；真实影视定妆照质感，柔和白棚光，真实皮肤纹理，避免商业精修感、塑料脸、蜡像皮肤和三视图不一致。",
    },
    {
        id: "character-full-body",
        label: "角色全身设定图",
        description: "白底全身造型、服装结构和配件。",
        quality: "high",
        size: "2048x2048",
        prompt: "生成白底角色全身设定图：正面站姿，全身入画，清楚展示发型、脸型、身材比例、服装结构、材质、鞋子和配件；真实影视剧组试装照质感，布料褶皱和缝线真实，低锐化、低磨皮，避免游戏 CG、商业广告大片、玻璃皮和乳胶质感。",
    },
    {
        id: "scene-grid",
        label: "场景四宫格",
        description: "空间布局与三个平视角度参考。",
        quality: "medium",
        size: "2048x1152",
        prompt: "生成 16:9 横版 2x2 四宫格场景规划参考图：左上为俯视空间布局，其余三格为同一场景的平视不同角度；强调空间层次、真实光源、材质、可调度区域和可拍角度，不出现人物、群演、文字标识或无关道具。",
    },
    {
        id: "prop-white-bg",
        label: "道具白底图",
        description: "单个互动道具的形态和材质锁定。",
        quality: "medium",
        size: "2048x2048",
        prompt: "生成单个互动道具白底资产设定图：道具居中、完整入画，清楚展示形状、尺寸感、材质、磨损、颜色和可被人物拿取或触碰的结构；真实棚拍产品照质感，柔和阴影，避免多个道具合并、夸张广告光效和无关背景。",
    },
    {
        id: "image-variation",
        label: "图生图修正",
        description: "保留主体与构图，只按文字微调。",
        quality: "medium",
        size: "2048x2048",
        prompt: "基于参考图生成修正版：保留原图主体、构图、空间关系、色彩倾向和整体风格，只根据文字要求调整局部细节；不要改变人物身份、服装主结构、场景布局和镜头角度。",
    },
    {
        id: "image-upscale",
        label: "高清放大",
        description: "提升清晰度、纹理和边缘稳定性。",
        quality: "high",
        size: "3840x2160",
        prompt: "提升当前图片清晰度：保留原图构图、主体、颜色、光线和质感，减少噪点、压缩痕迹和边缘毛刺，增强真实纹理和细节，不改变画面内容，不新增人物或物体。",
    },
];

type CanvasImagePresetPopoverProps = {
    value?: string;
    buttonClassName?: string;
    onSelect: (preset: CanvasImagePreset) => void;
};

export function CanvasImagePresetPopover({ value, buttonClassName, onSelect }: CanvasImagePresetPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const current = canvasImagePresets.find((item) => item.id === value);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
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
    }, [open]);

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={<Sparkles className="size-3.5" />}
                    onClick={() => setOpen((currentOpen) => !currentOpen)}
                >
                    <span className="truncate">{current?.label || "预设"}</span>
                    <ChevronDown className="ml-1 size-3.5 shrink-0 opacity-60" />
                </Button>
            </span>
            {open && buttonRect ? <PresetPortal buttonRect={buttonRect} panelRef={panelRef} theme={theme} selectedId={value} onSelect={onSelect} onClose={() => setOpen(false)} /> : null}
        </>
    );
}

function PresetPortal({
    buttonRect,
    panelRef,
    theme,
    selectedId,
    onSelect,
    onClose,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    selectedId?: string;
    onSelect: (preset: CanvasImagePreset) => void;
    onClose: () => void;
}) {
    const width = Math.min(420, Math.max(320, window.innerWidth - 24));
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, buttonRect.left));
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        bottom: window.innerHeight - buttonRect.top + 8,
        maxHeight: Math.max(260, buttonRect.top - 24),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 8,
        boxShadow: "var(--studio-shadow)",
        padding: 10,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div ref={panelRef} style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div className="grid gap-1.5">
                {canvasImagePresets.map((preset) => {
                    const selected = preset.id === selectedId;
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                            style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: theme.node.text }}
                            onClick={() => {
                                onSelect(preset);
                                onClose();
                            }}
                        >
                            <span className="mt-1 size-2 rounded-full" style={{ background: selected ? theme.node.activeStroke : theme.node.stroke }} />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{preset.label}</span>
                                <span className="mt-1 block text-xs leading-5" style={{ color: theme.node.muted }}>
                                    {preset.description}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>,
        document.body,
    );
}
