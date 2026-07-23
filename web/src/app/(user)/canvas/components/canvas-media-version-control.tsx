"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { Popover } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasMediaVersion, CanvasNodeData } from "../types";
import { canvasMediaVersionNavigation } from "../utils/canvas-media-versions";

export function CanvasMediaVersionControl({ node, disabled = false, variant = "media", className = "", onSwitch }: { node: CanvasNodeData; disabled?: boolean; variant?: "media" | "panel"; className?: string; onSwitch?: (node: CanvasNodeData, versionId: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [open, setOpen] = useState(false);
    const navigation = canvasMediaVersionNavigation(node);
    if (navigation.versions.length < 2) return null;
    const switchTo = (versionId?: string) => {
        if (!versionId || disabled) return;
        setOpen(false);
        if (versionId === navigation.current?.id) return;
        onSwitch?.(node, versionId);
    };
    const buttonStyle = variant === "media" ? { background: "var(--studio-media-overlay)", borderColor: "var(--studio-border-subtle)", color: "var(--studio-on-media)" } : { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };

    return (
        <div
            className={`inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-lg border shadow-[var(--studio-shadow)] backdrop-blur-md ${className}`}
            style={buttonStyle}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <VersionArrow label="上一版本" disabled={disabled || !navigation.previousId} onClick={() => switchTo(navigation.previousId)}>
                <ChevronLeft className="size-3.5" />
            </VersionArrow>
            <Popover
                open={open}
                onOpenChange={(next) => !disabled && setOpen(next)}
                placement={variant === "media" ? "bottom" : "top"}
                trigger="click"
                content={
                    <div className="thin-scrollbar max-h-[360px] w-[320px] max-w-[calc(100vw-48px)] space-y-1 overflow-y-auto p-1">
                        {navigation.versions
                            .slice()
                            .reverse()
                            .map((version) => (
                                <VersionRow key={version.id} version={version} active={version.id === navigation.current?.id} theme={theme} onClick={() => switchTo(version.id)} />
                            ))}
                    </div>
                }
            >
                <button
                    type="button"
                    disabled={disabled}
                    className="inline-flex h-7 shrink-0 whitespace-nowrap items-center justify-center border-x px-2.5 text-[11px] font-semibold tabular-nums transition hover:bg-[var(--studio-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ borderColor: buttonStyle.borderColor }}
                    title="查看全部版本"
                    aria-label={`当前 ${navigation.label}，查看全部版本`}
                >
                    <span className="whitespace-nowrap">{navigation.label}</span>
                </button>
            </Popover>
            <VersionArrow label="下一版本" disabled={disabled || !navigation.nextId} onClick={() => switchTo(navigation.nextId)}>
                <ChevronRight className="size-3.5" />
            </VersionArrow>
        </div>
    );
}

function VersionArrow({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="grid size-7 shrink-0 place-items-center transition hover:bg-[var(--studio-hover-bg)] disabled:cursor-not-allowed disabled:opacity-35" onClick={onClick} title={label} aria-label={label}>
            {children}
        </button>
    );
}

function VersionRow({ version, active, theme, onClick }: { version: CanvasMediaVersion; active: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onClick: () => void }) {
    const content = version.metadata.content;
    return (
        <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-[var(--studio-hover-bg)]"
            style={{ background: active ? theme.toolbar.activeBg : "transparent", borderColor: active ? theme.node.activeStroke : "transparent", color: theme.node.text }}
            onClick={onClick}
        >
            <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-md" style={{ background: theme.node.fill, color: theme.node.placeholder }}>
                {content ? version.kind === "video" ? <video src={content} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={content} alt={`v${version.versionNumber}`} className="h-full w-full object-cover" /> : <History className="size-4 opacity-45" />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <span>v{version.versionNumber}</span>
                    <span className="truncate text-[10px] font-normal opacity-55">{formatVersionTime(version.createdAt)}</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] opacity-60">{versionParameterSummary(version) || "默认参数"}</div>
                <div className="mt-1 truncate text-[11px] opacity-85">{version.prompt || "无提示词"}</div>
            </div>
        </button>
    );
}

function formatVersionTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function versionParameterSummary(version: CanvasMediaVersion) {
    const metadata = version.metadata;
    return [metadata.model, metadata.resolution || metadata.vquality, metadata.ratio || metadata.size, metadata.seconds || metadata.duration ? `${metadata.seconds || metadata.duration}秒` : ""].filter(Boolean).join(" · ");
}
