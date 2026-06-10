"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import { assetKindDisplay, assetVersionSummary, filterAssetCandidates } from "./episode-assets-module-utils";
import type { EpisodeAssetProcessMode, EpisodeAssetRow, OpenImageWorkbenchPayload } from "./episode-assets-module-types";
import { EpisodeStatusPill } from "./episode-module-panel";

export function EpisodeAssetProcessDrawer({
    asset,
    mode,
    onBindAsset,
    onModeChange,
    onOpenImageWorkbench,
    onPrepareGenerate,
}: {
    asset?: EpisodeAssetRow;
    mode: EpisodeAssetProcessMode;
    onBindAsset: (row: EpisodeAssetRow, asset: Asset) => void;
    onModeChange: (mode: EpisodeAssetProcessMode) => void;
    onOpenImageWorkbench: (payload: OpenImageWorkbenchPayload) => void;
    onPrepareGenerate: () => void;
}) {
    const [assetSearch, setAssetSearch] = useState("");
    const [kindFilter, setKindFilter] = useState<"全部" | "图片" | "文本" | "视频">("全部");
    const [selectedCandidateId, setSelectedCandidateId] = useState("");
    const [promptDraft, setPromptDraft] = useState("");
    const [model, setModel] = useState("gpt-image-1");
    const [size, setSize] = useState("1024x1024");
    const [count, setCount] = useState("2");
    const candidates = asset ? filterAssetCandidates(asset.candidates, assetSearch, kindFilter) : [];
    const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) || candidates[0];

    useEffect(() => {
        setAssetSearch("");
        setKindFilter("全部");
        setSelectedCandidateId(asset?.candidates[0]?.id || "");
        setPromptDraft(asset?.promptDraft || "");
    }, [asset?.id]);

    if (!asset) {
        return <aside className="rounded-2xl border border-slate-800 bg-[#091018]/88 p-5 text-sm text-slate-500">请选择一条资产进行处理。</aside>;
    }

    return (
        <aside className="rounded-2xl border border-slate-800 bg-[#091018]/92 shadow-[0_18px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="break-words text-2xl font-semibold leading-tight text-slate-50">{asset.name}</h3>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">
                            {asset.type}资产 · {asset.episodeLabel} · {asset.referencedShotLabels.length || 0} 个镜头引用
                        </p>
                    </div>
                    <EpisodeStatusPill status={asset.status} tone={asset.tone} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "bind" ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`}
                        onClick={() => onModeChange("bind")}
                    >
                        绑定已有资产
                    </button>
                    <button
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "generate" ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`}
                        onClick={() => onModeChange("generate")}
                    >
                        生成参考图
                    </button>
                </div>
            </div>
            <div className="grid gap-4 p-5">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-xs font-semibold text-slate-500">提取描述</div>
                    <div className="mt-2 break-words text-sm leading-6 text-slate-200">{asset.description}</div>
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
                        onSelectedCandidateChange={setSelectedCandidateId}
                        selectedCandidate={selectedCandidate}
                    />
                ) : (
                    <EpisodeAssetGeneratePanel
                        asset={asset}
                        count={count}
                        model={model}
                        onCountChange={setCount}
                        onModelChange={setModel}
                        onOpenImageWorkbench={onOpenImageWorkbench}
                        onPrepareGenerate={onPrepareGenerate}
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
    onSelectedCandidateChange: (id: string) => void;
    selectedCandidate?: Asset;
}) {
    return (
        <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                <Input className="!bg-slate-950/70 !text-slate-100" placeholder="搜索候选素材" value={assetSearch} onChange={(event) => onAssetSearchChange(event.target.value)} />
                <div className="grid grid-cols-4 overflow-hidden rounded-md border border-slate-800">
                    {(["全部", "图片", "文本", "视频"] as const).map((item) => (
                        <button key={item} type="button" className={`px-2 py-1.5 text-xs ${kindFilter === item ? "bg-cyan-400/15 text-cyan-100" : "bg-slate-950/50 text-slate-500"}`} onClick={() => onKindFilterChange(item)}>
                            {item}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid max-h-[340px] gap-2 overflow-auto pr-1">
                {candidates.length ? (
                    candidates.map((candidate) => (
                        <button
                            key={candidate.id}
                            type="button"
                            className={`grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg border p-2 text-left transition ${selectedCandidate?.id === candidate.id ? "border-cyan-400/70 bg-cyan-400/[0.08]" : "border-slate-800 bg-slate-950/45 hover:border-slate-600"}`}
                            onClick={() => onSelectedCandidateChange(candidate.id)}
                        >
                            <AssetCandidateThumb asset={candidate} />
                            <div className="min-w-0">
                                <div className="break-words text-sm font-semibold text-slate-100">{candidate.title}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                    {assetKindDisplay(candidate.kind)} · {assetVersionSummary(candidate)}
                                </div>
                                {candidate.tags.length ? <div className="mt-1 break-words text-xs text-slate-500">{candidate.tags.slice(0, 4).join(" / ")}</div> : null}
                            </div>
                        </button>
                    ))
                ) : (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-500">项目资产库暂无匹配候选。</div>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" disabled={!selectedCandidate || !asset.productionBibleItem} onClick={() => selectedCandidate && onBindAsset(asset, selectedCandidate)}>
                    绑定选中素材
                </Button>
                {!asset.productionBibleItem ? <span className="self-center text-xs text-amber-300">先写入设定库后可确认绑定。</span> : null}
            </div>
        </div>
    );
}

function EpisodeAssetGeneratePanel({
    asset,
    count,
    model,
    onCountChange,
    onModelChange,
    onOpenImageWorkbench,
    onPrepareGenerate,
    onPromptDraftChange,
    onSizeChange,
    promptDraft,
    size,
}: {
    asset: EpisodeAssetRow;
    count: string;
    model: string;
    onCountChange: (value: string) => void;
    onModelChange: (value: string) => void;
    onOpenImageWorkbench: (payload: OpenImageWorkbenchPayload) => void;
    onPrepareGenerate: () => void;
    onPromptDraftChange: (value: string) => void;
    onSizeChange: (value: string) => void;
    promptDraft: string;
    size: string;
}) {
    return (
        <div className="grid gap-4">
            <div className="grid gap-2">
                <div className="text-xs font-semibold text-slate-500">生图提示词</div>
                <Input.TextArea className="!bg-slate-950/70 !text-slate-100" rows={8} value={promptDraft} onChange={(event) => onPromptDraftChange(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-slate-500">
                    模型
                    <Input className="!bg-slate-950/70 !text-slate-100" value={model} onChange={(event) => onModelChange(event.target.value)} />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                    尺寸
                    <Input className="!bg-slate-950/70 !text-slate-100" value={size} onChange={(event) => onSizeChange(event.target.value)} />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                    数量
                    <Input className="!bg-slate-950/70 !text-slate-100" value={count} onChange={(event) => onCountChange(event.target.value)} />
                </label>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm leading-6 text-slate-400">生成结果会先进入项目资产库，再绑定到当前提取资产；后续分镜和画布承接都引用资产库版本。</div>
            <div className="flex flex-wrap gap-2">
                <Button type="primary" onClick={() => onOpenImageWorkbench({ assetId: asset.id, prompt: promptDraft || asset.promptDraft || asset.description, title: asset.name })}>
                    进入生图工作台
                </Button>
                <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onPrepareGenerate}>
                    仅准备参数
                </Button>
            </div>
        </div>
    );
}

function AssetCandidateThumb({ asset }: { asset: Asset }) {
    const imageUrl = asset.kind === "image" ? asset.coverUrl || asset.data.dataUrl : "";
    if (imageUrl)
        return (
            <div className="h-16 overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                <img className="h-full w-full object-cover" src={imageUrl} alt={asset.title} />
            </div>
        );
    return <div className="grid h-16 place-items-center rounded-md border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-500">{assetKindDisplay(asset.kind)}</div>;
}
