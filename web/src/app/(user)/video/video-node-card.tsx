"use client";

import { Eye, Link2, LoaderCircle, Play, RotateCcw, SendToBack, Settings2, ShieldCheck, TriangleAlert, Upload, Video } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Button, Input, Tag } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { videoRatioLabel, videoResolutionLabel, videoSecondsLabel } from "@/components/video-settings-panel";
import { CanvasVideoSettingsPopover } from "@/app/(user)/canvas/components/canvas-video-settings-popover";
import { cn } from "@/lib/utils";
import { canSubmitVolcengineReview } from "@/services/volcengine-asset-metadata";
import type { Asset } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import { normalizeVideoGenerationErrorMessage } from "./video-generation-errors";
import { resolveWorkflowReferenceAssetForName, workflowReferenceBindingSummary, workflowVideoGenerationReadiness } from "./video-package-builders";
import type { ProductionPackage } from "./use-video-package-store";
import type { PackageAssetSlot, PackageConfigPatch, VideoPreflightState } from "./video-page-types";
import { buildPackageVideoConfig, formatBytes, generationStatusLabel, referenceSlotUploadKey } from "./video-page-utils";
import { GenerationTag, packageConfigPatchFromVideoSetting, readinessStatusTone, SettingSummaryChip, StatusTag, studioSemanticNoticeClass, videoReferenceImageModeLabel, videoTaskModeLabel } from "./video-page-shared-ui";

export function VideoPromptNodeCard({
    assets,
    config,
    item,
    loading,
    onConfigChange,
    onConfirm,
    onGenerate,
    onImportCanvas,
    onOpenDetail,
    onOpenConfig,
    onPreflight,
    onPromptChange,
    onRefreshReview,
    onSelect,
    onSubmitReview,
    onUploadReferenceImage,
    onSync,
    preflight,
    preflightLoading,
    refreshingReviewId,
    selected,
    submittingReviewId,
    uploadingReferenceKey,
    videoProtocol,
}: {
    assets: Asset[];
    config: AiConfig;
    item: ProductionPackage;
    loading: boolean;
    onConfigChange: (patch: PackageConfigPatch) => void;
    onConfirm: () => void;
    onGenerate: () => void;
    onImportCanvas: () => void;
    onOpenDetail: () => void;
    onOpenConfig: () => void;
    onPreflight: () => void;
    onPromptChange: (prompt: string) => void;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSelect: () => void;
    onSubmitReview: (asset: Asset) => Promise<void>;
    onUploadReferenceImage: (item: ProductionPackage, slot: PackageAssetSlot, file: File) => Promise<void>;
    onSync: () => void;
    preflight: VideoPreflightState | null;
    preflightLoading: boolean;
    refreshingReviewId: string | null;
    selected: boolean;
    submittingReviewId: string | null;
    uploadingReferenceKey: string;
    videoProtocol?: string;
}) {
    const summary = workflowReferenceBindingSummary(item, assets);
    const readiness = workflowVideoGenerationReadiness(item, assets, videoProtocol);
    const showCanvasAction = item.generation?.status === "succeeded" || item.canvasStatus === "已生成";
    return (
        <article
            className={cn(
                "grid gap-4 rounded-md border bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)] transition hover:border-[var(--studio-border-strong)] xl:grid-cols-[minmax(0,1fr)_260px]",
                selected ? "border-[var(--studio-accent)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)]",
            )}
            onClick={onSelect}
        >
            <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] px-2 py-1 text-sm font-semibold text-[var(--studio-accent)]">{item.id}</span>
                            <span className="text-sm text-[var(--studio-text-muted)]">{item.duration}</span>
                            <StatusTag label={item.promptStatus} />
                            <StatusTag label={item.assetStatus} />
                            <GenerationTag status={item.generation?.status} />
                            {item.generationVersions?.length ? (
                                <Tag className="m-0 rounded border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-1.5 py-0 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.generationVersions.length} 版</Tag>
                            ) : null}
                        </div>
                        <h2 className="mt-2 break-words text-lg font-semibold leading-7 text-[var(--studio-text-primary)]">{item.segment}</h2>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        {item.promptStatus !== "已确认" ? (
                            <Button
                                size="small"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onConfirm();
                                }}
                            >
                                确认
                            </Button>
                        ) : null}
                        <Button
                            size="small"
                            icon={<Eye className="size-3.5" />}
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenDetail();
                            }}
                        >
                            详情
                        </Button>
                    </div>
                </div>

                <InlineAssetSlots
                    assets={assets}
                    item={item}
                    onRefreshReview={onRefreshReview}
                    onSubmitReview={onSubmitReview}
                    onUploadReferenceImage={onUploadReferenceImage}
                    refreshingReviewId={refreshingReviewId}
                    submittingReviewId={submittingReviewId}
                    uploadingReferenceKey={uploadingReferenceKey}
                />

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">提示词</div>
                            <span className="text-xs text-[var(--studio-text-muted)]">提示词和上方资产槽一一对照</span>
                        </div>
                        <PromptTextAreaWithReferencePreview assets={assets} item={item} value={item.prompt} onChange={onPromptChange} onClick={(event) => event.stopPropagation()} />
                    </div>
                    <VideoNodeSettings baseConfig={config} item={item} onChange={onConfigChange} onOpenConfig={onOpenConfig} />
                </div>

                <div className={cn("rounded-md border px-3 py-2 text-sm leading-6", studioSemanticNoticeClass(readinessStatusTone(readiness.status)))}>
                    参考资产 {summary.bound}/{summary.total || item.assets.length}：{readiness.message}
                </div>
            </div>

            <VideoNodeOutput
                config={config}
                item={item}
                loading={loading}
                onGenerate={onGenerate}
                onImportCanvas={onImportCanvas}
                onOpenConfig={onOpenConfig}
                onOpenDetail={onOpenDetail}
                onPreflight={onPreflight}
                onSync={onSync}
                preflight={preflight}
                preflightLoading={preflightLoading}
                showCanvasAction={showCanvasAction}
            />
        </article>
    );
}

