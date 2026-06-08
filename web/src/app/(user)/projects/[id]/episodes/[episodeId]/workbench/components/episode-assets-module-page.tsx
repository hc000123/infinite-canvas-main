"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import type { ProductionBibleItem } from "../../../../../../canvas/utils/production-bible";
import { summarizeWorkflowStageDisplayState, workflowMappingPreviewItemKey, type AgentWorkflowMappingPreview, type AgentWorkflowRunRecord, type AgentWorkflowStageOutput } from "../../../../../agent-runner";
import { EpisodeStatusPill, episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";

type EpisodeAssetProcessMode = "bind" | "generate";
type EpisodeAssetFilter = "全部" | "缺素材" | "已绑定" | "待生成" | "角色" | "场景" | "道具" | "服装";
type EpisodeStageActionHint = { blocked?: boolean; text: string; tone: EpisodeStatusTone };
type OpenImageWorkbenchPayload = { assetId?: string; briefId?: string; prompt: string; title?: string };

type EpisodeAssetRow = {
    canGenerate: boolean;
    candidates: Asset[];
    description: string;
    episodeLabel: string;
    id: string;
    libraryMatchCount: number;
    name: string;
    productionBibleItem?: ProductionBibleItem;
    promptDraft: string;
    referencedShotLabels: string[];
    sourceReason: string;
    status: "已绑定" | "待绑定" | "待生成" | "待确认" | "缺素材";
    tone: EpisodeStatusTone;
    type: "角色" | "场景" | "道具" | "服装";
};

export function EpisodeAssetsModulePage({
    appliedPreviewItemIds,
    applyingPreviewIds,
    assets,
    episode,
    onApplyPreview,
    onApproveStageReview,
    onBindAsset,
    onGeneratePreview,
    onOpenImageWorkbench,
    onPrepareGenerate,
    onRunStage,
    preview,
    projectTitle,
    runningStageIds,
    stageActionHint,
    stageOutputs,
    workflowRun,
}: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    assets: EpisodeAssetRow[];
    episode: ScriptEpisode;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApproveStageReview: (stageId: string, note: string) => void;
    onBindAsset: (row: EpisodeAssetRow, asset: Asset) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenImageWorkbench: (payload: OpenImageWorkbenchPayload) => void;
    onPrepareGenerate: () => void;
    onRunStage: (stageId: string) => void;
    preview?: AgentWorkflowMappingPreview;
    projectTitle: string;
    runningStageIds: Record<string, boolean>;
    stageActionHint: EpisodeStageActionHint;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}) {
    const [filter, setFilter] = useState<EpisodeAssetFilter>("全部");
    const [selectedAssetId, setSelectedAssetId] = useState("");
    const [processMode, setProcessMode] = useState<EpisodeAssetProcessMode>("bind");
    const filteredAssets = assets.filter((asset) => filterEpisodeExtractedAssets(asset, filter));
    const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || filteredAssets[0] || assets[0];
    const summary = summarizeEpisodeExtractedAssets(assets);
    const previewCountsResult = preview ? previewCounts(preview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const stageDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "art-design", []) : undefined;
    const needsReview = stageDisplay?.displayStatus === "review";

    useEffect(() => {
        if (!assets.length) {
            setSelectedAssetId("");
            return;
        }
        if (!selectedAsset || !filteredAssets.some((asset) => asset.id === selectedAsset.id)) setSelectedAssetId(filteredAssets[0]?.id || assets[0].id);
    }, [assets, filteredAssets, selectedAsset]);

    const openAssetProcess = (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => {
        setSelectedAssetId(asset.id);
        setProcessMode(mode);
    };

    return (
        <section className="grid gap-5">
            <div className="grid gap-4 border-b border-slate-800 pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">资产提取</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title} · 资产提取</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">从剧本和导演分析中提取角色、场景、道具、服装；每条资产可直接绑定已有素材，或带提示词进入生图工作台生成参考图。</p>
                </div>
                <div className="grid justify-items-start gap-2 xl:justify-items-end">
                    <div className="flex flex-wrap gap-2">
                        {needsReview ? (
                            <Button type="primary" onClick={() => onApproveStageReview("art-design", "资产提取结果已确认。")}>
                                批准资产提取
                            </Button>
                        ) : null}
                        <Button
                            className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100"
                            disabled={stageActionHint.blocked}
                            onClick={() => (stageOutputs["art-design"] ? onGeneratePreview("art-design", "设定库预览") : onRunStage("art-design"))}
                            loading={Boolean(runningStageIds["art-design"])}
                        >
                            {stageOutputs["art-design"] ? "刷新资产预览" : "运行资产提取"}
                        </Button>
                        <Button type="primary" disabled={!preview || previewCountsResult.pending <= 0} loading={Boolean(preview && applyingPreviewIds[preview.previewId])} onClick={() => preview && onApplyPreview(preview)}>
                            写入设定库 {previewCountsResult.pending ? previewCountsResult.pending : ""}
                        </Button>
                    </div>
                    <div className={`max-w-[360px] break-words text-xs leading-5 ${episodeToneTextClass(stageActionHint.tone)}`}>当前：{stageActionHint.text}</div>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "角色", value: summary.characters },
                    { label: "场景", value: summary.scenes },
                    { label: "道具", value: summary.props },
                    { label: "服装", value: summary.costumes },
                    { label: "缺素材", tone: summary.missing ? "amber" : "green", value: summary.missing },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass((item.tone as EpisodeStatusTone | undefined) || "slate")}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/88">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                            {(["全部", "缺素材", "已绑定", "待生成", "角色", "场景", "道具", "服装"] as EpisodeAssetFilter[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={`rounded-md border px-3 py-1.5 text-sm transition ${filter === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`}
                                    onClick={() => setFilter(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="text-sm text-slate-500">当前显示 {filteredAssets.length} 条</div>
                    </div>
                    <EpisodeAssetTable assets={filteredAssets} selectedAssetId={selectedAsset?.id || ""} onOpenProcess={openAssetProcess} />
                </div>
                <EpisodeAssetProcessDrawer asset={selectedAsset} mode={processMode} onBindAsset={onBindAsset} onModeChange={setProcessMode} onOpenImageWorkbench={onOpenImageWorkbench} onPrepareGenerate={onPrepareGenerate} />
            </div>
        </section>
    );
}

