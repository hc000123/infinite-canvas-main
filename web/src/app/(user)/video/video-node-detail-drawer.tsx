"use client";

import { Check, Download, Link2, LoaderCircle, Play, RefreshCw, RotateCcw, Settings2, ShieldCheck, TriangleAlert, Video } from "lucide-react";
import { Button, Collapse, Drawer } from "antd";

import { videoRatioLabel, videoResolutionLabel, videoSecondsLabel } from "@/components/video-settings-panel";
import { seedanceMediaReviewBlockingError } from "@/app/(user)/canvas/utils/canvas-volcengine-review-diagnostics";
import { cn } from "@/lib/utils";
import { canSubmitVolcengineReview } from "@/services/volcengine-asset-metadata";
import type { Asset } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import { isVideoChannelAuthError, isVideoChannelUpstreamError, normalizeVideoGenerationErrorMessage, sanitizeVideoGenerationErrorMessage } from "./video-generation-errors";
import { isWorkflowReferenceAssetBound, resolveWorkflowReferenceAssetForName, resolveWorkflowReferenceImages, workflowReferenceBindingSummary, workflowVideoGenerationReadiness } from "./video-package-builders";
import type { ProductionPackage } from "./use-video-package-store";
import type { VideoPreflightState } from "./video-page-types";
import { buildPackageVideoConfig, formatBytes, generationStatusLabel, resolvePackageVideoModel } from "./video-page-utils";
import { readinessStatusTone, StatusTag, studioSemanticNoticeClass, videoReferenceImageModeLabel, videoTaskModeLabel } from "./video-page-shared-ui";

export function VideoNodeDetailDrawer({
    assets,
    config,
    item,
    loading,
    onClose,
    onGenerate,
    onOpenConfig,
    onPreflight,
    onRefreshReview,
    onSubmitReview,
    onSync,
    open,
    preflight,
    preflightLoading,
    refreshingReviewId,
    submittingReviewId,
    videoProtocol,
}: {
    assets: Asset[];
    config: AiConfig;
    item: ProductionPackage | null;
    loading: boolean;
    onClose: () => void;
    onGenerate: (item: ProductionPackage) => void;
    onOpenConfig: () => void;
    onPreflight: (item: ProductionPackage) => void;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSubmitReview: (asset: Asset) => Promise<void>;
    onSync: (item: ProductionPackage) => void;
    open: boolean;
    preflight: VideoPreflightState | null;
    preflightLoading: boolean;
    refreshingReviewId: string | null;
    submittingReviewId: string | null;
    videoProtocol?: string;
}) {
    if (!item) return null;
    return (
        <Drawer rootClassName="studio-modal" size={620} title={`${item.id} · 视频节点详情`} open={open} onClose={onClose}>
            <div className="space-y-4 text-[var(--studio-text-primary)]">
                <GenerationDetail item={item} loading={loading} onGenerate={() => onGenerate(item)} onOpenConfig={onOpenConfig} onSync={() => onSync(item)} />
                <Collapse
                    className="video-detail-collapse"
                    ghost
                    items={[
                        {
                            key: "prompt",
                            label: <span className="text-sm font-medium text-[var(--studio-text-primary)]">生成使用的提示词</span>,
                            children: <PromptDetailText prompt={item.prompt} />,
                        },
                        {
                            key: "assets",
                            label: <span className="text-sm font-medium text-[var(--studio-text-primary)]">参考图与加白状态</span>,
                            children: (
                                <AssetDetail assets={assets} item={item} onRefreshReview={onRefreshReview} onSubmitReview={onSubmitReview} refreshingReviewId={refreshingReviewId} submittingReviewId={submittingReviewId} videoProtocol={videoProtocol} />
                            ),
                        },
                        {
                            key: "config",
                            label: <span className="text-sm font-medium text-[var(--studio-text-primary)]">视频通道与参数</span>,
                            children: <ConfigDetail config={config} item={item} loading={preflightLoading} preflight={preflight} onPreflight={() => onPreflight(item)} />,
                        },
                    ]}
                />
            </div>
        </Drawer>
    );
}

