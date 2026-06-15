"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "antd";
import { Eye } from "lucide-react";

import { useEffectiveConfig } from "@/stores/use-config-store";
import type { Asset } from "@/stores/use-asset-store";
import { episodeAssetImagePreset } from "../episode-asset-image-presets";
import { assetKindDisplay, assetVersionSummary, filterAssetCandidates } from "./episode-assets-module-utils";
import type { EpisodeAssetImageGenerationOptions, EpisodeAssetProcessMode, EpisodeAssetRow } from "./episode-assets-module-types";
import { EpisodeStatusPill } from "./episode-module-panel";

export function EpisodeAssetProcessDrawer({
    asset,
    generating,
    mode,
    onBindAsset,
    onGenerateImage,
    onModeChange,
    onPreviewAsset,
}: {
    asset?: EpisodeAssetRow;
    generating: boolean;
    mode: EpisodeAssetProcessMode;
    onBindAsset: (row: EpisodeAssetRow, asset: Asset) => void;
    onGenerateImage: (row: EpisodeAssetRow, options?: EpisodeAssetImageGenerationOptions) => Promise<string[]>;
    onModeChange: (mode: EpisodeAssetProcessMode) => void;
    onPreviewAsset: (asset: Asset) => void;
}) {
    const effectiveConfig = useEffectiveConfig();
    const defaultImageModel = effectiveConfig.imageModel || effectiveConfig.model;
    const [assetSearch, setAssetSearch] = useState("");
    const [kindFilter, setKindFilter] = useState<"全部" | "图片" | "文本" | "视频">("全部");
    const [selectedCandidateId, setSelectedCandidateId] = useState("");
    const [promptDraft, setPromptDraft] = useState("");
    const [model, setModel] = useState(defaultImageModel);
    const [size, setSize] = useState("1024x1024");
    const [count, setCount] = useState("2");
    const candidates = asset ? filterAssetCandidates(asset.candidates, assetSearch, kindFilter) : [];
    const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) || candidates[0];

    useEffect(() => {
        setAssetSearch("");
        setKindFilter("全部");
        setSelectedCandidateId(asset?.candidates[0]?.id || "");
        setPromptDraft(asset?.promptDraft || "");
        setModel(defaultImageModel);
        setSize(asset ? episodeAssetImagePreset(asset.type).size : "1024x1024");
        setCount("1");
    }, [asset?.id, asset?.promptDraft, asset?.type, defaultImageModel]);

    if (!asset) {
        return <aside className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 text-sm text-[var(--studio-text-muted)]">请选择一条资产进行处理。</aside>;
    }

    return (
        <aside className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)] xl:sticky xl:top-5">
            <div className="border-b border-[var(--studio-border-subtle)] p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="break-words text-2xl font-semibold leading-tight text-[var(--studio-text-primary)]">{asset.name}</h3>
                        <p className="mt-2 break-words text-sm leading-6 text-[var(--studio-text-muted)]">
                            {asset.type}资产 · {asset.episodeLabel} · {asset.referencedShotLabels.length || 0} 个镜头引用
                        </p>
                    </div>
                    <EpisodeStatusPill status={asset.status} tone={asset.tone} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${mode === "bind" ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] text-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-[var(--studio-text-muted)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"}`}
                        onClick={() => onModeChange("bind")}
                    >
                        绑定已有资产
                    </button>
                    <button
                        type="button"
                        className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${mode === "generate" ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] text-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-[var(--studio-text-muted)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"}`}
                        onClick={() => onModeChange("generate")}
                    >
                        生成参考图
                    </button>
                </div>
            </div>
            <div className="grid gap-4 p-5">
                <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                    <div className="text-xs font-semibold text-[var(--studio-text-muted)]">提取描述</div>
                    <div className="mt-2 break-words text-sm leading-6 text-[var(--studio-text-secondary)]">{asset.description}</div>
                </div>
                {mode === "bind" ? (
                    <EpisodeAssetBindPanel
                        asset={asset}
                        assetSearch={assetSearch}
                        candidates={candidates}
                        kindFilter={kindFilter}
                        onAssetSearchChange={setAssetSearch}
                        onBindAsset={onBindAsset}
                        onKindFilterChange={setKindFilter}
                        onPreviewAsset={onPreviewAsset}
                        onSelectedCandidateChange={setSelectedCandidateId}
                        selectedCandidate={selectedCandidate}
                    />
                ) : (
                    <EpisodeAssetGeneratePanel
                        asset={asset}
                        count={count}
                        generating={generating}
                        model={model}
                        onCountChange={setCount}
                        onGenerateImage={onGenerateImage}
                        onModelChange={setModel}
                        onPromptDraftChange={setPromptDraft}
                        onSizeChange={setSize}
                        promptDraft={promptDraft}
                        size={size}
                    />
                )}
            </div>
        </aside>
    );
}