function EpisodeAssetTable({ assets, onOpenProcess, selectedAssetId }: { assets: EpisodeAssetRow[]; onOpenProcess: (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => void; selectedAssetId: string }) {
    if (!assets.length) {
        return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的资产。</div>;
    }
    return (
        <div className="overflow-x-auto">
            <div className="min-w-[920px]">
                <div className="grid grid-cols-[90px_minmax(240px,1fr)_110px_90px_100px_150px] gap-4 border-b border-slate-800 px-5 py-3 text-sm font-medium text-slate-500">
                    <div>类型</div>
                    <div>资产</div>
                    <div>项目库</div>
                    <div>生成</div>
                    <div>状态</div>
                    <div>操作</div>
                </div>
                <div className="divide-y divide-slate-800/90">
                    {assets.map((asset) => {
                        const selected = asset.id === selectedAssetId;
                        return (
                            <div
                                key={asset.id}
                                role="button"
                                tabIndex={0}
                                className={`grid w-full grid-cols-[90px_minmax(240px,1fr)_110px_90px_100px_150px] gap-4 border-l-4 px-5 py-4 text-left text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : "border-transparent hover:bg-white/[0.025]"}`}
                                onClick={() => onOpenProcess(asset, asset.status === "已绑定" ? "bind" : asset.libraryMatchCount ? "bind" : "generate")}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") onOpenProcess(asset, asset.status === "已绑定" ? "bind" : asset.libraryMatchCount ? "bind" : "generate");
                                }}
                            >
                                <div className="self-center font-semibold text-slate-200">{asset.type}</div>
                                <div className="min-w-0 self-center">
                                    <div className="break-words font-semibold text-slate-100">{asset.name}</div>
                                    <div className="mt-1 break-words text-slate-500">{asset.description}</div>
                                </div>
                                <div className="self-center font-semibold text-slate-200">{asset.libraryMatchCount ? `匹配 ${asset.libraryMatchCount}` : "无匹配"}</div>
                                <div className="self-center text-slate-300">{asset.canGenerate ? "可生成" : "-"}</div>
                                <div className="self-center">
                                    <EpisodeStatusPill status={asset.status} tone={asset.tone} />
                                </div>
                                <div className="flex self-center" onClick={(event) => event.stopPropagation()}>
                                    <button type="button" className="rounded-l-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100" onClick={() => onOpenProcess(asset, "bind")}>
                                        绑定
                                    </button>
                                    <button type="button" className="rounded-r-md border border-l-0 border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100" onClick={() => onOpenProcess(asset, "generate")}>
                                        生成
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function EpisodeAssetProcessDrawer({
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
                    <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "bind" ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`} onClick={() => onModeChange("bind")}>
                        绑定已有资产
                    </button>
                    <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "generate" ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`} onClick={() => onModeChange("generate")}>
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
                    <div className="grid gap-4">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                            <Input className="!bg-slate-950/70 !text-slate-100" placeholder="搜索候选素材" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} />
                            <div className="grid grid-cols-4 overflow-hidden rounded-md border border-slate-800">
                                {(["全部", "图片", "文本", "视频"] as const).map((item) => (
                                    <button key={item} type="button" className={`px-2 py-1.5 text-xs ${kindFilter === item ? "bg-cyan-400/15 text-cyan-100" : "bg-slate-950/50 text-slate-500"}`} onClick={() => setKindFilter(item)}>
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
                                        onClick={() => setSelectedCandidateId(candidate.id)}
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
                ) : (
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <div className="text-xs font-semibold text-slate-500">生图提示词</div>
                            <Input.TextArea className="!bg-slate-950/70 !text-slate-100" rows={8} value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <label className="grid gap-1 text-xs text-slate-500">
                                模型
                                <Input className="!bg-slate-950/70 !text-slate-100" value={model} onChange={(event) => setModel(event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-500">
                                尺寸
                                <Input className="!bg-slate-950/70 !text-slate-100" value={size} onChange={(event) => setSize(event.target.value)} />
                            </label>
                            <label className="grid gap-1 text-xs text-slate-500">
                                数量
                                <Input className="!bg-slate-950/70 !text-slate-100" value={count} onChange={(event) => setCount(event.target.value)} />
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
                )}
            </div>
        </aside>
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

function summarizeEpisodeExtractedAssets(assets: EpisodeAssetRow[]) {
    return {
        characters: assets.filter((asset) => asset.type === "角色").length,
        costumes: assets.filter((asset) => asset.type === "服装").length,
        missing: assets.filter((asset) => asset.status === "缺素材" || asset.status === "待生成").length,
        props: assets.filter((asset) => asset.type === "道具").length,
        scenes: assets.filter((asset) => asset.type === "场景").length,
    };
}

function filterEpisodeExtractedAssets(asset: EpisodeAssetRow, filter: EpisodeAssetFilter) {
    if (filter === "全部") return true;
    if (filter === "角色" || filter === "场景" || filter === "道具" || filter === "服装") return asset.type === filter;
    if (filter === "缺素材") return asset.status === "缺素材" || asset.status === "待生成";
    if (filter === "已绑定") return asset.status === "已绑定";
    if (filter === "待生成") return asset.status === "待生成";
    return true;
}

function filterAssetCandidates(candidates: Asset[], search: string, kindFilter: "全部" | "图片" | "文本" | "视频") {
    const keyword = search.trim().toLowerCase();
    return candidates.filter((asset) => {
        const kindMatched = kindFilter === "全部" || assetKindDisplay(asset.kind) === kindFilter;
        if (!kindMatched) return false;
        if (!keyword) return true;
        return `${asset.title} ${asset.tags.join(" ")} ${asset.note || ""}`.toLowerCase().includes(keyword);
    });
}

function assetKindDisplay(kind: Asset["kind"]) {
    const labels: Record<Asset["kind"], string> = {
        audio: "音频",
        image: "图片",
        text: "文本",
        video: "视频",
    };
    return labels[kind];
}

function assetVersionSummary(asset: Asset) {
    const versions = Array.isArray(asset.metadata?.assetVersions) ? asset.metadata.assetVersions : [];
    return versions.length ? `版本 ${versions.length}` : "版本 1";
}

function previewCounts(preview: AgentWorkflowMappingPreview, appliedPreviewItemIds: string[]) {
    const creatable = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
    const applied = creatable.filter((item) => appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
    return { total: creatable.length, applied, pending: creatable.length - applied };
}

function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}
