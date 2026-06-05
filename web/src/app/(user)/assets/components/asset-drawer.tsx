import { Copy, Download, Folder, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Drawer, Image, Space, Tag, Typography } from "antd";

import { isVolcengineReviewProcessing, shouldShowVolcengineReviewAction } from "@/services/volcengine-asset-metadata";
import type { Asset } from "@/stores/use-asset-store";
import { assetKindDownloadLabel, assetKindLabel, assetMediaInfo, volcengineReviewActionLabel } from "../asset-utils";
import { VolcengineAssetTag } from "./asset-card";
import { AssetGenerationSection } from "./asset-generation-section";

export function AssetDrawer({
    asset,
    folderName,
    refreshingReview,
    onClose,
    onCopy,
    onDownload,
    submittingReview,
    onReview,
    onRefreshReview,
}: {
    asset: Asset | null;
    folderName?: string;
    refreshingReview: boolean;
    onClose: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    submittingReview: boolean;
    onReview: (asset: Asset) => void;
    onRefreshReview: (asset: Asset) => void;
}) {
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    const videoPreviewUrl = asset?.kind === "video" ? videoCoverUrl(asset.data.url) : "";
    const mediaInfo = asset ? assetMediaInfo(asset) : "";
    return (
        <Drawer title="素材详情" open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? (
                <div className="space-y-5">
                    {cover ? (
                        <Image src={cover} alt={asset.title} className="rounded-lg" />
                    ) : asset.kind === "video" ? (
                        <video src={videoPreviewUrl} muted playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black object-cover" />
                    ) : (
                        <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                    <div>
                        <Typography.Title level={4} className="!mb-2">
                            {asset.title}
                        </Typography.Title>
                        <Space size={[4, 4]} wrap>
                            <Tag>{assetKindLabel(asset.kind)}</Tag>
                            {folderName ? <Tag icon={<Folder className="size-3" />}>{folderName}</Tag> : null}
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag}>{tag}</Tag>
                            ))}
                            {(asset.kind === "image" || asset.kind === "video") && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                        </Space>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <Typography.Text type="secondary" className="block text-xs">
                            内容
                        </Typography.Text>
                        {asset.kind === "text" ? (
                            <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{asset.data.content}</Typography.Paragraph>
                        ) : asset.kind === "video" ? (
                            <>
                                <video src={asset.data.url} controls className="mt-2 aspect-video w-full rounded-lg bg-black" />
                                <Typography.Text className="mt-2 block">{mediaInfo}</Typography.Text>
                            </>
                        ) : asset.kind === "audio" ? (
                            <>
                                <audio src={asset.data.url} controls className="mt-2 w-full" />
                                <Typography.Text className="mt-2 block">{mediaInfo}</Typography.Text>
                            </>
                        ) : (
                            <Typography.Text className="mt-2 block">{mediaInfo}</Typography.Text>
                        )}
                    </div>
                    {asset.note ? (
                        <div>
                            <Typography.Text type="secondary">备注</Typography.Text>
                            <Typography.Paragraph className="mt-1">{asset.note}</Typography.Paragraph>
                        </div>
                    ) : null}
                    <AssetGenerationSection asset={asset} />
                    <Space wrap>
                        {asset.kind === "text" ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(asset)}>
                                复制文本
                            </Button>
                        ) : null}
                        {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" ? (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(asset)}>
                                {assetKindDownloadLabel(asset.kind)}
                            </Button>
                        ) : null}
                        {shouldShowVolcengineReviewAction(asset.kind) ? (
                            asset.metadata?.volcengineAsset?.assetId ? (
                                <Button icon={<RefreshCw className={`size-4 ${isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !refreshingReview ? "animate-spin" : ""}`} />} loading={refreshingReview} onClick={() => onRefreshReview(asset)}>
                                    {volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)}
                                </Button>
                            ) : (
                                <Button icon={<ShieldCheck className="size-4" />} loading={submittingReview} onClick={() => onReview(asset)}>
                                    提交加白
                                </Button>
                            )
                        ) : null}
                    </Space>
                    {(asset.kind === "image" || asset.kind === "video") && asset.metadata?.volcengineAsset ? (
                        <div className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-800">
                            <Typography.Text type="secondary" className="block text-xs">
                                火山素材
                            </Typography.Text>
                            <Typography.Paragraph copyable className="!mb-0 !mt-2">
                                {asset.metadata.volcengineAsset.assetId}
                            </Typography.Paragraph>
                            <Typography.Text type="secondary" className="block text-xs">
                                素材组：{asset.metadata.volcengineAsset.groupId} · 项目：{asset.metadata.volcengineAsset.projectName}
                            </Typography.Text>
                            {asset.metadata.volcengineAsset.error ? (
                                <Typography.Text type="danger" className="mt-2 block break-words text-xs">
                                    失败原因：{asset.metadata.volcengineAsset.error}
                                </Typography.Text>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </Drawer>
    );
}

function videoCoverUrl(url: string) {
    if (!url || url.includes("#")) return url;
    return `${url}#t=0.1`;
}
