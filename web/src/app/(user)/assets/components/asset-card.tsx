import { CheckCircle, CheckSquare, Copy, Download, Eye, Folder, ImageIcon, ImagePlus, Link2, PencilLine, RefreshCw, ShieldCheck, Square, Trash2, Upload } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, Card, Tag, Tooltip, Typography } from "antd";

import { canSubmitVolcengineReview, isVolcengineReviewProcessing, shouldShowVolcengineReviewAction } from "@/services/volcengine-asset-metadata";
import type { Asset } from "@/stores/use-asset-store";
import { cn } from "@/lib/utils";
import { assetInCanvasLibrary } from "../asset-canvas-library";
import { assetInProjectLibrary } from "../asset-project-library";
import { assetKindLabel, assetMediaInfo, assetSummary, volcengineReviewActionLabel } from "../asset-utils";
import { workflowAssetCanGenerate, workflowAssetInfo, workflowAssetPrompt } from "../workflow-asset-image";

export function AssetCard({
    asset,
    folderName,
    selected,
    refreshingReview,
    onSelect,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    submittingReview,
    onReview,
    onRefreshReview,
    onGenerateWorkflowImage,
    generatingWorkflowImage,
    projectLibraryProjectId,
    canvasLibraryCanvasId,
}: {
    asset: Asset;
    folderName?: string;
    selected: boolean;
    refreshingReview: boolean;
    onSelect: () => void;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: () => void;
    submittingReview: boolean;
    onReview: () => void;
    onRefreshReview: () => void;
    onGenerateWorkflowImage?: (asset: Asset) => void;
    generatingWorkflowImage?: boolean;
    projectLibraryProjectId?: string;
    canvasLibraryCanvasId?: string;
}) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const workflowInfo = workflowAssetInfo(asset);
    const canGenerateWorkflowImage = workflowAssetCanGenerate(asset);
    const videoPreviewUrl = asset.kind === "video" ? videoCoverUrl(asset.data.url) : "";
    const mediaInfo = assetMediaInfo(asset);
    const summary = assetSummary(asset);
    const openOnKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
    };
    if (workflowInfo) {
        return (
            <WorkflowImportedAssetCard
                asset={asset}
                canGenerateWorkflowImage={canGenerateWorkflowImage}
                cover={cover}
                folderName={folderName}
                generatingWorkflowImage={generatingWorkflowImage}
                mediaInfo={mediaInfo}
                onCopy={onCopy}
                onDelete={onDelete}
                onDownload={onDownload}
                onEdit={onEdit}
                onGenerateWorkflowImage={onGenerateWorkflowImage}
                onOpen={onOpen}
                onRefreshReview={onRefreshReview}
                onReview={onReview}
                onSelect={onSelect}
                refreshingReview={refreshingReview}
                selected={selected}
                submittingReview={submittingReview}
                workflowInfo={workflowInfo}
            />
        );
    }
    return (
        <Card
            hoverable
            className={cn("studio-card overflow-hidden", selected && "!border-[var(--studio-accent)] ring-2 ring-[var(--studio-accent)]")}
            styles={{ body: { padding: 0 } }}
            cover={
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={`查看素材详情：${asset.title}`}
                    className="relative block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]"
                    onClick={onOpen}
                    onKeyDown={openOnKeyboard}
                >
                    <Tooltip title={selected ? "取消选择" : "选择素材"}>
                        <button
                            type="button"
                            aria-label={selected ? `取消选择素材 ${asset.title}` : `选择素材 ${asset.title}`}
                            aria-pressed={selected}
                            className={cn(
                                "absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md border border-[var(--studio-border-strong)] bg-[rgba(21,24,33,.86)] text-[var(--studio-text-secondary)] shadow-sm backdrop-blur transition hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]",
                                selected && "border-[var(--studio-accent)] bg-[var(--studio-accent)] text-[var(--primary-foreground)] hover:bg-[var(--studio-accent-hover)] hover:text-[var(--primary-foreground)]",
                            )}
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelect();
                            }}
                        >
                            {selected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                        </button>
                    </Tooltip>
                    {cover ? (
                        <img src={cover} alt={asset.title} className="aspect-[4/3] w-full object-cover" />
                    ) : asset.kind === "video" ? (
                        <video src={videoPreviewUrl} muted playsInline preload="metadata" className="aspect-[4/3] w-full bg-[var(--studio-shell-bg)] object-cover" />
                    ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-[var(--studio-panel-muted-bg)] p-5 text-center text-sm leading-6 text-[var(--studio-text-secondary)]">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                    {mediaInfo ? (
                        <span className="absolute bottom-2 right-2 max-w-[calc(100%-16px)] truncate rounded-md border border-[var(--studio-border-subtle)] bg-[rgba(21,24,33,.78)] px-2 py-1 text-[11px] font-medium leading-none text-[var(--studio-text-primary)] backdrop-blur-sm">
                            {mediaInfo}
                        </span>
                    ) : null}
                </div>
            }
        >
            <div
                role="button"
                tabIndex={0}
                aria-label={`查看素材详情：${asset.title}`}
                className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]"
                onClick={onOpen}
                onKeyDown={openOnKeyboard}
            >
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="line-clamp-1 text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{asset.title}</h2>
                            <Typography.Text className="mt-1 block text-sm !text-[var(--studio-text-secondary)]">{asset.source || "未标注来源"}</Typography.Text>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            <Tag className="studio-tag text-xs">{assetKindLabel(asset.kind)}</Tag>
                            {folderName ? (
                                <Tag className="studio-tag text-xs" icon={<Folder className="size-3" />}>
                                    {folderName}
                                </Tag>
                            ) : null}
                            {assetInProjectLibrary(asset, projectLibraryProjectId || "") ? <Tag className="studio-tag text-xs">项目库</Tag> : null}
                            {assetInCanvasLibrary(asset, canvasLibraryCanvasId || "") ? <Tag className="studio-tag text-xs">画布</Tag> : null}
                            {(asset.kind === "image" || asset.kind === "video") && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                        </div>
                    </div>
                    <Typography.Paragraph ellipsis={{ rows: 2 }} className="!mb-0 !mt-3 !text-sm !leading-6 !text-[var(--studio-text-secondary)]">
                        {summary}
                    </Typography.Paragraph>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {(asset.tags || []).slice(0, 3).map((tag) => (
                            <Tag key={tag} className="studio-tag text-xs">
                                {tag}
                            </Tag>
                        ))}
                        {!asset.tags?.length ? <Tag className="studio-tag text-xs">无标签</Tag> : null}
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 pb-4">
                <div className="flex min-w-0 items-center gap-1">
                    <AssetIconButton title="查看" icon={<Eye className="size-3.5" />} onClick={onOpen} />
                    <AssetIconButton title="编辑" icon={<PencilLine className="size-3.5" />} onClick={onEdit} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {asset.kind === "text" ? <AssetIconButton title="复制" icon={<Copy className="size-3.5" />} onClick={() => void onCopy(asset)} /> : null}
                    {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" ? <AssetIconButton title="下载" icon={<Download className="size-3.5" />} onClick={() => onDownload(asset)} /> : null}
                    {shouldShowVolcengineReviewAction(asset.kind) ? (
                        asset.metadata?.volcengineAsset?.assetId && !canSubmitVolcengineReview(asset.metadata.volcengineAsset) ? (
                            <AssetIconButton
                                title={volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)}
                                icon={<RefreshCw className={`size-3.5 ${isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !refreshingReview ? "animate-spin" : ""}`} />}
                                loading={refreshingReview}
                                onClick={onRefreshReview}
                            />
                        ) : (
                            <AssetIconButton title={asset.metadata?.volcengineAsset?.status === "Failed" ? "重新加白" : "加白"} icon={<ShieldCheck className="size-3.5" />} loading={submittingReview} onClick={onReview} />
                        )
                    ) : null}
                    <AssetIconButton title="删除" icon={<Trash2 className="size-3.5" />} danger onClick={onDelete} />
                </div>
            </div>
        </Card>
    );
}

