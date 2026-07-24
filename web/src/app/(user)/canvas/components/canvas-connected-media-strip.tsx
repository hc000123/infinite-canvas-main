"use client";

import { AudioLines, Image as ImageIcon, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnectedMediaItem } from "../utils/canvas-connected-media";

export function CanvasConnectedMediaStrip({ items, onPreview, onDisconnect }: { items: CanvasConnectedMediaItem[]; onPreview?: (nodeId: string) => void; onDisconnect: (connectionId: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!items.length) return null;

    return (
        <section
            className="shrink-0"
            aria-label="已连接素材"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium" style={{ color: theme.node.muted }}>
                <span>已连接素材</span>
                <span className="tabular-nums">{items.length}</span>
            </div>
            <div className="thin-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                {items.map((item) => (
                    <div key={item.connectionId} className="flex min-w-[150px] max-w-[190px] shrink-0 items-center gap-1 rounded-md border p-1" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onPreview?.(item.nodeId)} title={`预览 ${item.title}`}>
                            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded" style={{ background: theme.node.panel, color: theme.node.muted }}>
                                {item.type === "image" && item.previewUrl ? <img src={item.previewUrl} alt="" className="size-full object-cover" /> : item.type === "image" ? <ImageIcon className="size-4" /> : item.type === "video" ? <Video className="size-4" /> : <AudioLines className="size-4" />}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-[10px]" style={{ color: theme.node.muted }}>{item.label}</span>
                                <span className="block truncate text-xs" style={{ color: theme.node.text }}>{item.title}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            className="grid size-6 shrink-0 place-items-center rounded transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                            aria-label={`断开素材：${item.title}`}
                            title="断开与当前节点的连线"
                            onClick={(event) => {
                                event.stopPropagation();
                                onDisconnect(item.connectionId);
                            }}
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}
