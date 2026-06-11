"use client";

import { useEffect, useState } from "react";
import { Button } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../../agent-runner-workflow-display";
import { episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";
import { EpisodeAssetProcessDrawer } from "./episode-asset-process-drawer";
import { EpisodeAssetTable } from "./episode-asset-table";
import type { EpisodeAssetFilter, EpisodeAssetProcessMode, EpisodeAssetRow, EpisodeStageActionHint, OpenImageWorkbenchPayload } from "./episode-assets-module-types";
import { filterEpisodeExtractedAssets, padEpisodeOrder, previewCounts, summarizeEpisodeExtractedAssets } from "./episode-assets-module-utils";
import { StageOutputDigest } from "./stage-output-digest";

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
    onOpenDirector,
    onOpenImageWorkbench,
    onPrepareGenerate,
    onRunStage,
    onUploadAssetImage,
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
    onCancelStage: (stageId: string) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenDirector: () => void;
    onOpenImageWorkbench: (payload: OpenImageWorkbenchPayload) => void;
    onPrepareGenerate: () => void;
    onRunStage: (stageId: string) => void;
    onUploadAssetImage: (row: EpisodeAssetRow, file: File) => Promise<void>;
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
    const reviewOutput = stageOutputs["art-design"];
    const canApproveReview = Boolean(reviewOutput && stageDisplay?.stageStatus === "review" && !preview);
    const hasOutputStateMismatch = Boolean(reviewOutput && stageDisplay?.stageStatus !== "review" && stageDisplay?.displayStatus !== "approved" && !preview);
    const isRunning = Boolean(runningStageIds["art-design"]) || stageDisplay?.displayStatus === "running";
    const assetBlocked = Boolean(stageActionHint.blocked);
    const assetPrimaryActionLabel = assetBlocked ? "去确认导演分析" : isRunning ? "取消运行" : canApproveReview ? "确认资产分析结果" : hasOutputStateMismatch ? "重新运行资产分析" : stageOutputs["art-design"] ? "生成资产清单" : "运行资产分析";
    const runAssetPrimaryAction = () => (assetBlocked ? onOpenDirector() : isRunning ? onCancelStage("art-design") : canApproveReview ? onApproveStageReview("art-design", "资产清单已确认。") : hasOutputStateMismatch ? onRunStage("art-design") : stageOutputs["art-design"] ? onGeneratePreview("art-design", "设定库预览") : onRunStage("art-design"));

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
                        <span className="text-cyan-300">资产与生图</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title} · 资产与生图</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">从剧本和导演分析中提取角色、场景、道具、服装；每条资产可直接绑定已有素材，或带提示词进入生图工作台生成参考图。</p>
                </div>
                <div className="grid justify-items-start gap-2 xl:justify-items-end">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100"
                            danger={isRunning}
                            onClick={runAssetPrimaryAction}
                            type={!preview || previewCountsResult.pending <= 0 ? "primary" : "default"}
                        >
                            {assetPrimaryActionLabel}
                        </Button>
                        <Button type="primary" disabled={!preview || previewCountsResult.pending <= 0} loading={Boolean(preview && applyingPreviewIds[preview.previewId])} onClick={() => preview && onApplyPreview(preview)}>
                            写入设定库 {previewCountsResult.pending ? previewCountsResult.pending : ""}
                        </Button>
                    </div>
                    <div className={`max-w-[360px] break-words text-xs leading-5 ${episodeToneTextClass(stageActionHint.tone)}`}>当前：{stageActionHint.text}</div>
                </div>
            </div>

            {isRunning ? (
                <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-100">
                        <span className="size-2 animate-pulse rounded-full bg-cyan-300" />
                        资产分析实时预览
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                        {["正在从剧本和导演分析中识别角色、场景、道具和服装。", "正在整理可写入设定库的资产清单和参考图缺口。", "结果返回后会先展示清单，不会自动生成图片或视频。"].map((line, index) => (
                            <div key={line} className="rounded-lg border border-cyan-400/10 bg-slate-950/35 px-3 py-2 text-sm leading-6 text-slate-300">
                                <span className="mr-2 text-xs font-semibold text-cyan-200">{index + 1}</span>
                                {line}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {canApproveReview ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-amber-100">待确认资产清单草案</div>
                            <div className="mt-1 text-sm leading-6 text-amber-100/70">请先核对下方资产分析内容。确认后，本阶段会标记为已批准，下一步再生成资产清单或写入设定库。</div>
                        </div>
                        <Button type="primary" disabled={!reviewOutput} onClick={() => onApproveStageReview("art-design", "资产清单已确认。")}>
                            确认这份资产清单
                        </Button>
                    </div>
                    <div className="mt-4">
                        {reviewOutput ? (
                            <StageOutputDigest stageId="art-design" output={reviewOutput} />
                        ) : (
                            <div className="rounded-lg border border-amber-400/20 bg-slate-950/45 p-3 text-sm text-amber-100/70">当前没有可审核的资产分析输出，请先运行资产分析。</div>
                        )}
                    </div>
                </div>
            ) : null}

            {hasOutputStateMismatch ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-rose-100">资产阶段状态不一致</div>
                            <div className="mt-1 text-sm leading-6 text-rose-100/75">检测到资产分析产物，但当前阶段不是可确认状态。请重新运行资产分析，避免用旧产物继续生成资产清单。</div>
                        </div>
                        <Button danger onClick={() => onRunStage("art-design")}>
                            重新运行资产分析
                        </Button>
                    </div>
                </div>
            ) : null}

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

            {!isRunning && !assets.length ? (
                <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-cyan-100">{assetBlocked ? "下一步：先确认导演分析" : canApproveReview ? "下一步：确认资产分析结果" : hasOutputStateMismatch ? "下一步：重新运行资产分析" : stageOutputs["art-design"] ? "下一步：生成资产清单" : "下一步：运行资产分析"}</div>
                            <div className="mt-1 max-w-3xl break-words text-sm leading-6 text-cyan-100/75">
                                {assetBlocked
                                    ? stageActionHint.text
                                    : canApproveReview
                                      ? "资产分析结果已经返回，但还没有确认。先确认这份结果，确认后系统才允许把它转换成可写入设定库的资产清单。"
                                    : hasOutputStateMismatch
                                      ? "当前有旧产物，但阶段状态不是可批准状态。为了避免继续使用异常产物，请重新运行资产分析。"
                                    : stageOutputs["art-design"]
                                      ? "资产分析结果已经有了，但还没有转换成可阅读、可写入设定库的资产清单。点击生成后，下方会出现角色、场景、道具和服化道条目。"
                                    : "这里还没有资产结果。点击运行后，系统会从剧本和导演分析中提取角色、场景、道具和服化道，不会自动生成图片。"}
                            </div>
                        </div>
                        <Button type="primary" onClick={runAssetPrimaryAction}>
                            {assetPrimaryActionLabel}
                        </Button>
                    </div>
                </div>
            ) : null}

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
                    <EpisodeAssetTable
                        assets={filteredAssets}
                        onGenerateImage={(asset) =>
                            onOpenImageWorkbench({
                                assetId: asset.productionBibleItem?.id || asset.id,
                                prompt: asset.promptDraft || asset.description || asset.name,
                                title: asset.name,
                            })
                        }
                        onOpenProcess={openAssetProcess}
                        onUploadImage={onUploadAssetImage}
                        selectedAssetId={selectedAsset?.id || ""}
                    />
                </div>
                <EpisodeAssetProcessDrawer asset={selectedAsset} mode={processMode} onBindAsset={onBindAsset} onModeChange={setProcessMode} onOpenImageWorkbench={onOpenImageWorkbench} onPrepareGenerate={onPrepareGenerate} />
            </div>
        </section>
    );
}