export function AssetRow({
    asset,
    selected,
    refreshingReview,
    onSelect,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    submittingReview,
    onReview,
    onRefreshReview,
    onGenerateWorkflowImage,
    generatingWorkflowImage,
    onMatchWorkflowImage,
    onUploadWorkflowImage,
    uploadingWorkflowImage,
}: {
    asset: Asset;
    selected: boolean;
    refreshingReview: boolean;
    onSelect: () => void;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: () => void;
    submittingReview: boolean;
    onReview: () => void;
    onRefreshReview: () => void;
    onGenerateWorkflowImage?: (asset: Asset) => void;
    generatingWorkflowImage?: boolean;
    onMatchWorkflowImage?: (asset: Asset) => void;
    onUploadWorkflowImage?: (asset: Asset) => void;
    uploadingWorkflowImage?: boolean;
}) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const workflowInfo = workflowAssetInfo(asset);
    const canGenerateWorkflowImage = workflowAssetCanGenerate(asset);
    const videoPreviewUrl = asset.kind === "video" ? videoCoverUrl(asset.data.url) : "";
    const mediaInfo = assetMediaInfo(asset);
    const summary = workflowInfo ? workflowAssetContentField(asset, ["视觉描述", "描述", "用途", "资产用途"]) || assetSummary(asset) : assetSummary(asset);
    const isGenerated = asset.kind === "image" || workflowInfo?.status === "image_generated";
    const statusLabel = workflowInfo ? (isGenerated ? "已生图" : "待生图") : assetKindLabel(asset.kind);
    const generateLabel = isGenerated ? "重新生成" : "生成图片";
    const typeLabel = workflowInfo?.type || assetKindLabel(asset.kind);
    const identity = [workflowInfo?.assetId, workflowInfo?.episode].filter(Boolean).join(" · ");
    const previewFitClass = workflowInfo ? "object-contain" : "object-cover";
    const openOnKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
    };

    return (
        <article className={cn("group grid min-h-[96px] grid-cols-[auto_minmax(0,124px)_minmax(0,1fr)] items-stretch gap-3 rounded-lg border bg-[var(--studio-elevated-bg)] p-3 transition lg:grid-cols-[auto_minmax(0,132px)_minmax(0,1fr)_auto]", selected ? "border-[var(--studio-accent)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-accent)]")}>
            <Tooltip title={selected ? "取消选择素材" : "选择素材"}>
                <button
                    type="button"
                    aria-label={selected ? `取消选择素材 ${asset.title}` : `选择素材 ${asset.title}`}
                    aria-pressed={selected}
                    className={cn("mt-1 grid h-7 w-7 place-items-center rounded-md border border-[var(--studio-border-strong)] bg-[rgba(10,14,22,.58)] text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]", selected && "border-[var(--studio-accent)] bg-[var(--studio-accent)] text-[var(--primary-foreground)] hover:text-[var(--primary-foreground)]")}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect();
                    }}
                >
                    {selected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                </button>
            </Tooltip>

            <div
                role="button"
                tabIndex={0}
                aria-label={`查看素材详情：${asset.title}`}
                className="relative min-h-[72px] cursor-pointer overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-shell-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]"
                onClick={onOpen}
                onKeyDown={openOnKeyboard}
            >
                {cover ? (
                    <img src={cover} alt={asset.title} className={`size-full ${previewFitClass}`} />
                ) : asset.kind === "video" ? (
                    <video src={videoPreviewUrl} muted playsInline preload="metadata" className="size-full bg-[var(--studio-shell-bg)] object-cover" />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1.5 px-4 text-center text-xs leading-5 text-[var(--studio-text-muted)]">
                        <ImageIcon className="size-6" />
                        <span>{workflowInfo ? "待匹配图片" : asset.kind === "text" ? "文本素材" : "暂无封面"}</span>
                    </div>
                )}
                <span className="absolute left-1.5 top-1.5 rounded border border-[var(--studio-border-subtle)] bg-[rgba(10,14,22,.72)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--studio-text-primary)] backdrop-blur">{statusLabel}</span>
                {mediaInfo ? <span className="absolute bottom-1.5 right-1.5 max-w-[calc(100%-12px)] truncate rounded border border-[var(--studio-border-subtle)] bg-[rgba(10,14,22,.76)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--studio-text-primary)] backdrop-blur">{mediaInfo}</span> : null}
            </div>

            <div
                role="button"
                tabIndex={0}
                aria-label={`查看素材详情：${asset.title}`}
                className="min-w-0 cursor-pointer py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]"
                onClick={onOpen}
                onKeyDown={openOnKeyboard}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <h3 className="min-w-0 truncate text-sm font-semibold leading-6 text-[var(--studio-text-primary)]">{asset.title}</h3>
                    <span className="shrink-0 rounded border border-[var(--studio-border-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--studio-text-secondary)]">{typeLabel}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs leading-5 text-[var(--studio-text-secondary)]">{summary}</p>
                <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] text-[var(--studio-text-muted)]">
                    {identity ? <span className="shrink-0">{identity}</span> : null}
                    {asset.source ? <span className="truncate">{asset.source}</span> : null}
                    {(asset.kind === "image" || asset.kind === "video") && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                </div>
            </div>

            <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--studio-border-subtle)] pt-3 lg:col-span-1 lg:flex-col lg:items-end lg:justify-center lg:border-t-0 lg:pt-0">
                <div className="flex flex-wrap justify-end gap-2">
                    {canGenerateWorkflowImage && onGenerateWorkflowImage ? (
                        <Button
                            type="primary"
                            size="middle"
                            className="!h-8"
                            icon={<ImagePlus className="size-4" />}
                            loading={generatingWorkflowImage}
                            onClick={(event) => {
                                event.stopPropagation();
                                onGenerateWorkflowImage(asset);
                            }}
                        >
                            {generateLabel}
                        </Button>
                    ) : null}
                    {workflowInfo && onMatchWorkflowImage ? (
                        <Button
                            size="middle"
                            className="!h-8"
                            icon={<Link2 className="size-4" />}
                            onClick={(event) => {
                                event.stopPropagation();
                                onMatchWorkflowImage?.(asset);
                            }}
                        >
                            匹配旧图
                        </Button>
                    ) : null}
                    {workflowInfo && onUploadWorkflowImage ? (
                        <Button
                            size="middle"
                            className="!h-8"
                            icon={<Upload className="size-4" />}
                            loading={uploadingWorkflowImage}
                            onClick={(event) => {
                                event.stopPropagation();
                                onUploadWorkflowImage(asset);
                            }}
                        >
                            上传
                        </Button>
                    ) : null}
                </div>
                <div className="flex items-center gap-1">
                    <AssetIconButton title="查看" icon={<Eye className="size-3.5" />} onClick={onOpen} />
                    <AssetIconButton title="编辑" icon={<PencilLine className="size-3.5" />} onClick={onEdit} />
                    {asset.kind === "text" ? <AssetIconButton title="复制" icon={<Copy className="size-3.5" />} onClick={() => void onCopy(asset)} /> : null}
                    {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" ? <AssetIconButton title="下载" icon={<Download className="size-3.5" />} onClick={() => onDownload(asset)} /> : null}
                    {shouldShowVolcengineReviewAction(asset.kind) ? (
                        asset.metadata?.volcengineAsset?.assetId && !canSubmitVolcengineReview(asset.metadata.volcengineAsset) ? (
                            <AssetIconButton title={volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)} icon={<RefreshCw className={`size-3.5 ${isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !refreshingReview ? "animate-spin" : ""}`} />} loading={refreshingReview} onClick={onRefreshReview} />
                        ) : (
                            <AssetIconButton title={asset.metadata?.volcengineAsset?.status === "Failed" ? "重新加白" : "加白"} icon={<ShieldCheck className="size-3.5" />} loading={submittingReview} onClick={onReview} />
                        )
                    ) : null}
                    <AssetIconButton title="删除" icon={<Trash2 className="size-3.5" />} danger onClick={onDelete} />
                </div>
            </div>
        </article>
    );
}

