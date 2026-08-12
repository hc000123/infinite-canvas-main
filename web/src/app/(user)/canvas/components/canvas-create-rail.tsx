"use client";

import { useState } from "react";
import { AudioLines, Ellipsis, FileType2, Image as ImageIcon, MousePointer2, SlidersHorizontal, Upload, Video } from "lucide-react";
import { Dropdown } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasToolButton } from "./canvas-tool-button";

export type CanvasCreateRailActions = {
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddConfig: () => void;
    onUpload: () => void;
    onDeselect: () => void;
};

export function CanvasCreateRail({ actions }: { actions: CanvasCreateRailActions }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [moreOpen, setMoreOpen] = useState(false);
    const moreItems = [
        { key: "config", label: "配置节点", icon: <SlidersHorizontal className="size-4" />, onClick: () => { actions.onAddConfig(); setMoreOpen(false); } },
        { key: "upload", label: "上传文件", icon: <Upload className="size-4" />, onClick: () => { actions.onUpload(); setMoreOpen(false); } },
    ];

    return (
        <div className="pointer-events-none absolute bottom-24 left-4 top-16 z-50 flex items-center">
            <nav data-canvas-editorial-surface aria-label="左侧创建栏" className="pointer-events-auto relative flex flex-col gap-0.5 rounded-md border p-1" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}>
                <CanvasToolButton label="选择" icon={<MousePointer2 className="size-4.5" />} onClick={actions.onDeselect} />
                <CanvasToolButton label="文本" icon={<FileType2 className="size-4.5" />} onClick={actions.onAddText} />
                <CanvasToolButton label="图片" icon={<ImageIcon className="size-4.5" />} onClick={actions.onAddImage} />
                <CanvasToolButton label="视频" icon={<Video className="size-4.5" />} onClick={actions.onAddVideo} />
                <CanvasToolButton label="音频" icon={<AudioLines className="size-4.5" />} onClick={actions.onAddAudio} />
                <Dropdown trigger={["click"]} placement="bottomLeft" open={moreOpen} onOpenChange={setMoreOpen} menu={{ items: moreItems }}>
                    <button
                        type="button"
                        className="group relative grid h-8 w-8 place-items-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                        style={{ color: moreOpen ? theme.accent : theme.toolbar.item }}
                        aria-label="更多"
                        aria-haspopup="menu"
                        aria-expanded={moreOpen}
                    >
                        <span className="grid size-8 place-items-center rounded-md transition" style={{ background: moreOpen ? theme.toolbar.activeBg : undefined, outline: moreOpen ? `1px solid ${theme.focusRing}` : undefined }}>
                            <Ellipsis className="size-4.5" />
                        </span>
                    </button>
                </Dropdown>
            </nav>
        </div>
    );
}
