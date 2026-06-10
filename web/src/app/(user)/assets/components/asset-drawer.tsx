import { Copy, Download, Folder, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { Button, Drawer, Image, Space, Tag, Typography } from "antd";

import { isVolcengineReviewProcessing, shouldShowVolcengineReviewAction } from "@/services/volcengine-asset-metadata";
import type { Asset } from "@/stores/use-asset-store";
import { assetCanvasLibraryEntries } from "../asset-canvas-library";
import { assetProjectLibraryEntries, projectLibraryRoleLabel, projectLibrarySyncStatusLabel } from "../asset-project-library";
import { assetVersionMediaSummary, assetVersionRecords, type AssetVersionRecord } from "../asset-version-history";
import type { AssetVersionUsageReference } from "../asset-version-references";
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
    projectLibraryProjectTitles,
    canvasLibraryTitles,
    usageReferences,
    onDownloadVersion,
    onRestoreVersion,
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
    projectLibraryProjectTitles?: Record<string, string>;
    canvasLibraryTitles?: Record<string, string>;
    usageReferences?: AssetVersionUsageReference[];
    onDownloadVersion: (asset: Asset, versionId: string) => void;
    onRestoreVersion: (asset: Asset, versionId: string) => void;
}) {
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    const videoPreviewUrl = asset?.kind === "video" ? videoCoverUrl(asset.data.url) : "";
    const mediaInfo = asset ? assetMediaInfo(asset) : "";
    const projectLibraryEntries = assetProjectLibraryEntries(asset);
    const canvasLibraryEntries = assetCanvasLibraryEntries(asset);
    const versionRecords = assetVersionRecords(asset);
    return (
        <Drawer rootClassName="studio-workspace" title="素材详情" open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? (
                <div className="space-y-5">
                    {cover ? (
                        <Image src={cover} alt={asset.title} className="rounded-md" />
                    ) : asset.kind === "video" ? (
                        <video src={videoPreviewUrl} muted playsInline preload="metadata" className="aspect-video w-full rounded-md bg-black object-cover" />
                    ) : (
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-5 text-sm leading-6 text-[var(--studio-text-secondary)]">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                    <div>
                        <Typography.Title level={4} className="!mb-2 !text-[var(--studio-text-primary)]">
                            {asset.title}
                        </Typography.Title>
                        <Space size={[4, 4]} wrap>
                            <Tag className="studio-tag">{assetKindLabel(asset.kind)}</Tag>
                            {folderName ? (
                                <Tag className="studio-tag" icon={<Folder className="size-3" />}>
                                    {folderName}
                                </Tag>
                            ) : null}
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag} className="studio-tag">
                                    {tag}
                                </Tag>
                            ))}
                            {(asset.kind === "image" || asset.kind === "video") && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                        </Space>
                    </div>
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
                        <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                            内容
                        </Typography.Text>
                        {asset.kind === "text" ? (
                            <Typography.Paragraph className="mt-2 whitespace-pre-wrap !text-[var(--studio-text-primary)]">{asset.data.content}</Typography.Paragraph>
                        ) : asset.kind === "video" ? (
                            <>
                                <video src={asset.data.url} controls className="mt-2 aspect-video w-full rounded-md bg-black" />
                                <Typography.Text className="mt-2 block !text-[var(--studio-text-secondary)]">{mediaInfo}</Typography.Text>
                            </>
                        ) : asset.kind === "audio" ? (
                            <>
                                <audio src={asset.data.url} controls className="mt-2 w-full" />
                                <Typography.Text className="mt-2 block !text-[var(--studio-text-secondary)]">{mediaInfo}</Typography.Text>
                            </>
                        ) : (
                            <Typography.Text className="mt-2 block !text-[var(--studio-text-secondary)]">{mediaInfo}</Typography.Text>
                        )}
                    </div>
                    {asset.note ? (
                        <div>
                            <Typography.Text className="!text-[var(--studio-text-secondary)]">备注</Typography.Text>
                            <Typography.Paragraph className="mt-1 !text-[var(--studio-text-primary)]">{asset.note}</Typography.Paragraph>
                        </div>
                    ) : null}
                    {projectLibraryEntries.length ? (
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 text-sm">
                            <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                                项目共享库
                            </Typography.Text>
                            <div className="mt-2 space-y-2">
                                {projectLibraryEntries.map((entry) => (
                                    <div key={entry.projectId} className="rounded-md bg-[var(--studio-elevated-bg)] px-3 py-2">
                                        <div className="font-medium text-[var(--studio-text-primary)]">{projectLibraryProjectTitles?.[entry.projectId] || entry.projectId}</div>
                                        <div className="mt-1 text-sm text-[var(--studio-text-muted)]">
                                            {projectLibraryRoleLabel(entry.role)} · {projectLibrarySyncStatusLabel(entry.syncStatus)}
                                            {entry.remoteAssetId ? ` · 远端素材 ${entry.remoteAssetId}` : ""}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {canvasLibraryEntries.length ? (
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 text-sm">
                            <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                                历史画布引用
                            </Typography.Text>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {canvasLibraryEntries.map((entry) => (
                                    <Tag key={entry.canvasId} className="studio-tag">
                                        {canvasLibraryTitles?.[entry.canvasId] || entry.canvasId}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <AssetVersionHistory asset={asset} versions={versionRecords} usageReferences={usageReferences || []} onDownloadVersion={onDownloadVersion} onRestoreVersion={onRestoreVersion} />
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
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 text-sm">
                            <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                                火山素材
                            </Typography.Text>
                            <Typography.Paragraph copyable className="!mb-0 !mt-2 !text-[var(--studio-text-primary)]">
                                {asset.metadata.volcengineAsset.assetId}
                            </Typography.Paragraph>
                            <Typography.Text className="block text-sm !text-[var(--studio-text-muted)]">
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

function AssetVersionHistory({
    asset,
    versions,
    usageReferences,
    onDownloadVersion,
    onRestoreVersion,
}: {
    asset: Asset;
    versions: AssetVersionRecord[];
    usageReferences: AssetVersionUsageReference[];
    onDownloadVersion: (asset: Asset, versionId: string) => void;
    onRestoreVersion: (asset: Asset, versionId: string) => void;
}) {
    if (!versions.length && !usageReferences.length) return null;
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
                <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                    版本历史
                </Typography.Text>
                <Space size={4} wrap>
                    {versions.length ? <Tag className="studio-tag">{versions.length} 个版本</Tag> : null}
                    {usageReferences.length ? <Tag className="studio-tag">{usageReferences.length} 处引用</Tag> : null}
                </Space>
            </div>
            {versions.length ? (
                <div className="mt-3 space-y-2">
                    {[...versions]
                        .sort((a, b) => b.versionNumber - a.versionNumber)
                        .map((version) => (
                            <div key={version.id} className="flex flex-col gap-2 rounded-md bg-[var(--studio-elevated-bg)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Typography.Text strong className="text-sm !text-[var(--studio-text-primary)]">
                                            v{version.versionNumber}
                                        </Typography.Text>
                                        {version.isCurrent ? <Tag className="studio-tag">当前版本</Tag> : null}
                                        <Typography.Text className="text-sm !text-[var(--studio-text-muted)]">
                                            {version.changeNote || "版本更新"}
                                        </Typography.Text>
                                    </div>
                                    <Typography.Text className="mt-1 block break-words text-sm !text-[var(--studio-text-muted)]">
                                        {assetVersionMediaSummary(version)}
                                        {version.createdAt ? ` · ${version.createdAt}` : ""}
                                    </Typography.Text>
                                </div>
                                <Space size={4} wrap>
                                    {!version.isCurrent ? (
                                        <Button size="middle" icon={<Download className="size-3.5" />} onClick={() => onDownloadVersion(asset, version.id)}>
                                            下载
                                        </Button>
                                    ) : null}
                                    <Button size="middle" icon={<RotateCcw className="size-3.5" />} disabled={version.isCurrent} onClick={() => onRestoreVersion(asset, version.id)}>
                                        恢复
                                    </Button>
                                </Space>
                            </div>
                        ))}
                </div>
            ) : null}
            {usageReferences.length ? (
                <div className="mt-4 border-t border-[var(--studio-border-subtle)] pt-3">
                    <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                        被引用对象
                    </Typography.Text>
                    <div className="mt-2 space-y-2">
                        {usageReferences.map((usage) => (
                            <div key={usage.id} className="rounded-md bg-[var(--studio-elevated-bg)] px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Tag className="studio-tag">{usageKindLabel(usage)}</Tag>
                                    <Typography.Text strong className="min-w-0 text-sm !text-[var(--studio-text-primary)]">
                                        {usage.objectTitle}
                                    </Typography.Text>
                                    {usage.hasNewVersion ? <Tag color="gold">有新版本可用</Tag> : null}
                                </div>
                                <Typography.Text className="mt-1 block break-words text-sm !text-[var(--studio-text-muted)]">
                                    {[usage.projectTitle, usage.contextTitle, usageRoleLabel(usage), usageVersionLabel(usage)].filter(Boolean).join(" · ")}
                                </Typography.Text>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function usageKindLabel(usage: AssetVersionUsageReference) {
    if (usage.kind === "canvas-node") return "画布节点";
    if (usage.kind === "storyboard-shot") return "分镜条目";
    return productionBibleKindLabel(usage.objectType);
}

function usageRoleLabel(usage: AssetVersionUsageReference) {
    if (usage.kind === "canvas-node") return canvasNodeTypeLabel(usage.role || usage.objectType);
    if (usage.kind === "storyboard-shot") return storyboardRefLabel(usage.role || usage.objectType);
    return productionBibleRefLabel(usage.role);
}

function usageVersionLabel(usage: AssetVersionUsageReference) {
    const reference = usage.assetVersion;
    if (!reference) return "未记录版本";
    const version = reference.versionNumber ? `锁定 v${reference.versionNumber}` : reference.assetVersionId ? `锁定 ${reference.assetVersionId}` : "锁定版本";
    return reference.assetUpdatedAt ? `${version}，素材时间 ${reference.assetUpdatedAt}` : version;
}

function canvasNodeTypeLabel(type?: string) {
    if (type === "image") return "图片节点";
    if (type === "video") return "视频节点";
    if (type === "audio") return "音频节点";
    if (type === "text") return "文本节点";
    if (type === "config") return "配置节点";
    return "";
}

function storyboardRefLabel(role?: string) {
    if (role === "reference_audio") return "音频参考";
    if (role === "reference_video") return "视频参考";
    if (role === "source_video") return "源视频";
    if (role === "first_frame") return "首帧";
    if (role === "last_frame") return "尾帧";
    if (role === "reference_image") return "普通参考";
    return role || "";
}

function productionBibleKindLabel(kind?: string) {
    if (kind === "character") return "设定库角色";
    if (kind === "scene") return "设定库场景";
    if (kind === "prop") return "设定库道具";
    return "设定库";
}

function productionBibleRefLabel(role?: string) {
    if (role === "reference") return "参考";
    if (role === "portrait") return "形象";
    if (role === "environment") return "环境";
    if (role === "style") return "风格";
    if (role === "consistency") return "一致性";
    if (role === "negative") return "反向";
    return role || "";
}