function EpisodeAssetBindPanel({
    asset,
    assetSearch,
    candidates,
    kindFilter,
    onAssetSearchChange,
    onBindAsset,
    onKindFilterChange,
    onPreviewAsset,
    onSelectedCandidateChange,
    selectedCandidate,
}: {
    asset: EpisodeAssetRow;
    assetSearch: string;
    candidates: Asset[];
    kindFilter: "全部" | "图片" | "文本" | "视频";
    onAssetSearchChange: (value: string) => void;
    onBindAsset: (row: EpisodeAssetRow, asset: Asset) => void;
    onKindFilterChange: (value: "全部" | "图片" | "文本" | "视频") => void;
    onPreviewAsset: (asset: Asset) => void;
    onSelectedCandidateChange: (id: string) => void;
    selectedCandidate?: Asset;
}) {
    return (
        <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                <Input placeholder="搜索候选素材" value={assetSearch} onChange={(event) => onAssetSearchChange(event.target.value)} />
                <div className="grid grid-cols-4 overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)]">
                    {(["全部", "图片", "文本", "视频"] as const).map((item) => (
                        <button key={item} type="button" className={`px-2 py-1.5 text-xs transition ${kindFilter === item ? "bg-[var(--studio-active-bg)] text-[var(--studio-accent)]" : "text-[var(--studio-text-muted)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"}`} onClick={() => onKindFilterChange(item)}>
                            {item}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid max-h-[340px] gap-2 overflow-auto pr-1">
                {candidates.length ? (
                    candidates.map((candidate) => (
                        <div key={candidate.id} className="relative">
                            <button
                                type="button"
                                className={`grid w-full grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border p-2 text-left transition ${selectedCandidate?.id === candidate.id ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]"}`}
                                onClick={() => onSelectedCandidateChange(candidate.id)}
                            >
                                <AssetCandidateThumb asset={candidate} />
                                <div className="min-w-0">
                                    <div className="break-words text-sm font-semibold text-[var(--studio-text-primary)]">{candidate.title}</div>
                                    <div className="mt-1 text-xs text-[var(--studio-text-muted)]">
                                        {assetKindDisplay(candidate.kind)} · {assetVersionSummary(candidate)}
                                    </div>
                                    {candidate.tags.length ? <div className="mt-1 break-words text-xs text-[var(--studio-text-muted)]">{candidate.tags.slice(0, 4).join(" / ")}</div> : null}
                                </div>
                            </button>
                            {candidate.kind === "image" ? (
                                <button type="button" aria-label={`预览 ${candidate.title}`} className="absolute left-2 top-2 grid h-16 w-[72px] place-items-center rounded-md bg-black/0 text-white opacity-0 transition hover:bg-black/35 hover:opacity-100 focus-visible:bg-black/35 focus-visible:opacity-100" onClick={() => onPreviewAsset(candidate)}>
                                    <Eye className="size-5" />
                                </button>
                            ) : null}
                        </div>
                    ))
                ) : (
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-4 py-8 text-center text-sm text-[var(--studio-text-muted)]">项目资产库暂无匹配候选。</div>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                <Button className="!rounded-md" disabled={!selectedCandidate || !asset.productionBibleItem} onClick={() => selectedCandidate && onBindAsset(asset, selectedCandidate)}>
                    绑定选中素材
                </Button>
                {!asset.productionBibleItem ? <span className="self-center text-xs text-[var(--studio-warning)]">先写入设定库后可确认绑定。</span> : null}
            </div>
        </div>
    );
}

function EpisodeAssetGeneratePanel({
    asset,
    count,
    generating,
    model,
    onCountChange,
    onGenerateImage,
    onModelChange,
    onPromptDraftChange,
    onSizeChange,
    promptDraft,
    size,
}: {
    asset: EpisodeAssetRow;
    count: string;
    generating: boolean;
    model: string;
    onCountChange: (value: string) => void;
    onGenerateImage: (row: EpisodeAssetRow, options?: EpisodeAssetImageGenerationOptions) => Promise<string[]>;
    onModelChange: (value: string) => void;
    onPromptDraftChange: (value: string) => void;
    onSizeChange: (value: string) => void;
    promptDraft: string;
    size: string;
}) {
    const preset = episodeAssetImagePreset(asset.type);
    return (
        <div className="grid gap-4">
            <div className="grid gap-2">
                <div className="text-xs font-semibold text-[var(--studio-text-muted)]">生图提示词</div>
                <Input.TextArea rows={8} value={promptDraft} onChange={(event) => onPromptDraftChange(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-[var(--studio-text-muted)]">
                    模型
                    <Input value={model} onChange={(event) => onModelChange(event.target.value)} />
                </label>
                <label className="grid gap-1 text-xs text-[var(--studio-text-muted)]">
                    尺寸
                    <Input value={size} onChange={(event) => onSizeChange(event.target.value)} />
                </label>
                <label className="grid gap-1 text-xs text-[var(--studio-text-muted)]">
                    数量
                    <Input value={count} onChange={(event) => onCountChange(event.target.value)} />
                </label>
            </div>
            <div className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] p-3 text-sm leading-6 text-[var(--studio-accent)]">
                当前类型预设：{preset.label}（{preset.size}）。{preset.description}
            </div>
            <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 text-sm leading-6 text-[var(--studio-text-secondary)]">生成结果会先进入项目资产库；若该资产已写入设定库，会自动绑定到当前资产。</div>
            <div className="flex flex-wrap gap-2">
                <Button className="!rounded-md" type="primary" loading={generating} disabled={!asset.canGenerate || !promptDraft.trim()} onClick={() => void onGenerateImage(asset, { count, model, prompt: promptDraft || asset.promptDraft || asset.description, size })}>
                    生成并绑定
                </Button>
            </div>
        </div>
    );
}

function AssetCandidateThumb({ asset }: { asset: Asset }) {
    const imageUrl = asset.kind === "image" ? asset.coverUrl || asset.data.dataUrl : "";
    if (imageUrl)
        return (
            <div className="h-16 overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)]">
                <img className="h-full w-full object-cover" src={imageUrl} alt={asset.title} />
            </div>
        );
    return <div className="grid h-16 place-items-center rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] text-xs font-semibold text-[var(--studio-text-muted)]">{assetKindDisplay(asset.kind)}</div>;
}
