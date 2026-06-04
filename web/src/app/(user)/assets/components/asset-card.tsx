import { CheckCircle, Copy, Download, Eye, Folder, PencilLine, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, Card, Tag, Tooltip, Typography } from "antd";

import { isVolcengineReviewProcessing, shouldShowVolcengineReviewAction } from "@/services/volcengine-asset-metadata";
import type { Asset } from "@/stores/use-asset-store";
import { assetKindLabel, assetSummary, volcengineReviewActionLabel } from "../asset-utils";

export function AssetCard({
    asset,
    folderName,
    refreshingReview,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    submittingReview,
    onReview,
    onRefreshReview,
}: {
    asset: Asset;
    folderName?: string;
    refreshingReview: boolean;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: () => void;
    submittingReview: boolean;
    onReview: () => void;
    onRefreshReview: () => void;
}) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const summary = assetSummary(asset);
    const openOnKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
    };
    return (
        <Card
            hoverable
            className="overflow-hidden"
            styles={{ body: { padding: 0 } }}
            cover={
                <div role="button" tabIndex={0} className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400" onClick={onOpen} onKeyDown={openOnKeyboard}>
                    {cover ? (
                        <img src={cover} alt={asset.title} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                </div>
            }
        >
            <div role="button" tabIndex={0} className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400" onClick={onOpen} onKeyDown={openOnKeyboard}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{asset.title}</h2>
                            <Typography.Text type="secondary" className="mt-1 block text-xs">
                                {asset.source || "未标注来源"}
                            </Typography.Text>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            <Tag className="m-0 text-[11px]">{assetKindLabel(asset.kind)}</Tag>
                            {folderName ? (
                                <Tag className="m-0 text-[11px]" icon={<Folder className="size-3" />}>
                                    {folderName}
                                </Tag>
                            ) : null}
                            {asset.kind === "image" && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                        </div>
                    </div>
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 3 }} className="!mb-0 !mt-2 !text-xs !leading-5">
                        {summary}
                    </Typography.Paragraph>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {(asset.tags || []).slice(0, 3).map((tag) => (
                            <Tag key={tag} className="m-0 text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                        {!asset.tags?.length ? <Tag className="m-0 text-[11px]">无标签</Tag> : null}
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
                        asset.metadata?.volcengineAsset?.assetId ? (
                            <AssetIconButton
                                title={volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)}
                                icon={<RefreshCw className={`size-3.5 ${isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !refreshingReview ? "animate-spin" : ""}`} />}
                                loading={refreshingReview}
                                onClick={onRefreshReview}
                            />
                        ) : (
                            <AssetIconButton title="加白" icon={<ShieldCheck className="size-3.5" />} loading={submittingReview} onClick={onReview} />
                        )
                    ) : null}
                    <AssetIconButton title="删除" icon={<Trash2 className="size-3.5" />} danger onClick={onDelete} />
                </div>
            </div>
        </Card>
    );
}

export function AssetIconButton({ title, icon, danger, loading, onClick }: { title: string; icon: ReactNode; danger?: boolean; loading?: boolean; onClick: () => void }) {
    return (
        <Tooltip title={title}>
            <Button type="text" size="small" className="!h-8 !w-8 !min-w-8 !p-0" danger={danger} icon={icon} loading={loading} onClick={onClick} aria-label={title} />
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
