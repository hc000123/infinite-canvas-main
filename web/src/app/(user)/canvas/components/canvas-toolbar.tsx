import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useState } from "react";
import { Segmented, Switch } from "antd";
import { AudioLines, CircleDot, Eraser, FolderOpen, Grid2x2, Hand, Image as ImageIcon, Info, Moon, Palette, Redo2, ScrollText, Settings2, Square, Sun, Trash2, Type, Undo2, Upload, Video } from "lucide-react";

import { canvasThemes, type CanvasBackgroundMode, type CanvasColorTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { CanvasToolButton, CanvasToolDivider } from "./canvas-tool-button";

type CanvasToolbarItem =
    | {
          type: "button";
          id: string;
          label: string;
          icon: ReactNode;
          onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
          disabled?: boolean;
          active?: boolean;
          danger?: boolean;
      }
    | {
          type: "divider";
          id: string;
      };

export function CanvasToolbar({ actions, state }: { actions: CanvasToolbarActions; state: CanvasToolbarState }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [panelX, setPanelX] = useState(0);
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const tools = buildToolbarItems({
        actions,
        state,
        appearanceOpen,
        onAppearanceClick: (event) => {
            setPanelX(getTipX(event.currentTarget));
            setAppearanceOpen((value) => !value);
        },
    });

    return (
        <div className="pointer-events-none absolute bottom-5 z-50 flex justify-center" style={{ left: 300, right: 16 }}>
            <div className="thin-scrollbar pointer-events-auto flex h-14 max-w-full items-center gap-1 overflow-x-auto rounded-xl border px-2 shadow-lg backdrop-blur [&>*]:shrink-0" style={dockStyle}>
                {tools.map((tool) =>
                    tool.type === "divider" ? <CanvasToolDivider key={tool.id} /> : <CanvasToolButton key={tool.id} label={tool.label} icon={tool.icon} onClick={tool.onClick} active={tool.active} disabled={tool.disabled} danger={tool.danger} />,
                )}
            </div>

            {appearanceOpen ? (
                <CanvasAppearancePanel
                    colorTheme={colorTheme}
                    panelX={panelX}
                    backgroundMode={state.backgroundMode}
                    showImageInfo={state.showImageInfo}
                    onThemeChange={setTheme}
                    onBackgroundModeChange={actions.onBackgroundModeChange}
                    onShowImageInfoChange={actions.onShowImageInfoChange}
                />
            ) : null}
        </div>
    );
}

export type CanvasToolbarActions = {
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddConfig: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDelete: () => void;
    onClear: () => void;
    onDeselect: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onOpenAssets: () => void;
    onOpenEpisodeWorkbench: () => void;
};

export type CanvasToolbarState = {
    selectedCount: number;
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

function buildToolbarItems({ actions, state, appearanceOpen, onAppearanceClick }: { actions: CanvasToolbarActions; state: CanvasToolbarState; appearanceOpen: boolean; onAppearanceClick: (event: ReactMouseEvent<HTMLButtonElement>) => void }) {
    const { selectedCount, canUndo, canRedo } = state;
    const { onAddImage, onAddVideo, onAddAudio, onAddText, onAddConfig, onUndo, onRedo, onUpload, onDelete, onClear, onDeselect, onOpenAssets, onOpenEpisodeWorkbench } = actions;
    const items: CanvasToolbarItem[] = [
        { type: "button", id: "tool-hand", label: "移动/选择", icon: <Hand className="size-4.5" />, active: !selectedCount, onClick: onDeselect },
        { type: "button", id: "tool-undo", label: "撤销", icon: <Undo2 className="size-4.5" />, disabled: !canUndo, onClick: onUndo },
        { type: "button", id: "tool-redo", label: "重做", icon: <Redo2 className="size-4.5" />, disabled: !canRedo, onClick: onRedo },
        { type: "divider", id: "divider-create" },
        { type: "button", id: "tool-text", label: "文本", icon: <Type className="size-4.5" />, onClick: onAddText },
        { type: "button", id: "tool-image", label: "图片", icon: <ImageIcon className="size-4.5" />, onClick: onAddImage },
        { type: "button", id: "tool-video", label: "视频", icon: <Video className="size-4.5" />, onClick: onAddVideo },
        { type: "button", id: "tool-audio", label: "音频", icon: <AudioLines className="size-4.5" />, onClick: onAddAudio },
        { type: "button", id: "tool-config", label: "生成配置", icon: <Settings2 className="size-4.5" />, onClick: onAddConfig },
        { type: "button", id: "tool-upload", label: "上传素材", icon: <Upload className="size-4.5" />, onClick: onUpload },
        { type: "divider", id: "divider-assets" },
        { type: "button", id: "tool-assets", label: "素材", icon: <FolderOpen className="size-4.5" />, onClick: onOpenAssets },
        { type: "button", id: "tool-episode-workbench", label: "本集生产流程", icon: <ScrollText className="size-4.5" />, onClick: onOpenEpisodeWorkbench },
        { type: "button", id: "tool-style", label: "外观设置", icon: <Palette className="size-4.5" />, active: appearanceOpen, onClick: onAppearanceClick },
    ];

    if (selectedCount) {
        items.push({ type: "divider", id: "divider-selection" }, { type: "button", id: "tool-delete", label: "删除选中", icon: <Trash2 className="size-4.5" />, onClick: onDelete, danger: true });
    }

    items.push({ type: "divider", id: "divider-clear" }, { type: "button", id: "tool-clear", label: "清空画布", icon: <Eraser className="size-4.5" />, onClick: onClear, danger: true });
    return items;
}

function CanvasAppearancePanel({
    colorTheme,
    panelX,
    backgroundMode,
    showImageInfo,
    onThemeChange,
    onBackgroundModeChange,
    onShowImageInfoChange,
}: {
    colorTheme: CanvasColorTheme;
    panelX: number;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onThemeChange: (theme: CanvasColorTheme) => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
}) {
    const theme = canvasThemes[colorTheme];

    return (
        <div
            className="pointer-events-auto absolute bottom-[72px] z-30 w-[248px] -translate-x-1/2 rounded-xl border p-2.5 shadow-xl backdrop-blur"
            style={{ left: panelX || "50%", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
        >
            <div className="px-1 pb-2 text-sm font-medium opacity-65">外观设置</div>
            <div className="px-1 pb-1.5 text-[11px] font-medium opacity-50">全局主题</div>
            <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                <CanvasThemeButton colorTheme={colorTheme} targetTheme="light" onThemeChange={onThemeChange}>
                    <Sun className="size-4" />
                    浅色
                </CanvasThemeButton>
                <CanvasThemeButton colorTheme={colorTheme} targetTheme="dark" onThemeChange={onThemeChange}>
                    <Moon className="size-4" />
                    深色
                </CanvasThemeButton>
            </div>
            <div className="mt-3 px-1 pb-1.5 text-[11px] font-medium opacity-50">网格样式</div>
            <Segmented
                className="w-full !p-1 [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!min-h-8 [&_.ant-segmented-item]:!flex-1 [&_.ant-segmented-item-label]:!min-h-8 [&_.ant-segmented-item-label]:!leading-8"
                value={backgroundMode}
                onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)}
                options={backgroundModeOptions}
            />
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65">
                    <Info className="size-3.5" />
                    图片信息
                </span>
                <Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} />
            </div>
        </div>
    );
}

const backgroundModeOptions = [
    {
        value: "dots",
        label: (
            <span className="inline-flex items-center gap-1.5">
                <CircleDot className="size-4" />点
            </span>
        ),
    },
    {
        value: "lines",
        label: (
            <span className="inline-flex items-center gap-1.5">
                <Grid2x2 className="size-4" />线
            </span>
        ),
    },
    {
        value: "blank",
        label: (
            <span className="inline-flex items-center gap-1.5">
                <Square className="size-4" />
                空白
            </span>
        ),
    },
];

function CanvasThemeButton({ colorTheme, targetTheme, onThemeChange, children }: { colorTheme: CanvasColorTheme; targetTheme: CanvasColorTheme; onThemeChange: (theme: CanvasColorTheme) => void; children: ReactNode }) {
    const theme = canvasThemes[colorTheme];
    const active = colorTheme === targetTheme;

    return (
        <AnimatedThemeToggler
            theme={colorTheme}
            targetTheme={targetTheme}
            onThemeChange={onThemeChange}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition"
            style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.toolbar.item }}
            aria-label={`切换到全局${targetTheme === "dark" ? "深色" : "浅色"}主题`}
            title={`切换到全局${targetTheme === "dark" ? "深色" : "浅色"}主题`}
        >
            {children}
        </AnimatedThemeToggler>
    );
}

function getTipX(target: HTMLElement) {
    const wrapBox = target.parentElement?.parentElement?.getBoundingClientRect() || target.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.left - wrapBox.left + box.width / 2;
}
