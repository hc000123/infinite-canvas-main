"use client";

import { type ReactNode } from "react";
import { AudioLines, Camera, Download, FolderPlus, Image as ImageIcon, Info, Lock, LockOpen, Maximize2, Minus, Pencil, Plus, RefreshCw, Scissors, Settings2, ShieldCheck, Trash2, Upload, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasToolButton, CanvasToolDivider } from "./canvas-tool-button";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "../types";

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    actions: CanvasNodeHoverToolbarActions;
    state: CanvasNodeHoverToolbarState;
};

export type CanvasNodeHoverToolbarActions = {
    onInfo: (node: CanvasNodeData) => void;
    onEditText: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onUpdateAssetReference: (node: CanvasNodeData) => void;
    onContinueVideo: (node: CanvasNodeData) => void;
    onCaptureVideoFrame: (node: CanvasNodeData) => void;
    onReviewAsset: (node: CanvasNodeData) => void;
    onRefreshReview: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
};

export type CanvasNodeHoverToolbarState = {
    hasNewAssetVersion?: boolean;
    submittingReview: boolean;
    refreshingReview: boolean;
};

type NodeToolbarAction =
    | {
          type: "button";
          key: string;
          title: string;
          label: string;
          icon: ReactNode;
          onClick: () => void;
          active?: boolean;
          danger?: boolean;
      }
    | {
          type: "divider";
          key: string;
      };

export function CanvasNodeHoverToolbar({
    node,
    viewport,
    onKeep,
    onLeave,
    actions: toolbarActions,
    state,
}: CanvasNodeHoverToolbarProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    if (!node) return null;

    const shouldOverlayMedia = [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio].includes(node.type) && Boolean(node.metadata?.content);
    const left = viewport.x + (node.position.x + node.width / 2) * viewport.k;
    const top = viewport.y + node.position.y * viewport.k + (shouldOverlayMedia ? 12 : -14);
    const items = buildNodeToolbarActions({
        node,
        actions: toolbarActions,
        state,
    });

    return (
        <div
            className={`absolute z-[70] flex h-12 -translate-x-1/2 items-center overflow-visible rounded-[18px] border text-[15px] shadow-lg backdrop-blur ${shouldOverlayMedia ? "" : "-translate-y-full"}`}
            style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" }}
            onMouseEnter={() => onKeep(node.id)}
            onMouseLeave={onLeave}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {items.map((action) =>
                action.type === "divider" ? (
                    <CanvasToolDivider key={action.key} size="md" />
                ) : (
                    <ToolbarAction key={action.key} title={action.title} label={action.label} icon={action.icon} onClick={action.onClick} active={action.active} danger={action.danger} />
                ),
            )}
        </div>
    );
}

