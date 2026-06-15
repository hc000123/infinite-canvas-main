import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, FolderOpen, Home, ImagePlus, Keyboard, LayoutGrid, Menu, Plus, Redo2, Save, Settings, Trash2, Undo2, Upload } from "lucide-react";
import { Button, Dropdown, Modal } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasTopBar({
    title,
    episodeLabel,
    episodeProductionLabel,
    hasEpisode,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    returnLabel,
    onReturnParent,
    onHome,
    onCreateProject,
    onDeleteProject,
    onSaveProject,
    onImportImage,
    onOpenEpisodeScript,
    onGenerateImage,
    onOpenAssets,
    onOrganizeCanvas,
    onOpenSettings,
    onUndo,
    onRedo,
}: {
    title: string;
    episodeLabel: string;
    episodeProductionLabel: string;
    hasEpisode: boolean;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    returnLabel: string;
    onReturnParent: () => void;
    onHome: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onSaveProject: () => void;
    onImportImage: () => void;
    onOpenEpisodeScript: () => void;
    onGenerateImage: () => void;
    onOpenAssets: () => void;
    onOrganizeCanvas: () => void;
    onOpenSettings: () => void;
    onUndo: () => void;
    onRedo: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3">
                <div className="pointer-events-auto flex min-w-0 items-center gap-2 overflow-hidden">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "parent", icon: <ArrowLeft className="size-4" />, label: returnLabel, onClick: onReturnParent },
                                { key: "projects", icon: <Home className="size-4" />, label: "项目工作台", onClick: onHome },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: "新建画布", onClick: onCreateProject },
                                { key: "save", icon: <Save className="size-4" />, label: "保存画布", onClick: onSaveProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除当前画布", onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "generate-image", icon: <ImagePlus className="size-4" />, label: "生成图片", onClick: onGenerateImage },
                                { key: "import", icon: <Upload className="size-4" />, label: "导入图片", onClick: onImportImage },
                                { key: "assets", icon: <FolderOpen className="size-4" />, label: "打开素材", onClick: onOpenAssets },
                                { key: "organize", icon: <LayoutGrid className="size-4" />, label: "整理画布", onClick: onOrganizeCanvas },
                                { key: "settings", icon: <Settings className="size-4" />, label: "设置", onClick: onOpenSettings },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text="撤销" shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                                { key: "shortcuts", icon: <Keyboard className="size-4" />, label: "快捷键", onClick: () => setShortcutsOpen(true) },
                            ],
                        }}
                    >
                        <button
                            type="button"
                            className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                            style={{ color: theme.node.text }}
                            aria-label="打开画布菜单"
                        >
                            <Menu className="size-5" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                        <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                            style={{ color: theme.node.muted }}
                            onClick={onReturnParent}
                            aria-label={returnLabel}
                            title={returnLabel}
                        >
                            <ArrowLeft className="size-4" />
                        </button>
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                aria-label="画布名称"
                                className="max-w-[320px] bg-transparent p-0 text-left text-base font-semibold tracking-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="min-w-0 max-w-[180px] truncate border-b border-dashed border-transparent text-left text-base font-semibold tracking-normal transition hover:border-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] sm:max-w-[320px]"
                                onDoubleClick={onStartTitleEditing}
                                title="双击修改画布名称"
                            >
                                {title}
                            </button>
                        )}
                        <button
                            type="button"
                            className="max-w-[96px] truncate rounded-md px-2 py-1 text-xs transition hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] sm:max-w-[150px]"
                            style={{ color: hasEpisode ? theme.node.text : theme.node.muted, background: hasEpisode ? theme.toolbar.panel : "transparent" }}
                            onClick={onOpenEpisodeScript}
                            title={hasEpisode ? "打开本集剧本" : "打开剧本工作台"}
                        >
                            {episodeLabel}
                        </button>
                        <span className="hidden max-w-[120px] truncate rounded-md px-2 py-1 text-xs sm:inline-block" style={{ color: theme.node.muted, background: theme.toolbar.panel }}>
                            {episodeProductionLabel}
                        </span>
                    </div>
                </div>

                <div className="pointer-events-auto hidden shrink-0 items-center gap-1 md:flex">
                    <TopAction icon={<ImagePlus className="size-4" />} label="生成图片" onClick={onGenerateImage} />
                    <TopAction icon={<Upload className="size-4" />} label="导入" onClick={onImportImage} />
                    <TopAction icon={<FolderOpen className="size-4" />} label="素材" onClick={onOpenAssets} />
                    <TopAction icon={<LayoutGrid className="size-4" />} label="整理画布" onClick={onOrganizeCanvas} />
                    <TopAction icon={<Settings className="size-4" />} label="设置" onClick={onOpenSettings} />
                </div>
            </div>
            <Modal rootClassName="studio-modal" title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["拖动画布"]} value="平移视图" />
                    <Shortcut keys={["滚轮"]} value="缩放画布" />
                    <Shortcut keys={["缩放滑杆"]} value="精确调整缩放" />
                    <Shortcut keys={["Ctrl / Cmd", "拖动"]} value="框选多个节点" />
                    <Shortcut keys={["Shift / Ctrl / Cmd", "点击"]} value="追加选择节点" />
                    <Shortcut keys={["Ctrl / Cmd", "A"]} value="全选节点" />
                    <Shortcut keys={["Ctrl / Cmd", "C / V"]} value="复制 / 粘贴节点，或粘贴剪切板文本/图片" />
                    <Shortcut keys={["Ctrl / Cmd", "Z"]} value="撤销" />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value="重做" />
                    <Shortcut keys={["Ctrl / Cmd", "Y"]} value="重做" />
                    <Shortcut keys={["Delete / Backspace"]} value="删除选中" />
                    <Shortcut keys={["Esc"]} value="取消选择并关闭浮层" />
                    <Shortcut keys={["拖入图片"]} value="上传到画布" />
                </div>
            </Modal>
        </>
    );
}

function TopAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <Button type="text" className="!h-8 !rounded-lg !px-2 !text-sm !font-medium opacity-85 hover:!opacity-100 sm:!px-2.5" style={{ color: theme.node.text }} icon={icon} onClick={onClick} aria-label={label} title={label}>
            <span className="hidden sm:inline">{label}</span>
        </Button>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none"
                            style={{ borderColor: "var(--studio-border-subtle)", background: "var(--studio-control-bg)", color: "var(--studio-text-secondary)", boxShadow: "inset 0 -1px 0 var(--studio-border-subtle)" }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}
