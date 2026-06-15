"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { theme as antdTheme } from "antd";
import { Plus, Trash2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type ContextMenuState } from "../types";

export function CanvasNodeContextMenu({
    menu,
    nodes,
    selectedNodeIds,
    onClose,
    onCreateVideoFromImages,
    onDuplicate,
    onDelete,
}: {
    menu: ContextMenuState;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onClose: () => void;
    onCreateVideoFromImages: (nodes: CanvasNodeData[]) => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const selectedImages = nodes.filter((node) => selectedNodeIds.has(node.id) && node.type === CanvasNodeType.Image && node.metadata?.content).sort(compareReferenceImageNodes);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-[var(--studio-shadow)]"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {selectedImages.length >= 2 ? <MenuButton icon={<Video className="size-4" />} label="创建视频节点" onClick={() => onCreateVideoFromImages(selectedImages)} /> : null}
            <MenuButton icon={<Plus className="size-4" />} label="复制" onClick={onDuplicate} />
            <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
        </div>
    );
}

function compareReferenceImageNodes(a: CanvasNodeData, b: CanvasNodeData) {
    const aOrder = a.metadata?.canvasSource?.import?.order;
    const bOrder = b.metadata?.canvasSource?.import?.order;
    if (typeof aOrder === "number" && typeof bOrder === "number" && aOrder !== bOrder) return aOrder - bOrder;
    return (a.title || a.id).localeCompare(b.title || b.id, "zh-Hans-CN");
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();

    return (
        <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
            style={{ color: danger ? token.colorError : theme.node.text }}
            onClick={onClick}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