function PromptDetailText({ prompt }: { prompt: string }) {
    return <div className="thin-scrollbar max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-3 py-2 text-sm leading-6 text-[var(--studio-text-primary)]">{prompt}</div>;
}

function AssetDetail({
    assets,
    item,
    videoProtocol,
    onRefreshReview,
    onSubmitReview,
    refreshingReviewId,
    submittingReviewId,
}: {
    assets: Asset[];
    item: ProductionPackage;
    videoProtocol?: string;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSubmitReview: (asset: Asset) => Promise<void>;
    refreshingReviewId: string | null;
    submittingReviewId: string | null;
}) {
    const summary = workflowReferenceBindingSummary(item, assets);
    const referenceImages = resolveWorkflowReferenceImages(item, assets);
    const reviewNotice = seedanceMediaReviewBlockingError(referenceImages, []);
    const readiness = workflowVideoGenerationReadiness(item, assets, videoProtocol);
    return (
        <div className="space-y-3 pb-4">
            {item.workflowReferences?.length ? (
                <div className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] px-3 py-2 text-sm text-[var(--studio-text-primary)]">
                    已匹配参考图 {summary.bound}/{summary.total}。已生图的视频工作流素材会随视频请求一起提交；缺失项仍按提示词文字生成。
                </div>
            ) : null}
            <div className={cn("rounded-md border px-3 py-2 text-sm leading-6", studioSemanticNoticeClass(readinessStatusTone(readiness.status)))}>{readiness.message}</div>
            {reviewNotice ? <div className={cn("rounded-md border px-3 py-2 text-sm leading-6", studioSemanticNoticeClass("warning"))}>{reviewNotice}</div> : null}
            {item.assets.map((asset) => {
                const bound = isWorkflowReferenceAssetBound(item, asset.name, assets);
                const boundAsset = resolveWorkflowReferenceAssetForName(item, asset.name, assets);
                const status = bound ? "已绑定" : asset.status;
                const image = resolveWorkflowReferenceImages({ ...item, prompt: asset.name, workflowReferences: item.workflowReferences }, assets)[0];
                const canReview = boundAsset && (boundAsset.kind === "image" || boundAsset.kind === "video" || boundAsset.kind === "audio");
                const shouldSubmitReview = canReview ? canSubmitVolcengineReview(boundAsset.metadata?.volcengineAsset) : false;
                return (
                    <div
                        key={asset.name}
                        className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2.5 text-sm transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]"
                    >
                        <span className="text-[var(--studio-text-muted)]">{asset.kind}</span>
                        <div className="min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className={cn("truncate", status === "缺失" ? "text-[var(--studio-warning)]" : "text-[var(--studio-text-primary)]")}>{asset.name}</span>
                                <StatusTag label={status === "缺失" ? "缺参考" : "完整"} />
                            </div>
                            {status === "缺失" ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button size="small" icon={<Link2 className="size-3.5" />}>
                                        去资产库绑定
                                    </Button>
                                    <Button size="small" icon={<Play className="size-3.5" />}>
                                        生成参考图
                                    </Button>
                                </div>
                            ) : null}
                            {image?.volcengineAssetStatus ? (
                                <div className={cn("mt-2 text-xs", image.assetUri ? "text-[var(--studio-success)]" : "text-[var(--studio-warning)]")}>
                                    火山加白：{image.volcengineAssetStatus}
                                    {image.assetUri ? "，生成时将使用 asset:// 参考图" : "，需刷新到 Active 后再生成"}
                                </div>
                            ) : null}
                            {canReview ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {shouldSubmitReview ? (
                                        <Button size="small" icon={<ShieldCheck className="size-3.5" />} loading={submittingReviewId === boundAsset.id} onClick={() => void onSubmitReview(boundAsset)}>
                                            提交加白
                                        </Button>
                                    ) : (
                                        <Button
                                            size="small"
                                            icon={<RefreshCw className={cn("size-3.5", refreshingReviewId === boundAsset.id && "animate-spin")} />}
                                            loading={refreshingReviewId === boundAsset.id}
                                            onClick={() => void onRefreshReview(boundAsset, { showProgress: true })}
                                        >
                                            刷新加白
                                        </Button>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                );
            })}
            {!item.assets.length ? <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-6 text-center text-sm text-[var(--studio-text-muted)]">当前生产包未声明参考资产。</div> : null}
        </div>
    );
}

function ConfigDetail({ config, item, loading, onPreflight, preflight }: { config: AiConfig; item: ProductionPackage; loading: boolean; onPreflight: () => void; preflight: VideoPreflightState | null }) {
    const nodeConfig = buildPackageVideoConfig(config, item);
    const channelLabel = nodeConfig.videoProtocol === "volcengine-ark" ? "企业 Ark / Seedance" : "未切到企业 Ark";
    const actualModel = resolvePackageVideoModel(nodeConfig);
    const entries = [
        ["实际通道", channelLabel],
        ["实际模型", actualModel || "未配置"],
        ["生成方式", videoTaskModeLabel(nodeConfig.videoTaskMode)],
        ["比例", videoRatioLabel(nodeConfig.size)],
        ["时长", videoSecondsLabel(nodeConfig.videoSeconds, nodeConfig)],
        ["清晰度", videoResolutionLabel(nodeConfig.vquality)],
        ["图片控制", videoReferenceImageModeLabel(nodeConfig.videoReferenceImageMode)],
        ["生成音频", nodeConfig.videoGenerateAudio === "true" ? "开启" : "关闭"],
        ["水印", nodeConfig.videoWatermark === "true" ? "开启" : "关闭"],
        ["seed", nodeConfig.videoSeed || "随机"],
    ];

    return (
        <div className="space-y-3 pb-4">
            <div className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] px-3 py-2 text-sm text-[var(--studio-text-primary)]">
                生成会调用当前全局 AI 设置里的真实视频通道；企业 Ark 模型和 EP 绑定在后台系统设置维护。
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                <div>
                    <div className="text-sm font-medium text-[var(--studio-text-primary)]">企业视频通道预检</div>
                    <div className="mt-1 text-xs text-[var(--studio-text-muted)]">只验证企业 API Key、模型和 EP 绑定，不创建视频任务。</div>
                </div>
                <Button loading={loading} icon={<ShieldCheck className="size-4" />} onClick={onPreflight}>
                    预检企业 API
                </Button>
            </div>
            {preflight ? (
                <div className={cn("rounded-md border px-3 py-2 text-sm", studioSemanticNoticeClass(preflight.status === "passed" ? "success" : "warning"))}>
                    <div className="flex items-center gap-2 font-medium">
                        {preflight.status === "passed" ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
                        {preflight.status === "passed" ? "预检通过" : "预检失败"}
                    </div>
                    <div className="mt-1 leading-6 opacity-85">{preflight.message}</div>
                    {preflight.status === "failed" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="small" icon={<Settings2 className="size-3.5" />} href="/admin/settings?focus=enterprise-video">
                                后台系统设置
                            </Button>
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={onPreflight}>
                                重新预检
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
                {entries.map(([label, value]) => (
                    <div key={label} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                        <div className="text-xs text-[var(--studio-text-muted)]">{label}</div>
                        <div className="mt-1 text-sm text-[var(--studio-text-primary)]">{value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GenerationDetail({ item, loading, onGenerate, onOpenConfig, onSync }: { item: ProductionPackage; loading: boolean; onGenerate: () => void; onOpenConfig: () => void; onSync: () => void }) {
    const generation = item.generation;
    const video = generation?.video;
    const rawError = generation?.errorMessage || "";
    const cleanError = sanitizeVideoGenerationErrorMessage(rawError);
    const displayError = rawError ? normalizeVideoGenerationErrorMessage(rawError) : "";
    const authError = isVideoChannelAuthError(cleanError);
    const upstreamError = !authError && isVideoChannelUpstreamError(cleanError);
    return (
        <div className="thin-scrollbar max-h-[calc(100vh-250px)] space-y-4 overflow-y-auto pb-4">
            {video?.url ? (
                <div className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)]">
                    <video className="aspect-video w-full bg-black object-contain" src={video.url} controls />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--studio-border-subtle)] px-3 py-2 text-xs text-[var(--studio-text-secondary)]">
                        <span>
                            {video.width}x{video.height} · {formatBytes(video.bytes)}
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className="inline-flex items-center gap-1 text-[var(--studio-accent)] transition hover:text-[var(--studio-text-primary)]" onClick={onGenerate}>
                                <Play className="size-3.5" />
                                生成新版本
                            </button>
                            <a className="inline-flex items-center gap-1 text-[var(--studio-accent)] transition hover:text-[var(--studio-text-primary)]" href={video.url} download={`${item.id}.mp4`}>
                                <Download className="size-3.5" />
                                下载视频
                            </a>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-4 py-12 text-center">
                    {loading ? <LoaderCircle className="mb-3 size-7 animate-spin text-[var(--studio-accent)]" /> : <Video className="mb-3 size-7 text-[var(--studio-text-muted)]" />}
                    <div className="text-sm font-medium text-[var(--studio-text-primary)]">{loading ? "正在生成视频" : "还没有生成视频"}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">会调用真实视频接口，任务完成后自动保存到资产。</div>
                    <Button className="mt-4" type="primary" loading={loading} icon={<Play className="size-4" />} onClick={onGenerate}>
                        生成视频
                    </Button>
                    {generation?.taskId ? (
                        <Button className="mt-2" loading={loading} icon={<RotateCcw className="size-4" />} onClick={onSync}>
                            同步任务结果
                        </Button>
                    ) : null}
                </div>
            )}
            <div className="grid gap-2 text-sm">
                <InfoRow label="任务状态" value={generationStatusLabel(generation?.status)} />
                <InfoRow label="任务 ID" value={generation?.taskId || "-"} />
                <InfoRow label="上游状态" value={generation?.taskStatus || "-"} />
                <InfoRow label="素材 ID" value={generation?.assetId || "-"} />
                <InfoRow label="消耗额度" value={generation?.aiTaskCredits === undefined ? "-" : String(generation.aiTaskCredits)} />
                {displayError ? <InfoRow danger label="错误" value={displayError} /> : null}
            </div>
            {authError ? (
                <div className={cn("rounded-lg border p-3 text-sm", studioSemanticNoticeClass("warning"))}>
                    <div className="font-medium">视频通道认证失败</div>
                    <div className="mt-1 leading-6 opacity-80">当前生产包已经正确进入真实视频接口，但企业 Ark API Key 不存在、已失效，或 EP 绑定不可用。请到后台系统设置更新企业视频通道密钥后重试。</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="small" icon={<Settings2 className="size-3.5" />} onClick={onOpenConfig}>
                            打开配置
                        </Button>
                        <Button size="small" href="/admin/settings">
                            后台系统设置
                        </Button>
                    </div>
                </div>
            ) : null}
            {upstreamError ? (
                <div className={cn("rounded-lg border p-3 text-sm", studioSemanticNoticeClass("warning"))}>
                    <div className="font-medium">视频上游提交失败</div>
                    <div className="mt-1 leading-6 opacity-80">请求已进入真实视频通道，但供应商上游拒绝创建任务。通常是企业 API Key / EP 绑定不可用、账号未开通视频模型，或模型路由不可用；请在后台系统设置更新已确认可用的视频通道后重试。</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="small" icon={<Settings2 className="size-3.5" />} onClick={onOpenConfig}>
                            打开配置
                        </Button>
                        <Button size="small" href="/admin/settings">
                            后台系统设置
                        </Button>
                    </div>
                </div>
            ) : null}
            {generation?.assetId ? (
                <div className={cn("rounded-lg border p-3 text-sm", studioSemanticNoticeClass("success"))}>
                    <div className="font-medium">素材已归档</div>
                    <div className="mt-1 leading-6 opacity-80">本次视频已写入“资产”，同编号再次生成会保留旧视频版本。</div>
                    <Button className="mt-3" size="small" href={`/assets?kind=video&assetId=${encodeURIComponent(generation.assetId)}`}>
                        打开素材
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function InfoRow({ danger, label, value }: { danger?: boolean; label: string; value: string }) {
    return (
        <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
            <span className="text-[var(--studio-text-muted)]">{label}</span>
            <span className={cn("break-all", danger ? "text-[var(--studio-danger)]" : "text-[var(--studio-text-primary)]")}>{value}</span>
        </div>
    );
}
