"use client";

import { useRef, useState } from "react";
import { ImageIcon, Link2, ShieldCheck, Upload, WandSparkles } from "lucide-react";

import { EpisodeStatusPill } from "./episode-module-panel";
import type { EpisodeAssetProcessMode, EpisodeAssetRow } from "./episode-assets-module-types";

export function EpisodeAssetTable({
    assets,
    onGenerateImage,
    onOpenProcess,
    onUploadImage,
    selectedAssetId,
}: {
    assets: EpisodeAssetRow[];
    onGenerateImage: (asset: EpisodeAssetRow) => void;
    onOpenProcess: (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => void;
    onUploadImage: (asset: EpisodeAssetRow, file: File) => Promise<void>;
    selectedAssetId: string;
}) {
    if (!assets.length) {
        return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的资产。</div>;
    }
    return (
        <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
            {assets.map((asset) => (
                <EpisodeAssetCard key={asset.id} asset={asset} onGenerateImage={onGenerateImage} onOpenProcess={onOpenProcess} onUploadImage={onUploadImage} selected={asset.id === selectedAssetId} />
            ))}
        </div>
    );
}

function EpisodeAssetCard({
    asset,
    onGenerateImage,
    onOpenProcess,
    onUploadImage,
    selected,
}: {
    asset: EpisodeAssetRow;
    onGenerateImage: (asset: EpisodeAssetRow) => void;
    onOpenProcess: (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => void;
    onUploadImage: (asset: EpisodeAssetRow, file: File) => Promise<void>;
    selected: boolean;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const coverAsset = asset.candidates.find((item) => item.kind === "image") || asset.candidates[0];
    const coverUrl = coverAsset?.kind === "image" ? coverAsset.coverUrl || coverAsset.data.dataUrl : "";
    const review = coverAsset?.metadata?.volcengineAsset;
    const reviewText = review?.status ? `加白：${review.status}` : coverAsset ? "可提交加白" : "待图片";
    const reviewReady = Boolean(coverAsset);

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
        <article className={`group overflow-hidden rounded-xl border bg-slate-950/45 transition ${selected ? "border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]" : "border-slate-800 hover:border-slate-700"}`}>
            <button type="button" className="block w-full text-left" onClick={() => onOpenProcess(asset, asset.status === "已绑定" || asset.libraryMatchCount ? "bind" : "generate")}>
                <div className="relative aspect-[4/3] bg-slate-900">
                    {coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverUrl} alt={asset.name} className="size-full object-cover" />
                    ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-2 border-b border-slate-800 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%),#071018] text-slate-500">
                            <ImageIcon className="size-9 text-slate-600" />
                            <span className="text-sm">待生成 / 待上传图片</span>
                        </div>
                    )}
                    <div className="absolute left-3 top-3 rounded-md border border-slate-700/80 bg-slate-950/80 px-2 py-1 text-xs font-semibold text-cyan-100">{asset.type}</div>
                    <div className="absolute bottom-3 left-3">
                        <EpisodeStatusPill status={asset.status} tone={asset.tone} />
                    </div>
                </div>
                <div className="grid min-h-[220px] gap-3 p-4">
                    <div className="min-w-0">
                        <h3 className="line-clamp-2 break-words text-base font-semibold leading-6 text-slate-100">{asset.name}</h3>
                        <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-slate-500">{asset.description || "暂无描述，建议先运行资产分析补全用途。"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-black/18 p-3">
                        <div className="mb-1 text-xs font-semibold text-slate-500">提示词</div>
                        <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{asset.promptDraft || "暂无提示词，可先重新生成资产清单。"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{asset.libraryMatchCount ? `素材库匹配 ${asset.libraryMatchCount}` : "素材库无匹配"}</span>
                        {asset.referencedShotLabels.length ? <span>引用 {asset.referencedShotLabels.join("、")}</span> : null}
                    </div>
                </div>
            </button>
            <div className="grid gap-2 border-t border-slate-800 p-3">
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-md border border-cyan-500/35 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45" disabled={!asset.canGenerate || !asset.promptDraft.trim()} onClick={() => onGenerateImage(asset)}>
                        <WandSparkles className="size-4" />
                        生成图片
                    </button>
                    <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/75 px-3 py-2 text-sm font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-100 disabled:cursor-wait disabled:opacity-60" disabled={uploading} onClick={() => inputRef.current?.click()}>
                        <Upload className="size-4" />
                        {uploading ? "上传中" : "上传图片"}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/75 px-3 py-2 text-sm font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-100" onClick={() => onOpenProcess(asset, "bind")}>
                        <Link2 className="size-4" />
                        绑定素材
                    </button>
                    <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/75 px-3 py-2 text-sm font-medium text-slate-200 hover:border-amber-400/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-45" disabled={!reviewReady} onClick={() => onOpenProcess(asset, "bind")} title={reviewReady ? "在素材绑定面板中查看或处理加白状态" : "请先生成、上传或绑定图片"}>
                        <ShieldCheck className="size-4" />
                        {reviewText}
                    </button>
                </div>
                <input ref={inputRef} accept="image/*" className="hidden" type="file" onChange={(event) => void uploadSelectedFile(event.currentTarget.files?.[0])} />
            </div>
        </article>
    );
}
