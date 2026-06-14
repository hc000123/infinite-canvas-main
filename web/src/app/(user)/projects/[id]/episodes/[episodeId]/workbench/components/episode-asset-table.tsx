"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, ShieldCheck, SlidersHorizontal, Upload, WandSparkles } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { EpisodeStatusPill } from "./episode-module-panel";
import type { EpisodeAssetImageGenerationOptions, EpisodeAssetProcessMode, EpisodeAssetRow } from "./episode-assets-module-types";
import { episodeAssetImagePreset, episodeAssetImagePresetOptions } from "../episode-asset-image-presets";

export function EpisodeAssetTable({
    assets,
    generatingAssetIds,
    onGenerateImage,
    onOpenProcess,
    onPreviewAsset,
    onReviewAsset,
    onUploadImage,
    reviewingAssetIds,
    selectedAssetId,
}: {
    assets: EpisodeAssetRow[];
    generatingAssetIds: Record<string, boolean>;
    onGenerateImage: (asset: EpisodeAssetRow, options?: EpisodeAssetImageGenerationOptions) => Promise<string[]>;
    onOpenProcess: (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => void;
    onPreviewAsset: (asset: Asset) => void;
    onReviewAsset: (asset: EpisodeAssetRow) => Promise<void>;
    onUploadImage: (asset: EpisodeAssetRow, file: File) => Promise<void>;
    reviewingAssetIds: Record<string, boolean>;
    selectedAssetId: string;
}) {
    if (!assets.length) {
        return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的资产。</div>;
    }
    return (
        <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
            {assets.map((asset) => (
                <EpisodeAssetCard
                    key={asset.id}
                    asset={asset}
                    generating={Boolean(generatingAssetIds[asset.id])}
                    onGenerateImage={onGenerateImage}
                    onOpenProcess={onOpenProcess}
                    onPreviewAsset={onPreviewAsset}
                    onReviewAsset={onReviewAsset}
                    onUploadImage={onUploadImage}
                    reviewing={Boolean(reviewingAssetIds[asset.id])}
                    selected={asset.id === selectedAssetId}
                />
            ))}
        </div>
    );
}

function EpisodeAssetCard({
    asset,
    generating,
    onGenerateImage,
    onOpenProcess,
    onPreviewAsset,
    onReviewAsset,
    onUploadImage,
    reviewing,
    selected,
}: {
    asset: EpisodeAssetRow;
    generating: boolean;
    onGenerateImage: (asset: EpisodeAssetRow, options?: EpisodeAssetImageGenerationOptions) => Promise<string[]>;
    onOpenProcess: (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => void;
    onPreviewAsset: (asset: Asset) => void;
    onReviewAsset: (asset: EpisodeAssetRow) => Promise<void>;
    onUploadImage: (asset: EpisodeAssetRow, file: File) => Promise<void>;
    reviewing: boolean;
    selected: boolean;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const coverAsset = asset.previewAsset;
    const coverUrl = coverAsset?.kind === "image" ? coverAsset.coverUrl || coverAsset.data.dataUrl : "";
    const review = coverAsset?.metadata?.volcengineAsset;
    const reviewText = reviewActionText(review?.status, Boolean(review?.assetId), Boolean(coverAsset));
    const reviewReady = Boolean(coverAsset && (coverAsset.kind === "image" || coverAsset.kind === "video" || coverAsset.kind === "audio"));
    const candidateImageCount = asset.candidates.filter((item) => item.kind === "image").length;
    const preset = episodeAssetImagePreset(asset.type);
    const sizeOptions = episodeAssetImagePresetOptions(asset.type);
    const [generationSize, setGenerationSize] = useState(preset.size);
    const selectedSizeOption = sizeOptions.find((item) => item.value === generationSize) || sizeOptions[0];
    const actualImageSize = coverAsset?.kind === "image" && coverAsset.data.width && coverAsset.data.height ? `${coverAsset.data.width}x${coverAsset.data.height}` : "";
    const coverAspectRatio = coverAsset?.kind === "image" && coverAsset.data.width && coverAsset.data.height ? `${coverAsset.data.width} / ${coverAsset.data.height}` : imageAspectRatio(generationSize || preset.size);

    useEffect(() => {
        setGenerationSize(preset.size);
    }, [asset.id, preset.size]);

    const uploadSelectedFile = async (file?: File) => {
        if (!file) return;
        setUploading(true);
        try {
            await onUploadImage(asset, file);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <article className={`group overflow-hidden rounded-lg border bg-white/[0.025] transition ${selected ? "border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.22)]" : "border-white/[0.07] hover:border-cyan-400/40"}`}>
            <div className="relative">
                <button type="button" className="block w-full text-left" onClick={() => onOpenProcess(asset, asset.status === "已绑定" || asset.libraryMatchCount ? "bind" : "generate")}>
                    <div className="relative bg-[#05080d]" style={{ aspectRatio: coverAspectRatio }}>
                        {coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={coverUrl} alt={asset.name} className="size-full object-contain" />
                        ) : (
                            <div className="flex size-full flex-col items-center justify-center gap-2 border-b border-white/[0.07] bg-[#05080d] text-slate-500">
                                <ImageIcon className="size-9 text-slate-600" />
                                <span className="text-sm">未绑定预览图</span>
                                <span className="px-4 text-center text-xs leading-5 text-slate-600">生成、上传或绑定素材后才显示封面</span>
                            </div>
                        )}
                        <div className="absolute left-3 top-3 rounded-md border border-white/10 bg-[#05080d]/82 px-2 py-1 text-xs font-semibold text-cyan-100 backdrop-blur">{asset.type}</div>
                        <div className="absolute bottom-3 left-3">
                            <EpisodeStatusPill status={asset.status} tone={asset.tone} />
                        </div>
                    </div>
                    <div className="grid min-h-[220px] gap-3 p-4">
                        <div className="min-w-0">
                            <h3 className="line-clamp-2 break-words text-base font-semibold leading-6 text-slate-100">{asset.name}</h3>
                            <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-slate-500">{asset.description || "暂无描述，建议先运行资产分析补全用途。"}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.07] bg-[#05080d]/55 p-3">
                            <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
                                <span className="text-slate-500">提示词</span>
                                <span className="shrink-0 rounded border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[11px] text-cyan-100">{preset.label}</span>
                            </div>
                            <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{asset.promptDraft || "暂无提示词，可先重新生成资产清单。"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            {asset.boundAssetIds.length ? <span>已绑定 {asset.boundAssetIds.length} 个素材</span> : null}
                            <span>{asset.libraryMatchCount ? `候选匹配 ${asset.libraryMatchCount}${candidateImageCount ? ` / 图片 ${candidateImageCount}` : ""}` : "素材库无候选"}</span>
                            {asset.referencedShotLabels.length ? <span>引用 {asset.referencedShotLabels.join("、")}</span> : null}
                            {asset.sourceReason ? <span className="line-clamp-1 break-all">来源：{asset.sourceReason}</span> : null}
                        </div>
                    </div>
                </button>
                {coverAsset && coverUrl ? (
                    <button type="button" aria-label={`预览 ${asset.name}`} className="absolute inset-x-0 top-0 cursor-zoom-in rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" style={{ aspectRatio: coverAspectRatio }} onClick={() => onPreviewAsset(coverAsset)} />
                ) : null}
            </div>
            <div className="grid gap-2 border-t border-white/[0.07] p-3">
                <div className="grid gap-2 rounded-lg border border-white/[0.07] bg-[#05080d]/55 px-3 py-2">
                    <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-slate-400">
                            <SlidersHorizontal className="size-3.5 shrink-0 text-cyan-200" />
                            <span>图片设置</span>
                        </span>
                        <span className="shrink-0 text-slate-500">{actualImageSize ? `输出 ${actualImageSize}` : `请求 ${generationSize}`}</span>
                    </div>
                    <select
                        className="h-8 w-full rounded-md border border-white/10 bg-[#090f18] px-2 text-xs text-slate-100 outline-none transition hover:border-cyan-400/45 focus:border-cyan-300"
                        title={selectedSizeOption?.description}
                        value={generationSize}
                        onChange={(event) => setGenerationSize(event.target.value)}
                    >
                        {sizeOptions.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.label} · {item.size}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/35 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45" disabled={generating || !asset.canGenerate || !asset.promptDraft.trim()} onClick={() => void onGenerateImage(asset, { size: generationSize })}>
                        <WandSparkles className={`size-4 ${generating ? "animate-pulse" : ""}`} />
                        {generating ? "生成中" : "生成图片"}
                    </button>
                    <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-100 disabled:cursor-wait disabled:opacity-60" disabled={uploading} onClick={() => inputRef.current?.click()}>
                        <Upload className="size-4" />
                        {uploading ? "上传中" : "上传图片"}
                    </button>
                </div>
                <div className="grid gap-2">
                    <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 hover:border-amber-400/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-45" disabled={!reviewReady || reviewing} onClick={() => void onReviewAsset(asset)} title={reviewReady ? "提交或刷新火山素材加白状态" : "请先生成、上传或绑定图片"}>
                        <ShieldCheck className="size-4" />
                        {reviewing ? "处理中" : reviewText}
                    </button>
                </div>
                <input ref={inputRef} accept="image/*" className="hidden" type="file" onChange={(event) => void uploadSelectedFile(event.currentTarget.files?.[0])} />
            </div>
        </article>
    );
}

function imageAspectRatio(size: string) {
    const value = size.trim();
    const parts = value.includes("x") ? value.split("x") : value.includes(":") ? value.split(":") : [];
    const width = Number(parts[0]);
    const height = Number(parts[1]);
    if (!width || !height) return "4 / 3";
    return `${width} / ${height}`;
}

function reviewActionText(status: string | undefined, hasAssetId: boolean, hasAsset: boolean) {
    if (!hasAsset) return "待绑定图片";
    if (status === "Active" && hasAssetId) return "已加白";
    if (status === "Processing" && hasAssetId) return "刷新加白";
    if (status === "Failed" || (status && !hasAssetId)) return "重新加白";
    return "提交加白";
}
