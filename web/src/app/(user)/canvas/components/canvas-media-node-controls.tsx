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
                className={`${dark ? "grid size-8 place-items-center px-0 text-white" : "inline-flex h-8 items-center gap-1.5 px-2.5"} rounded-lg border text-[11px] font-medium shadow-[0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-md transition hover:scale-[1.03]`}
                style={{ background: dark ? "rgba(0,0,0,.5)" : `${theme.toolbar.panel}d9`, borderColor: dark ? "rgba(255,255,255,.22)" : `${theme.toolbar.border}cc`, color: dark ? "#fff" : theme.node.text }}
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
                    className="thin-scrollbar absolute left-0 top-10 z-50 max-h-44 w-[min(320px,calc(100vw-32px))] overflow-auto whitespace-pre-wrap break-words rounded-xl border p-3 text-xs leading-5 shadow-[0_18px_42px_rgba(0,0,0,.22)] backdrop-blur-md"
                    style={{ background: dark ? "rgba(0,0,0,.72)" : `${theme.node.fill}f2`, borderColor: dark ? "rgba(255,255,255,.22)" : theme.node.stroke, color: dark ? "#fff" : theme.node.text }}
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
    theme,
    submitting,
    className,
    dark = false,
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
    return (
        <div
            className={`${className || ""} pointer-events-none inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium shadow-[0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-md`}
            style={{ background: dark ? "rgba(0,0,0,.5)" : `${theme.toolbar.panel}d9`, borderColor: dark ? "rgba(255,255,255,.22)" : `${theme.toolbar.border}cc`, color: dark ? "#fff" : theme.node.text }}
            title={active ? "素材已完成加白" : failed ? "素材加白失败" : "素材加白处理中"}
            aria-label="素材加白状态"
        >
            <ShieldCheck className={`size-3.5 ${processing ? "animate-pulse" : ""}`} />
            {label}
        </div>
    );
}