function InlineAssetSlots({
    assets,
    item,
    onRefreshReview,
    onSubmitReview,
    onUploadReferenceImage,
    refreshingReviewId,
    submittingReviewId,
    uploadingReferenceKey,
}: {
    assets: Asset[];
    item: ProductionPackage;
    onRefreshReview: (asset: Asset, options?: { silent?: boolean; showProgress?: boolean }) => Promise<void>;
    onSubmitReview: (asset: Asset) => Promise<void>;
    onUploadReferenceImage: (item: ProductionPackage, slot: PackageAssetSlot, file: File) => Promise<void>;
    refreshingReviewId: string | null;
    submittingReviewId: string | null;
    uploadingReferenceKey: string;
}) {
    const slots = item.assets.length ? item.assets : [{ kind: "场景图" as const, name: "未声明参考资产", status: "缺失" as const }];
    return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {slots.map((slot) => {
                const boundAsset = resolveWorkflowReferenceAssetForName(item, slot.name, assets);
                const bound = boundAsset?.kind === "image";
                const canReview = boundAsset && (boundAsset.kind === "image" || boundAsset.kind === "video" || boundAsset.kind === "audio");
                const shouldSubmitReview = canReview ? canSubmitVolcengineReview(boundAsset.metadata?.volcengineAsset) : false;
                const uploadKey = referenceSlotUploadKey(item.id, slot.name);
                const uploading = uploadingReferenceKey === uploadKey;
                return (
                    <div key={slot.name} className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]">
                        <div className="grid grid-cols-[72px_minmax(0,1fr)]">
                            <div className="aspect-square bg-[var(--studio-control-bg)]">
                                {boundAsset?.kind === "image" ? (
                                    <img alt={boundAsset.title} className="h-full w-full object-cover" src={boundAsset.data.dataUrl} />
                                ) : (
                                    <div className="grid h-full place-items-center text-[var(--studio-text-muted)]">
                                        <Link2 className="size-5" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 p-2">
                                <div className="overflow-hidden text-sm leading-5 font-medium break-words text-[var(--studio-text-primary)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" title={slot.name}>
                                    {slot.name}
                                </div>
                                {boundAsset?.title && boundAsset.title !== slot.name ? <div className="mt-0.5 truncate text-[11px] text-[var(--studio-text-muted)]">已绑定：{boundAsset.title}</div> : null}
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <span className="rounded border border-[var(--studio-border-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--studio-text-secondary)]">{slot.kind}</span>
                                    <StatusTag label={bound ? "完整" : "缺参考"} />
                                </div>
                                {boundAsset?.kind === "image" && boundAsset.metadata?.volcengineAsset?.status ? (
                                    <div className="mt-1 truncate text-[11px] text-[var(--studio-text-muted)]">加白：{String(boundAsset.metadata.volcengineAsset.status)}</div>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 border-t border-[var(--studio-border-subtle)] px-2 py-1.5">
                            <label
                                className={cn(
                                    "inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-2 text-xs leading-6 text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]",
                                    uploading && "pointer-events-none opacity-60",
                                )}
                                onClick={(event) => event.stopPropagation()}
                            >
                                {uploading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                                <span>{uploading ? "上传中" : bound ? "替换" : "上传"}</span>
                                <input
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploading}
                                    type="file"
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => {
                                        const file = event.currentTarget.files?.[0];
                                        event.currentTarget.value = "";
                                        if (file) void onUploadReferenceImage(item, slot, file);
                                    }}
                                />
                            </label>
                            {!bound ? (
                                <Button size="small" href="/assets">
                                    素材库
                                </Button>
                            ) : null}
                            {canReview ? (
                                shouldSubmitReview ? (
                                    <Button size="small" loading={submittingReviewId === boundAsset.id} onClick={() => void onSubmitReview(boundAsset)}>
                                        加白
                                    </Button>
                                ) : (
                                    <Button size="small" loading={refreshingReviewId === boundAsset.id} onClick={() => void onRefreshReview(boundAsset, { showProgress: true })}>
                                        刷新
                                    </Button>
                                )
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function PromptTextAreaWithReferencePreview({
    assets,
    item,
    onChange,
    onClick,
    value,
}: {
    assets: Asset[];
    item: ProductionPackage;
    onChange: (value: string) => void;
    onClick?: (event: MouseEvent<HTMLTextAreaElement>) => void;
    value: string;
}) {
    const [activeRef, setActiveRef] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const updateActiveRef = (textarea: HTMLTextAreaElement) => setActiveRef(promptReferenceAtCursor(textarea.value, textarea.selectionStart || 0));
    return (
        <div className="relative">
            <Input.TextArea
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                    updateActiveRef(event.currentTarget);
                }}
                onClick={(event) => {
                    onClick?.(event);
                    updateActiveRef(event.currentTarget);
                }}
                onFocus={(event) => {
                    setIsFocused(true);
                    updateActiveRef(event.currentTarget);
                }}
                onBlur={() => setIsFocused(false)}
                onKeyUp={(event) => updateActiveRef(event.currentTarget)}
                onSelect={(event) => updateActiveRef(event.currentTarget)}
                autoSize={{ minRows: 7, maxRows: 14 }}
                className="!rounded-md !border-[var(--studio-border-subtle)] !bg-[var(--studio-control-bg)] !text-sm !leading-6 !text-[var(--studio-text-primary)] placeholder:!text-[var(--studio-text-muted)]"
                style={{ paddingBottom: isFocused && item.assets.length ? 74 : undefined }}
            />
            {isFocused && item.assets.length ? (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex gap-1.5 overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-1.5 shadow-[var(--studio-shadow)] backdrop-blur">
                    {item.assets.map((slot) => {
                        const ref = slotReferenceRef(slot.name);
                        const boundAsset = resolveWorkflowReferenceAssetForName(item, slot.name, assets);
                        const previewUrl = assetPreviewUrl(boundAsset);
                        const active = activeRef === ref;
                        return (
                            <div
                                key={slot.name}
                                className={cn(
                                    "grid w-[118px] shrink-0 grid-cols-[34px_minmax(0,1fr)] gap-1.5 rounded border p-1",
                                    active ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]",
                                )}
                            >
                                <div className="grid size-[34px] place-items-center overflow-hidden rounded bg-[var(--studio-control-bg)]">
                                    {previewUrl ? <img src={previewUrl} alt={slot.name} className="h-full w-full object-cover" /> : <Link2 className="size-4 text-[var(--studio-warning)]" />}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-[11px] font-semibold text-[var(--studio-text-primary)]" title={slot.name}>
                                        {slot.name}
                                    </div>
                                    <div className={cn("truncate text-[10px]", boundAsset ? "text-[var(--studio-text-muted)]" : "text-[var(--studio-warning)]")} title={boundAsset?.title || "缺参考"}>
                                        {boundAsset?.title || "缺参考"}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function promptReferenceAtCursor(prompt: string, cursor: number) {
    for (const match of prompt.matchAll(/@图\s*(\d+)/g)) {
        const start = match.index || 0;
        const end = promptReferenceMentionEnd(prompt, start + match[0].length);
        if (cursor >= start && cursor <= end) return `@图${Number(match[1])}`;
    }
    return "";
}

function slotReferenceRef(slotName: string) {
    const match = slotName.match(/@图\s*(\d+)/);
    return match ? `@图${Number(match[1])}` : "";
}

function promptReferenceMentionEnd(prompt: string, start: number) {
    const next = prompt.slice(start).search(/[、，。；;\n]/);
    return next < 0 ? Math.min(prompt.length, start + 24) : start + next;
}

function assetPreviewUrl(asset?: Asset | null) {
    if (!asset) return "";
    if (asset.kind === "image") return asset.coverUrl || asset.data.dataUrl;
    if (asset.kind === "video" || asset.kind === "audio") return asset.coverUrl || asset.data.url;
    return "";
}

function VideoNodeSettings({ baseConfig, item, onChange, onOpenConfig }: { baseConfig: AiConfig; item: ProductionPackage; onChange: (patch: PackageConfigPatch) => void; onOpenConfig: () => void }) {
    const config = buildPackageVideoConfig(baseConfig, item);
    const visibleModel = item.config.model || config.seedanceModel || config.videoModel || config.model;
    return (
        <div className="space-y-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3" onClick={(event) => event.stopPropagation()}>
            <div>
                <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">视频节点设置</div>
                <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">与画布视频配置节点使用同一套参数。</div>
            </div>
            <ModelPicker
                className="canvas-compact-control !h-8 !w-full !justify-start !rounded-md !border-[var(--studio-border-subtle)] !bg-[var(--studio-control-bg)] !px-2 !text-xs !text-[var(--studio-text-primary)]"
                config={config}
                fullWidth
                modelType="video"
                value={visibleModel}
                onChange={(model) => onChange({ model })}
                onMissingConfig={onOpenConfig}
            />
            <CanvasVideoSettingsPopover
                buttonClassName="canvas-compact-control !h-8 !w-full !justify-start !rounded-md !border-[var(--studio-border-subtle)] !bg-[var(--studio-control-bg)] !px-2 !text-xs !text-[var(--studio-text-primary)]"
                config={config}
                hasSourceVideo={false}
                placement="bottomRight"
                showTaskMode
                onConfigChange={(key, value) => onChange(packageConfigPatchFromVideoSetting(key, value))}
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
                <SettingSummaryChip label="生成方式" value={videoTaskModeLabel(config.videoTaskMode)} />
                <SettingSummaryChip label="图片控制" value={videoReferenceImageModeLabel(config.videoReferenceImageMode)} />
                <SettingSummaryChip label="生成音频" value={config.videoGenerateAudio === "true" ? "开" : "关"} />
                <SettingSummaryChip label="水印" value={config.videoWatermark === "true" ? "开" : "关"} />
            </div>
        </div>
    );
}

function VideoNodeOutput({
    config,
    item,
    loading,
    onGenerate,
    onImportCanvas,
    onOpenConfig,
    onOpenDetail,
    onPreflight,
    onSync,
    preflight,
    preflightLoading,
    showCanvasAction,
}: {
    config: AiConfig;
    item: ProductionPackage;
    loading: boolean;
    onGenerate: () => void;
    onImportCanvas: () => void;
    onOpenConfig: () => void;
    onOpenDetail: () => void;
    onPreflight: () => void;
    onSync: () => void;
    preflight: VideoPreflightState | null;
    preflightLoading: boolean;
    showCanvasAction: boolean;
}) {
    const video = item.generation?.video;
    const nodeConfig = buildPackageVideoConfig(config, item);
    const generationError = item.generation?.status === "failed" ? normalizeVideoGenerationErrorMessage(item.generation.errorMessage || "视频生成失败，请打开详情查看原因。") : "";
    return (
        <aside className="studio-section flex min-w-0 flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">生成结果</div>
                    <div className="mt-1 text-sm text-[var(--studio-text-secondary)]">{generationStatusLabel(item.generation?.status)}</div>
                </div>
                <GenerationTag status={item.generation?.status} />
            </div>
            {video?.url ? (
                <button type="button" className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-left transition hover:border-[var(--studio-border-strong)]" onClick={onOpenDetail}>
                    <video className="aspect-video w-full bg-black object-contain" src={video.url} />
                    <div className="px-3 py-2 text-xs text-[var(--studio-text-secondary)]">点击查看详情 · {formatBytes(video.bytes)}</div>
                </button>
            ) : (
                <div className="grid aspect-video place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-center text-sm text-[var(--studio-text-muted)]">
                    {loading ? <LoaderCircle className="size-6 animate-spin text-[var(--studio-accent)]" /> : <Video className="size-6" />}
                </div>
            )}
            <div className="grid gap-2">
                <Button type="primary" icon={<Play className="size-4" />} loading={loading} onClick={onGenerate}>
                    {item.generation?.status === "succeeded" ? "生成新版本" : "生成视频"}
                </Button>
                {item.generation?.taskId && item.generation.status !== "succeeded" ? (
                    <Button icon={<RotateCcw className="size-4" />} loading={loading} onClick={onSync}>
                        同步任务结果
                    </Button>
                ) : null}
                <Button icon={<ShieldCheck className="size-4" />} loading={preflightLoading} onClick={onPreflight}>
                    预检企业 API
                </Button>
                {showCanvasAction ? (
                    <Button icon={<SendToBack className="size-4" />} onClick={onImportCanvas}>
                        承接到画布
                    </Button>
                ) : null}
                <Button icon={<Settings2 className="size-4" />} onClick={onOpenConfig}>
                    视频通道配置
                </Button>
            </div>
            <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-3 py-2 text-xs leading-5 text-[var(--studio-text-secondary)]">
                {nodeConfig.videoProtocol === "volcengine-ark" ? "企业 Ark / Seedance" : "未切到企业 Ark"} · {videoRatioLabel(nodeConfig.size)} · {videoSecondsLabel(nodeConfig.videoSeconds, nodeConfig)} · {videoResolutionLabel(nodeConfig.vquality)}
            </div>
            {preflight ? <div className={cn("rounded-md border px-3 py-2 text-xs leading-5", studioSemanticNoticeClass(preflight.status === "passed" ? "success" : "warning"))}>{preflight.message}</div> : null}
            {generationError ? (
                <div className={cn("rounded-md border px-3 py-2 text-xs leading-5", studioSemanticNoticeClass("danger"))}>
                    <div className="mb-1 flex items-center gap-1.5 font-medium">
                        <TriangleAlert className="size-3.5" />
                        生成失败
                    </div>
                    <div>{generationError}</div>
                    <button type="button" className="mt-2 text-[var(--studio-accent)] transition hover:text-[var(--studio-text-primary)]" onClick={onOpenDetail}>
                        查看详情
                    </button>
                </div>
            ) : null}
        </aside>
    );
}