function buildNodeToolbarActions({
    node,
    actions,
    state,
}: {
    node: CanvasNodeData;
    actions: CanvasNodeHoverToolbarActions;
    state: CanvasNodeHoverToolbarState;
}) {
    const {
        onInfo,
        onEditText,
        onDecreaseFont,
        onIncreaseFont,
        onToggleDialog,
        onGenerateImage,
        onUpload,
        onDownload,
        onSaveAsset,
        onUpdateAssetReference,
        onContinueVideo,
        onCaptureVideoFrame,
        onReviewAsset,
        onRefreshReview,
        onCrop,
        onAngle,
        onViewImage,
        onRetry,
        onToggleFreeResize,
        onDelete,
    } = actions;
    const { hasNewAssetVersion, submittingReview, refreshingReview } = state;
    const isImage = node.type === CanvasNodeType.Image;
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const hasVideo = isVideo && Boolean(node.metadata?.content);
    const hasAudio = isAudio && Boolean(node.metadata?.content);
    const isText = node.type === CanvasNodeType.Text;
    const isConfig = node.type === CanvasNodeType.Config;
    const canOpenDialog = isConfig || (isImage && !hasImage) || (isVideo && !hasVideo);
    const canRetry = node.metadata?.status === "error";
    const hasSpecificTools = canRetry || isText || isImage || isVideo || isAudio || isConfig;
    const review = node.metadata?.volcengineAsset;
    const reviewProcessing = review?.status === "Processing";
    const items: NodeToolbarAction[] = [{ type: "button", key: "info", title: "查看节点信息", label: "信息", icon: <Info className="size-4" />, onClick: () => onInfo(node) }];

    if (hasSpecificTools) items.push({ type: "divider", key: "primary-divider" });
    if (hasImage || hasVideo || hasAudio) items.push({ type: "button", key: "download", title: hasAudio ? "下载音频" : hasVideo ? "下载视频" : "下载图片", label: hasAudio ? "下载音频" : hasVideo ? "下载视频" : "下载图片", icon: <Download className="size-5" />, onClick: () => onDownload(node) });
    if (hasImage || hasVideo || hasAudio || isText) items.push({ type: "button", key: "save-asset", title: "加入我的素材", label: "存素材", icon: <FolderPlus className="size-4" />, onClick: () => onSaveAsset(node) });
    if (hasNewAssetVersion) items.push({ type: "button", key: "update-asset-reference", title: "素材有新版本可用，仅更新当前节点的引用版本记录", label: "有新版本", icon: <RefreshCw className="size-4" />, onClick: () => onUpdateAssetReference(node), active: true });
    if (canRetry) items.push({ type: "button", key: "retry", title: "重新生成", label: "重试", icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) });
    if (hasImage || hasVideo) {
        items.push(
            review?.assetId
                ? {
                      type: "button",
                      key: "refresh-review",
                      title: reviewProcessing ? "火山加白审核中，状态会自动刷新" : `火山加白状态：${volcengineStatusLabel(review.status)}`,
                      label: volcengineReviewActionLabel(review.status),
                      icon: <RefreshCw className={`size-4 ${reviewProcessing || refreshingReview ? "animate-spin" : ""}`} />,
                      onClick: () => onRefreshReview(node),
                  }
                : {
                      type: "button",
                      key: "review-asset",
                      title: hasVideo ? "提交视频火山素材加白" : "提交图片火山素材加白",
                      label: submittingReview ? "提交中" : "加白",
                      icon: <ShieldCheck className="size-4" />,
                      onClick: () => onReviewAsset(node),
                  },
        );
    }
    if (hasVideo) items.push({ type: "button", key: "capture-video-frame", title: "截取当前预览帧", label: "截帧", icon: <ImageIcon className="size-4" />, onClick: () => onCaptureVideoFrame(node) });
    if (hasVideo && node.metadata?.lastFrameUrl) items.push({ type: "button", key: "continue-video", title: "续写下一段", label: "续写", icon: <Video className="size-4" />, onClick: () => onContinueVideo(node) });
    if (isText) items.push({ type: "button", key: "edit-text", title: "编辑文本", label: "编辑文字", icon: <Pencil className="size-4" />, onClick: () => onEditText(node) });
    if (isText) items.push({ type: "button", key: "generate-image", title: "用文本生图", label: "生图", icon: <ImageIcon className="size-4" />, onClick: () => onGenerateImage(node) });
    if (canOpenDialog) items.push({ type: "button", key: "toggle-dialog", title: "打开生成设置", label: "生成设置", icon: <Settings2 className="size-4" />, onClick: () => onToggleDialog(node) });
    if (isText) items.push({ type: "button", key: "decrease-font", title: "减小字号", label: "缩小", icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) });
    if (isText) items.push({ type: "button", key: "increase-font", title: "增大字号", label: "放大", icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) });
    if (isImage || isVideo || isAudio) items.push({ type: "divider", key: "media-manage-divider" });
    if (isImage) items.push({ type: "button", key: "upload-image", title: hasImage ? "替换图片" : "上传图片", label: hasImage ? "替换图片" : "上传图片", icon: <Upload className="size-4" />, onClick: () => onUpload(node) });
    if (isVideo) items.push({ type: "button", key: "upload-video", title: hasVideo ? "替换视频" : "上传视频", label: hasVideo ? "替换视频" : "上传视频", icon: <Video className="size-4" />, onClick: () => onUpload(node) });
    if (isAudio) items.push({ type: "button", key: "upload-audio", title: hasAudio ? "替换音频" : "上传音频", label: hasAudio ? "替换音频" : "上传音频", icon: <AudioLines className="size-4" />, onClick: () => onUpload(node) });
    if (hasImage) items.push({ type: "button", key: "toggle-free-resize", title: node.metadata?.freeResize ? "切换为等比缩放" : "切换为自由比例", label: node.metadata?.freeResize ? "自由比例" : "锁比例", icon: node.metadata?.freeResize ? <LockOpen className="size-4" /> : <Lock className="size-4" />, onClick: () => onToggleFreeResize(node), active: node.metadata?.freeResize });
    if (hasImage) items.push({ type: "button", key: "crop", title: "裁剪并生成新节点", label: "裁剪", icon: <Scissors className="size-4" />, onClick: () => onCrop(node) });
    if (hasImage) items.push({ type: "button", key: "angle", title: "生成角度", label: "多角度", icon: <Camera className="size-4" />, onClick: () => onAngle(node) });
    if (hasImage) items.push({ type: "button", key: "view-image", title: "查看图片详情", label: "查看大图", icon: <Maximize2 className="size-4" />, onClick: () => onViewImage(node) });
    items.push({ type: "divider", key: "danger-divider" });
    items.push({ type: "button", key: "delete", title: "移除节点", label: "删除", icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true });

    return items;
}

function volcengineStatusLabel(status?: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}

function volcengineReviewActionLabel(status?: string) {
    if (status === "Processing") return "审核中";
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    return "加白状态";
}

function ToolbarAction({ title, label, icon, onClick, hint, active = false, danger = false }: { title: string; label: string; icon: ReactNode; onClick?: () => void; hint?: string; active?: boolean; danger?: boolean }) {
    return <CanvasToolButton size="md" title={hint ? `${title} · ${hint}` : title} label={label} icon={icon} onClick={onClick} active={active} danger={danger} />;
}
