"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../../agent-runner-workflow-display";
import { episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";
import { EpisodeAssetProcessDrawer } from "./episode-asset-process-drawer";
import { EpisodeAssetTable } from "./episode-asset-table";
import type { EpisodeAssetFilter, EpisodeAssetImageGenerationOptions, EpisodeAssetProcessMode, EpisodeAssetRow, EpisodeStageActionHint } from "./episode-assets-module-types";
import { filterEpisodeExtractedAssets, padEpisodeOrder, previewCounts, summarizeEpisodeExtractedAssets } from "./episode-assets-module-utils";
import { runningEpisodeAssetGenerationIds, useEpisodeAssetGenerationStore } from "../use-episode-asset-generation-store";

export function EpisodeAssetsModulePage({
    appliedPreviewItemIds,
    applyingPreviewIds,
    assets,
    episode,
    onApplyPreview,
    onApproveStageReview,
    onBindAsset,
    onCancelStage,
    onGeneratePreview,
    onGenerateImage,
    onOpenDirector,
    onReviewAsset,
    onRunStage,
    onSaveStageResult,
    onUploadAssetImage,
    preview,
    projectId,
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
    onCancelStage: (stageId: string) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onGenerateImage: (row: EpisodeAssetRow, options?: EpisodeAssetImageGenerationOptions) => Promise<string[]>;
    onOpenDirector: () => void;
    onReviewAsset: (row: EpisodeAssetRow) => Promise<void>;
    onRunStage: (stageId: string) => void;
    onSaveStageResult: (stageId: string) => void;
    onUploadAssetImage: (row: EpisodeAssetRow, file: File) => Promise<void>;
    preview?: AgentWorkflowMappingPreview;
    projectId: string;
    projectTitle: string;
    runningStageIds: Record<string, boolean>;
    stageActionHint: EpisodeStageActionHint;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}) {
    const [filter, setFilter] = useState<EpisodeAssetFilter>("全部");
    const [selectedAssetId, setSelectedAssetId] = useState("");
    const [processMode, setProcessMode] = useState<EpisodeAssetProcessMode>("bind");
    const [reviewingAssetIds, setReviewingAssetIds] = useState<Record<string, boolean>>({});
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const generationRecords = useEpisodeAssetGenerationStore((state) => state.records);
    const startGeneration = useEpisodeAssetGenerationStore((state) => state.startGeneration);
    const completeGeneration = useEpisodeAssetGenerationStore((state) => state.completeGeneration);
    const failGeneration = useEpisodeAssetGenerationStore((state) => state.failGeneration);
    const pruneStaleGenerationRecords = useEpisodeAssetGenerationStore((state) => state.pruneStaleGenerationRecords);
    const filteredAssets = assets.filter((asset) => filterEpisodeExtractedAssets(asset, filter));
    const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || filteredAssets[0] || assets[0];
    const summary = summarizeEpisodeExtractedAssets(assets);
    const previewCountsResult = preview ? previewCounts(preview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const stageDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, "art-design", []) : undefined;
    const artStageState = workflowRun?.stageStates.find((stage) => stage.stageId === "art-design");
    const reviewOutput = stageOutputs["art-design"];
    const hasOutputStateMismatch = Boolean(reviewOutput && stageDisplay?.stageStatus !== "review" && stageDisplay?.displayStatus !== "approved" && !preview);
    const localRunning = Boolean(runningStageIds["art-design"]);
    const staleRunning = stageDisplay?.displayStatus === "running" && !localRunning;
    const isRunning = localRunning;
    const assetBlocked = Boolean(stageActionHint.blocked);
    const stageOutputId = artStageState?.outputId || reviewOutput?.outputId || "";
    const hasAssetAnalysisResult = Boolean(stageOutputs["art-design"] || preview || assets.length);
    const canRerunAssetAnalysis = hasAssetAnalysisResult && !assetBlocked && !isRunning && !staleRunning && !hasOutputStateMismatch;
    const autoProgressKeyRef = useRef("");
    const generatingAssetIds = useMemo(() => runningEpisodeAssetGenerationIds(generationRecords, projectId, episode.id), [episode.id, generationRecords, projectId]);
    const assetPrimaryActionLabel = assetBlocked ? "去确认导演分析" : staleRunning ? "清理运行状态" : isRunning ? "取消运行" : hasOutputStateMismatch ? "重新运行资产分析" : stageOutputs["art-design"] ? "生成资产清单" : "运行资产分析";
    const runAssetPrimaryAction = () => (assetBlocked ? onOpenDirector() : staleRunning || isRunning ? onCancelStage("art-design") : hasOutputStateMismatch ? onRunStage("art-design") : stageOutputs["art-design"] ? onGeneratePreview("art-design", "设定库预览") : onRunStage("art-design"));

    useEffect(() => {
        pruneStaleGenerationRecords();
    }, [pruneStaleGenerationRecords]);

    useEffect(() => {
        if (!reviewOutput || !stageOutputId || preview || isRunning) return;
        if (artStageState?.status === "review") {
            const key = `approve:${stageOutputId}`;
            if (autoProgressKeyRef.current === key) return;
            autoProgressKeyRef.current = key;
            onApproveStageReview("art-design", "资产分析完成，自动确认。");
            return;
        }
        if (artStageState?.status === "approved") {
            const key = `preview:${stageOutputId}`;
            if (autoProgressKeyRef.current === key) return;
            autoProgressKeyRef.current = key;
            onGeneratePreview("art-design", "设定库预览");
        }
    }, [artStageState?.status, isRunning, onApproveStageReview, onGeneratePreview, preview, reviewOutput, stageOutputId]);

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
    const generateAssetImage = async (asset: EpisodeAssetRow, options?: EpisodeAssetImageGenerationOptions) => {
        setSelectedAssetId(asset.id);
        startGeneration({ projectId, episodeId: episode.id, assetId: asset.id, assetName: asset.name, model: options?.model, size: options?.size });
        try {
            const assetIds = await onGenerateImage(asset, options);
            completeGeneration({ projectId, episodeId: episode.id, assetId: asset.id, assetIds });
            return assetIds;
        } catch (error) {
            failGeneration({ projectId, episodeId: episode.id, assetId: asset.id, errorMessage: error instanceof Error ? error.message : "生成图片失败" });
            return [];
        }
    };
    const reviewAsset = async (asset: EpisodeAssetRow) => {
        setSelectedAssetId(asset.id);
        setReviewingAssetIds((state) => ({ ...state, [asset.id]: true }));
        try {
            await onReviewAsset(asset);
        } finally {
            setReviewingAssetIds((state) => {
                const next = { ...state };
                delete next[asset.id];
                return next;
            });
        }
    };
    const previewAssetUrl = previewAsset?.kind === "image" ? previewAsset.coverUrl || previewAsset.data.dataUrl : "";

    return (
        <section className="grid gap-4">
            <div className="grid gap-4 rounded-xl border border-white/[0.07] bg-[#070b10]/80 px-5 py-4 shadow-[0_16px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">资产与生图</span>
                    </div>
                    <h2 className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-50">{episode.title} · 资产与生图</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">从剧本和导演分析中提取角色、场景、道具、服装；每条资产可直接绑定已有素材，或按类型预设画幅就地生成参考图。</p>
                </div>
                <div className="grid justify-items-start gap-2 xl:justify-items-end">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100"
                            danger={isRunning || staleRunning || hasOutputStateMismatch}
                            disabled={assetBlocked}
                            onClick={runAssetPrimaryAction}
                            type={!preview || previewCountsResult.pending <= 0 ? "primary" : "default"}
                        >
                            {assetPrimaryActionLabel}
                        </Button>
                        {canRerunAssetAnalysis ? (
                            <Button className="!rounded-xl !border-amber-400/35 !bg-amber-400/[0.07] !text-amber-100 hover:!border-amber-300/60 hover:!text-amber-50" onClick={() => onRunStage("art-design")}>
                                重新提取资产
                            </Button>
                        ) : null}
                        <Button className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100" disabled={(!stageOutputs["art-design"] && !preview) || isRunning} onClick={() => onSaveStageResult("art-design")}>
                            保存结果
                        </Button>
                        <Button className="!rounded-xl" type="primary" disabled={!preview || previewCountsResult.pending <= 0} loading={Boolean(preview && applyingPreviewIds[preview.previewId])} onClick={() => preview && onApplyPreview(preview)}>
                            写入设定库 {previewCountsResult.pending ? previewCountsResult.pending : ""}
                        </Button>
                    </div>
                    <div className={`max-w-[360px] break-words text-xs leading-5 ${episodeToneTextClass(stageActionHint.tone)}`}>当前：{stageActionHint.text}</div>
                </div>
            </div>

            {isRunning ? (
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.07] p-4 shadow-[0_16px_50px_rgba(8,145,178,0.08)] backdrop-blur-xl">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-100">
                        <span className="size-2 animate-pulse rounded-full bg-cyan-300" />
                        资产分析实时预览
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                        {["正在从剧本和导演分析中识别角色、场景、道具和服装。", "正在整理可写入设定库的资产清单和参考图缺口。", "结果返回后会先展示清单，不会自动生成图片或视频。"].map((line, index) => (
                            <div key={line} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm leading-6 text-slate-300">
                                <span className="mr-2 text-xs font-semibold text-cyan-200">{index + 1}</span>
                                {line}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {staleRunning ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-4 shadow-[0_16px_50px_rgba(245,158,11,0.07)] backdrop-blur-xl">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-amber-100">资产分析运行中断</div>
                            <div className="mt-1 text-sm leading-6 text-amber-100/75">页面里已经没有正在等待的请求，但上一次阶段状态仍停在运行中。先点击“清理运行状态”，再重新运行资产分析。</div>
                        </div>
                    </div>
                </div>
            ) : null}

            {hasOutputStateMismatch ? (
                <div className="rounded-xl border border-rose-400/30 bg-rose-400/[0.06] p-4 shadow-[0_16px_50px_rgba(244,63,94,0.07)] backdrop-blur-xl">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-rose-100">资产阶段状态不一致</div>
                            <div className="mt-1 text-sm leading-6 text-rose-100/75">检测到资产分析产物，但当前阶段不是可确认状态。请重新运行资产分析，避免用旧产物继续生成资产清单。</div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "角色", value: summary.characters },
                    { label: "场景/场记", value: summary.scenes },
                    { label: "道具", value: summary.props },
                    { label: "服装", value: summary.costumes },
                    { label: "缺素材", tone: summary.missing ? "amber" : "green", value: summary.missing },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass((item.tone as EpisodeStatusTone | undefined) || "slate")}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            {!isRunning && !assets.length ? (
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.07] p-5 shadow-[0_16px_50px_rgba(8,145,178,0.08)] backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-cyan-100">{assetBlocked ? "下一步：先确认导演分析" : staleRunning ? "下一步：清理运行状态" : hasOutputStateMismatch ? "下一步：重新运行资产分析" : stageOutputs["art-design"] ? "正在生成资产清单" : "下一步：运行资产分析"}</div>
                            <div className="mt-1 max-w-3xl break-words text-sm leading-6 text-cyan-100/75">
                                {assetBlocked
                                    ? stageActionHint.text
                                    : staleRunning
                                      ? "上一次资产分析没有正常结束。清理后会进入可重试状态，不会自动生成图片或视频。"
                                    : hasOutputStateMismatch
                                      ? "当前有旧产物，但阶段状态不是可批准状态。为了避免继续使用异常产物，请重新运行资产分析。"
                                    : stageOutputs["art-design"]
                                      ? "资产分析结果已经返回，系统正在转换成可阅读、可写入设定库的资产清单。"
                                    : "这里还没有资产结果。点击运行后，系统会从剧本和导演分析中提取角色、场景、道具和服化道，不会自动生成图片。"}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
                <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[#070b10]/78 shadow-[0_16px_60px_rgba(0,0,0,0.20)] backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                            {(["全部", "缺素材", "已绑定", "待生成", "角色", "场景", "道具", "服装"] as EpisodeAssetFilter[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${filter === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-white/[0.08] bg-white/[0.025] text-slate-500 hover:border-cyan-400/45 hover:text-slate-200"}`}
                                    onClick={() => setFilter(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="text-sm text-slate-500">当前显示 {filteredAssets.length} 条</div>
                    </div>
                    <EpisodeAssetTable
                        assets={filteredAssets}
                        generatingAssetIds={generatingAssetIds}
                        onGenerateImage={generateAssetImage}
                        onOpenProcess={openAssetProcess}
                        onPreviewAsset={setPreviewAsset}
                        onReviewAsset={reviewAsset}
                        onUploadImage={onUploadAssetImage}
                        reviewingAssetIds={reviewingAssetIds}
                        selectedAssetId={selectedAsset?.id || ""}
                    />
                </div>
                <EpisodeAssetProcessDrawer asset={selectedAsset} generating={Boolean(selectedAsset && generatingAssetIds[selectedAsset.id])} mode={processMode} onBindAsset={onBindAsset} onGenerateImage={generateAssetImage} onModeChange={setProcessMode} onPreviewAsset={setPreviewAsset} />
            </div>
            <Modal centered footer={null} open={Boolean(previewAssetUrl)} title={previewAsset?.title || "图片预览"} width={960} onCancel={() => setPreviewAsset(null)}>
                {previewAssetUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={previewAsset?.title || "图片预览"} className="max-h-[78vh] w-full rounded-lg object-contain" src={previewAssetUrl} />
                ) : null}
            </Modal>
        </section>
    );
}
