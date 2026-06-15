"use client";

import { useState } from "react";
import { FileText, ShieldCheck } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "../types";

export function GeneratedPromptToggle({ node, theme, variant = "panel" }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; variant?: "panel" | "dark" }) {
    const [open, setOpen] = useState(false);
    const prompt = node.metadata?.prompt?.trim();
    if (!prompt) return null;
    const dark = variant === "dark";
    return (
        <div className="relative">
            <button
                type="button"
                className={`${dark ? "grid size-8 place-items-center px-0" : "inline-flex h-8 items-center gap-1.5 px-2.5"} rounded-lg border text-[11px] font-medium shadow-[var(--studio-shadow)] backdrop-blur-md transition hover:scale-[1.03]`}
                style={{ background: dark ? "var(--studio-media-overlay)" : `${theme.toolbar.panel}d9`, borderColor: dark ? "var(--studio-border-subtle)" : `${theme.toolbar.border}cc`, color: dark ? "var(--studio-on-media)" : theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen((value) => !value);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="查看生成提示词"
                aria-label="查看生成提示词"
            >
                <FileText className={dark ? "size-4" : "size-3.5"} />
                {dark ? null : "提示词"}
            </button>
            {open ? (
                <div
                    className="thin-scrollbar absolute left-0 top-10 z-50 max-h-44 w-[min(320px,calc(100vw-32px))] overflow-auto whitespace-pre-wrap break-words rounded-lg border p-3 text-xs leading-5 shadow-[var(--studio-shadow)] backdrop-blur-md"
                    style={{ background: dark ? "var(--studio-media-overlay)" : `${theme.node.fill}f2`, borderColor: dark ? "var(--studio-border-subtle)" : theme.node.stroke, color: dark ? "var(--studio-on-media)" : theme.node.text }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                    data-canvas-no-zoom
                >
                    {prompt}
                </div>
            ) : null}
        </div>
    );
}

export function MediaReviewStatusBadge({
    node,
    submitting,
    className,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    submitting?: boolean;
    className?: string;
    dark?: boolean;
}) {
    if (!node.metadata?.content) return null;
    const review = node.metadata?.volcengineAsset;
    const active = review?.status === "Active";
    const failed = review?.status === "Failed";
    const processing = review?.status === "Processing" || submitting;
    if (!review?.assetId && !processing) return null;
    const label = active ? "已加白" : failed ? "加白失败" : processing ? "加白中" : "待刷新";
    const tone = active ? reviewBadgeTones.active : failed ? reviewBadgeTones.failed : processing ? reviewBadgeTones.processing : reviewBadgeTones.idle;
    return (
        <div
            className={`${className || ""} pointer-events-none inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold shadow-[var(--studio-shadow)] backdrop-blur-md`}
            style={{ background: tone.background, borderColor: tone.border, color: tone.text }}
            title={active ? "素材已完成加白" : failed ? "素材加白失败" : "素材加白处理中"}
            aria-label="素材加白状态"
        >
            <ShieldCheck className={`size-3.5 ${processing ? "animate-pulse" : ""}`} style={{ color: tone.icon }} />
            {label}
        </div>
    );
}

const reviewBadgeTones = {
    active: {
        background: "color-mix(in srgb, var(--studio-success) 34%, var(--studio-media-overlay))",
        border: "color-mix(in srgb, var(--studio-success) 64%, var(--studio-border-subtle))",
        icon: "var(--studio-success)",
        text: "var(--studio-on-media)",
    },
    failed: {
        background: "color-mix(in srgb, var(--studio-danger) 36%, var(--studio-media-overlay))",
        border: "color-mix(in srgb, var(--studio-danger) 66%, var(--studio-border-subtle))",
        icon: "var(--studio-danger)",
        text: "var(--studio-on-media)",
    },
    processing: {
        background: "color-mix(in srgb, var(--studio-warning) 36%, var(--studio-media-overlay))",
        border: "color-mix(in srgb, var(--studio-warning) 66%, var(--studio-border-subtle))",
        icon: "var(--studio-warning)",
        text: "var(--studio-on-media)",
    },
    idle: {
        background: "var(--studio-media-overlay)",
        border: "var(--studio-border-subtle)",
        icon: "var(--studio-text-muted)",
        text: "var(--studio-on-media)",
    },
};