function WorkflowImportedAssetCard({
    asset,
    canGenerateWorkflowImage,
    cover,
    folderName,
    generatingWorkflowImage,
    mediaInfo,
    onCopy,
    onDelete,
    onDownload,
    onEdit,
    onGenerateWorkflowImage,
    onOpen,
    onRefreshReview,
    onReview,
    onSelect,
    refreshingReview,
    selected,
    submittingReview,
    workflowInfo,
}: {
    asset: Asset;
    canGenerateWorkflowImage: boolean;
    cover: string;
    folderName?: string;
    generatingWorkflowImage?: boolean;
    mediaInfo: string;
    onCopy: (asset: Asset) => void;
    onDelete: () => void;
    onDownload: (asset: Asset) => void;
    onEdit: () => void;
    onGenerateWorkflowImage?: (asset: Asset) => void;
    onOpen: () => void;
    onRefreshReview: () => void;
    onReview: () => void;
    onSelect: () => void;
    refreshingReview: boolean;
    selected: boolean;
    submittingReview: boolean;
    workflowInfo: NonNullable<ReturnType<typeof workflowAssetInfo>>;
}) {
    const prompt = workflowAssetPrompt(asset);
    const description = workflowAssetContentField(asset, ["视觉描述", "描述", "用途", "资产用途"]) || "生成或上传图片后，这里会成为视频工作流资产的可视化素材卡。";
    const statusLabel = asset.kind === "image" || workflowInfo.status === "image_generated" ? "已生图" : "待生图";
    const openOnKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
    };

    return (
        <article
            className={cn(
                "group overflow-hidden rounded-lg border bg-[var(--studio-elevated-bg)] transition",
                selected ? "border-[var(--studio-accent)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-accent)]",
            )}
        >
            <div role="button" tabIndex={0} aria-label={`查看素材详情：${asset.title}`} className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]" onClick={onOpen} onKeyDown={openOnKeyboard}>
                <div className="relative bg-[var(--studio-shell-bg)]" style={{ aspectRatio: "4 / 3" }}>
                    {cover ? (
                        <img src={cover} alt={asset.title} className="size-full object-contain" />
                    ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-2 border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] text-[var(--studio-text-muted)]">
                            <ImageIcon className="size-9" />
                            <span className="text-sm">未绑定预览图</span>
                            <span className="px-5 text-center text-xs leading-5">生成图片后自动回写到这张卡片</span>
                        </div>
                    )}
                    <div className="absolute left-3 top-3 flex items-center gap-2">
                        <Tooltip title={selected ? "取消选择素材" : "选择素材"}>
                            <button
                                type="button"
                                aria-label={selected ? `取消选择素材 ${asset.title}` : `选择素材 ${asset.title}`}
                                aria-pressed={selected}
                                className={cn(
                                    "grid h-7 w-7 place-items-center rounded-md border border-[var(--studio-border-strong)] bg-[rgba(10,14,22,.72)] text-[var(--studio-text-secondary)] backdrop-blur transition hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]",
                                    selected && "border-[var(--studio-accent)] bg-[var(--studio-accent)] text-[var(--primary-foreground)] hover:text-[var(--primary-foreground)]",
                                )}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onSelect();
                                }}
                            >
                                {selected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                            </button>
                        </Tooltip>
                        <span className="rounded-md border border-[var(--studio-border-subtle)] bg-[rgba(10,14,22,.72)] px-2 py-1 text-xs font-semibold text-[var(--studio-text-primary)] backdrop-blur">工作流</span>
                    </div>
                    <span className="absolute right-3 top-3 rounded-md border border-[var(--studio-border-subtle)] bg-[rgba(10,14,22,.72)] px-2 py-1 text-xs font-semibold text-[var(--studio-text-primary)] backdrop-blur">
                        {workflowInfo.type || "资产"}
                    </span>
                    <span className="absolute bottom-3 left-3 rounded-md border border-[var(--studio-border-subtle)] bg-[rgba(10,14,22,.78)] px-2 py-1 text-xs font-medium text-[var(--studio-text-primary)] backdrop-blur">{statusLabel}</span>
                    {mediaInfo ? (
                        <span className="absolute bottom-3 right-3 rounded-md border border-[var(--studio-border-subtle)] bg-[rgba(10,14,22,.78)] px-2 py-1 text-xs font-medium text-[var(--studio-text-primary)] backdrop-blur">{mediaInfo}</span>
                    ) : null}
                </div>
                <div className="grid min-h-[230px] gap-3 p-4">
                    <div className="min-w-0">
                        <h2 className="line-clamp-2 break-words text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{asset.title}</h2>
                        <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-[var(--studio-text-secondary)]">{description}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
                            <span className="text-[var(--studio-text-muted)]">生图提示词</span>
                            {workflowInfo.assetId ? <span className="shrink-0 rounded border border-[var(--studio-border-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--studio-text-secondary)]">{workflowInfo.assetId}</span> : null}
                        </div>
                        <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--studio-text-primary)]">{prompt || "暂无提示词，请先从视频工作流导入 Stage 2 资产提示词。"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--studio-text-muted)]">
                        {workflowInfo.episode ? <span>{workflowInfo.episode}</span> : null}
                        {workflowInfo.sourcePath ? <span className="line-clamp-1 break-all">来源：{workflowInfo.sourcePath}</span> : null}
                        {folderName ? <span>文件夹：{folderName}</span> : null}
                    </div>
                </div>
            </div>
            <div className="grid gap-2 border-t border-[var(--studio-border-subtle)] p-3">
                {canGenerateWorkflowImage && onGenerateWorkflowImage ? (
                    <Button
                        type="primary"
                        className="!h-9"
                        icon={<ImagePlus className="size-4" />}
                        loading={generatingWorkflowImage}
                        onClick={(event) => {
                            event.stopPropagation();
                            onGenerateWorkflowImage(asset);
                        }}
                    >
                        {asset.kind === "image" || workflowInfo.status === "image_generated" ? "重新生成图片" : "生成图片"}
                    </Button>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                        <AssetIconButton title="查看" icon={<Eye className="size-3.5" />} onClick={onOpen} />
                        <AssetIconButton title="编辑" icon={<PencilLine className="size-3.5" />} onClick={onEdit} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {asset.kind === "text" ? <AssetIconButton title="复制" icon={<Copy className="size-3.5" />} onClick={() => void onCopy(asset)} /> : null}
                        {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" ? <AssetIconButton title="下载" icon={<Download className="size-3.5" />} onClick={() => onDownload(asset)} /> : null}
                        {shouldShowVolcengineReviewAction(asset.kind) ? (
                            asset.metadata?.volcengineAsset?.assetId && !canSubmitVolcengineReview(asset.metadata.volcengineAsset) ? (
                                <AssetIconButton
                                    title={volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)}
                                    icon={<RefreshCw className={`size-3.5 ${isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !refreshingReview ? "animate-spin" : ""}`} />}
                                    loading={refreshingReview}
                                    onClick={onRefreshReview}
                                />
                            ) : (
                                <AssetIconButton title={asset.metadata?.volcengineAsset?.status === "Failed" ? "重新加白" : "加白"} icon={<ShieldCheck className="size-3.5" />} loading={submittingReview} onClick={onReview} />
                            )
                        ) : null}
                        <AssetIconButton title="删除" icon={<Trash2 className="size-3.5" />} danger onClick={onDelete} />
                    </div>
                </div>
            </div>
        </article>
    );
}

