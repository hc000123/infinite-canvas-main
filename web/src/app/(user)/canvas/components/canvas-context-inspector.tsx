"use client";

import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { shouldShowCanvasAssistantPanel } from "../utils/canvas-inspector-visibility";

type CanvasContextInspectorProps = {
    assistantMounted: boolean;
    assistantSlot?: ReactNode;
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    onOpenAssistant: () => void;
};

export function CanvasContextInspector({ assistantMounted, assistantSlot, collapsed, onCollapsedChange, onOpenAssistant }: CanvasContextInspectorProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const showAssistant = shouldShowCanvasAssistantPanel({ assistantMounted, collapsed });

    if (!showAssistant) {
        return (
            <aside className="relative flex h-full w-10 shrink-0 items-start justify-center border-l pt-3" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
                <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                    style={{ color: theme.node.muted }}
                    onClick={() => {
                        onCollapsedChange(false);
                        onOpenAssistant();
                    }}
                    title="打开画布助手"
                    aria-label="打开画布助手"
                >
                    <MessageSquare className="size-4" />
                </button>
            </aside>
        );
    }

    return (
        <aside
            className="fixed inset-y-0 right-0 z-[80] flex h-full w-[calc(100vw-16px)] max-w-[420px] shrink-0 flex-col border-l shadow-[var(--studio-shadow)] md:relative md:z-auto md:w-[420px] md:shadow-none"
            style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
        >
            {assistantSlot}
        </aside>
    );
}
