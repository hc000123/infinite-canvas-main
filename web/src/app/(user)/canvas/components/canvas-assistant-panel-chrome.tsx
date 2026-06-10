"use client";

import { History, PanelRightClose, Plus, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";

import { DiaTextReveal } from "@/components/ui/dia-text-reveal";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasAssistantHeaderProps = {
    view: "chat" | "history";
    checkedCount: number;
    historyCount: number;
    canStartChat: boolean;
    onDeleteSelected: () => void;
    onDeleteAll: () => void;
    onToggleView: () => void;
    onStartChat: () => void;
    onOpenConfig: () => void;
    onCollapse: () => void;
};

export function CanvasAssistantHeader({ view, checkedCount, historyCount, canStartChat, onDeleteSelected, onDeleteAll, onToggleView, onStartChat, onOpenConfig, onCollapse }: CanvasAssistantHeaderProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const iconButtonStyle = { color: theme.node.muted };

    return (
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
            <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4" />
                {view === "history" ? "历史记录" : "画布助手"}
            </div>
            <div className="flex items-center gap-1">
                {view === "history" ? (
                    <>
                        <Tooltip title="删除选中">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Trash2 className="size-4" />} disabled={!checkedCount} onClick={onDeleteSelected} />
                        </Tooltip>
                        <Tooltip title="删除全部">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<X className="size-4" />} disabled={!historyCount} onClick={onDeleteAll} />
                        </Tooltip>
                    </>
                ) : null}
                <Tooltip title={view === "history" ? "返回对话" : "历史记录"}>
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<History className="size-4" />} onClick={onToggleView} />
                </Tooltip>
                <Tooltip title="新对话">
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Plus className="size-4" />} disabled={!canStartChat} onClick={onStartChat} />
                </Tooltip>
                <Tooltip title="配置">
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Settings2 className="size-4" />} onClick={onOpenConfig} />
                </Tooltip>
                <Tooltip title="收起对话">
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<PanelRightClose className="size-4" />} onClick={onCollapse} />
                </Tooltip>
            </div>
        </div>
    );
}

export function CanvasAssistantEmptyState() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="flex h-full flex-col items-center justify-center px-1 text-center">
            <div className="relative font-serif text-4xl font-bold italic tracking-normal" style={{ color: theme.node.text }}>
                <span>眨眼之间</span>
                <DiaTextReveal className="absolute inset-0" colors={["#A97CF8", "#F38CB8", "#FDCC92"]} textColor="transparent" duration={1.8} startOnView={false} text="眨眼之间" />
            </div>
            <div className="mt-3 text-base tracking-wide opacity-60">一眨眼，把灵感铺成画布</div>
        </div>
    );
}

type CanvasAssistantDeleteModalProps = {
    count: number;
    deletingAll: boolean;
    onCancel: () => void;
    onClearAll: () => void;
    onRemoveSelected: () => void;
};

export function CanvasAssistantDeleteModal({ count, deletingAll, onCancel, onClearAll, onRemoveSelected }: CanvasAssistantDeleteModalProps) {
    return (
        <Modal
            title="删除对话记录？"
            open={count > 0}
            centered
            onCancel={onCancel}
            footer={
                <>
                    <Button onClick={onCancel}>取消</Button>
                    <Button
                        danger
                        type="primary"
                        onClick={() => {
                            if (deletingAll) onClearAll();
                            else onRemoveSelected();
                        }}
                    >
                        删除
                    </Button>
                </>
            }
        >
            <p className="text-sm opacity-60">将删除 {count} 条对话记录，此操作不可撤销。</p>
        </Modal>
    );
}