function workflowAssetContentField(asset: Asset, labels: string[]) {
    if (asset.kind !== "text") return "";
    for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = asset.data.content.match(new RegExp(`(?:\\*\\*)?${escaped}(?:\\*\\*)?[:：]\\s*([\\s\\S]*?)(?=\\n(?:\\*\\*)?[^\\n：:]+(?:\\*\\*)?[:：]|\\n#{1,3}\\s|$)`));
        if (match?.[1]?.trim()) return match[1].trim();
    }
    return "";
}

function videoCoverUrl(url: string) {
    if (!url || url.includes("#")) return url;
    return `${url}#t=0.1`;
}

export function AssetIconButton({ title, icon, danger, loading, onClick }: { title: string; icon: ReactNode; danger?: boolean; loading?: boolean; onClick: () => void }) {
    return (
        <Tooltip title={title}>
            <Button
                type="text"
                size="small"
                className={cn("!h-8 !w-8 !min-w-8 !bg-transparent !p-0 !text-[var(--studio-text-secondary)] hover:!bg-[var(--studio-accent-soft)] hover:!text-[var(--studio-accent)]", danger && "hover:!bg-rose-500/10 hover:!text-[var(--studio-danger)]")}
                danger={danger}
                icon={icon}
                loading={loading}
                onClick={onClick}
                aria-label={title}
            />
        </Tooltip>
    );
}

export function VolcengineAssetTag({ status }: { status: string }) {
    if (status === "Active")
        return (
            <Tag color="success" className="m-0 shrink-0 text-[11px]" icon={<CheckCircle className="size-3" />}>
                已加白
            </Tag>
        );
    if (status === "Failed")
        return (
            <Tag color="error" className="m-0 shrink-0 text-[11px]">
                审核失败
            </Tag>
        );
    return (
        <Tag color="processing" className="m-0 shrink-0 text-[11px]">
            审核中
        </Tag>
    );
}
