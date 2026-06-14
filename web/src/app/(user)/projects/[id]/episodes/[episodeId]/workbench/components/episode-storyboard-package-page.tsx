"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "antd";

import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import type { AgentWorkflowMappingPreview, AgentWorkflowSceneRunState } from "../../../../../agent-runner-types";
import type { StoryboardProductionPackage, StoryboardStorySegment } from "../storyboard-production-segments";
import { episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";
import type { EpisodeAssetRow } from "./episode-assets-module-types";
import { filterStoryboardPackage, latestPreview, padEpisodeOrder, previewCounts, summarizeStoryboardProductionSegments, type StoryboardPackageFilter } from "./episode-storyboard-package-utils";

export function EpisodeStoryboardPackagePage({
    appliedPreviewItemIds,
    applyingPreviewIds,
    assetRows,
    currentSceneState,
    episode,
    onApplyPreview,
    onApproveStoryboardScene,
    onCancelStoryboardScene,
    onGeneratePreview,
    onOpenAssets,
    onRunStoryboardScene,
    onSummarizeStoryboardScenes,
    previews,
    projectTitle,
    runningStoryboard,
    segments,
    staleRunning,
}: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    assetRows: EpisodeAssetRow[];
    currentSceneState?: AgentWorkflowSceneRunState;
    episode: ScriptEpisode;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApproveStoryboardScene: () => void;
    onCancelStoryboardScene: () => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenAssets: () => void;
    onRunStoryboardScene: () => void;
    onSummarizeStoryboardScenes: () => void;
    previews: AgentWorkflowMappingPreview[];
    projectTitle: string;
    runningStoryboard: boolean;
    segments: StoryboardStorySegment[];
    staleRunning: boolean;
}) {
    const [filter, setFilter] = useState<StoryboardPackageFilter>("全部");
    const [selectedPackageId, setSelectedPackageId] = useState("");
    const allPackages = useMemo(() => segments.flatMap((segment) => segment.packages), [segments]);
    const filteredSegments = useMemo(
        () =>
            segments
                .map((segment) => ({
                    ...segment,
                    packages: segment.packages.filter((pkg) => filterStoryboardPackage(pkg, filter)),
                }))
                .filter((segment) => filter === "全部" || segment.packages.length),
        [filter, segments],
    );
    const selectedPackage = allPackages.find((pkg) => pkg.id === selectedPackageId) || filteredSegments.flatMap((segment) => segment.packages)[0] || allPackages[0];
    const selectedSegment = selectedPackage ? segments.find((segment) => segment.id === selectedPackage.segmentId) : undefined;
    const matchedAssets = useMemo(() => matchStoryboardPackageAssets(selectedPackage, assetRows), [assetRows, selectedPackage]);
    const summary = summarizeStoryboardProductionSegments(segments);
    const storyboardPreview = latestPreview(previews, "storyboard_table");
    const storyboardCounts = storyboardPreview ? previewCounts(storyboardPreview, appliedPreviewItemIds) : { pending: 0, total: 0 };
    const sceneNeedsReview = currentSceneState?.status === "review";
    const sceneErrorText = currentSceneState?.status === "error" ? currentSceneState.errorMessage || "模型没有返回可用的分镜生产包，请调整敏感表达或重新生成。" : "";
    const hasApprovedScenes = Boolean(currentSceneState?.status === "approved" || segments.some((segment) => segment.status === "已确认" || segment.packages.some((pkg) => pkg.status === "已确认")));

    useEffect(() => {
        if (!allPackages.length) {
            setSelectedPackageId("");
            return;
        }
        if (!selectedPackage || !filterStoryboardPackage(selectedPackage, filter)) {
            setSelectedPackageId(filteredSegments.flatMap((segment) => segment.packages)[0]?.id || allPackages[0].id);
        }
    }, [allPackages, filter, filteredSegments, selectedPackage]);

    const selectPackage = (pkg: StoryboardProductionPackage) => setSelectedPackageId(pkg.id);

    return (
        <section className="grid gap-4">
            <div className="grid gap-4 rounded-xl border border-white/[0.07] bg-[#070b10]/80 px-5 py-4 shadow-[0_16px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">分镜生产包</span>
                    </div>
                    <h2 className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-50">{episode.title} · 分镜生产包</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">分镜 Agent 先拆剧情段落，再生成 15 秒以内生产包；确认后写入分镜表并保留提示词草案。</p>
                </div>
                <div className="flex max-w-[680px] flex-wrap justify-start gap-2 xl:justify-end">
                    {sceneNeedsReview ? (
                        <Button className="!rounded-xl" type="primary" onClick={onApproveStoryboardScene}>
                            批准当前场次
                        </Button>
                    ) : null}
                    <Button className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100" disabled={!hasApprovedScenes} onClick={onSummarizeStoryboardScenes}>
                        汇总已批准场次
                    </Button>
                    <Button className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100" danger={staleRunning || runningStoryboard} onClick={staleRunning || runningStoryboard ? onCancelStoryboardScene : onRunStoryboardScene}>
                        {staleRunning ? "清理运行状态" : runningStoryboard ? "取消当前场次" : "重跑段落拆解"}
                    </Button>
                    <Button className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100" disabled={staleRunning || runningStoryboard} onClick={() => onGeneratePreview("seedance-storyboard", "分镜提示词预览")}>
                        生成提示词预览
                    </Button>
                    <Button className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100" disabled={staleRunning || runningStoryboard || !storyboardPreview || storyboardCounts.pending <= 0} loading={Boolean(storyboardPreview && applyingPreviewIds[storyboardPreview.previewId])} onClick={() => storyboardPreview && onApplyPreview(storyboardPreview)}>
                        写入分镜表 {storyboardCounts.pending ? storyboardCounts.pending : ""}
                    </Button>
                </div>
            </div>

            {staleRunning ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-3 text-amber-100">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold">分镜生产包运行中断</div>
                        <div className="mt-1 break-words text-sm leading-6 text-amber-100/80">检测到上一次分镜场次只剩本地运行状态，当前页面没有真实请求在执行。先清理后即可重新生成。</div>
                    </div>
                    <Button className="!rounded-xl" danger onClick={onCancelStoryboardScene}>
                        清理运行状态
                    </Button>
                </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "剧情段落数", value: summary.segments },
                    { label: "生产包数", value: summary.packages, tone: "cyan" },
                    { label: "包内镜头数", value: summary.shots },
                    { label: "超时包数量", value: summary.timeout, tone: summary.timeout ? "red" : "green" },
                    { label: "缺资产包数量", value: summary.missingAssets, tone: summary.missingAssets ? "amber" : "green" },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass((item.tone as EpisodeStatusTone | undefined) || "slate")}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#070b10]/78 shadow-[0_16px_60px_rgba(0,0,0,0.20)] backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-50">选择生产包</h3>
                        <p className="mt-1 text-sm text-slate-500">按 P 包查看：左侧原文、中间资产、右侧提示词。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(["全部", "待编辑", "待审核", "缺资产", "超时", "已确认", "待承接"] as StoryboardPackageFilter[]).map((item) => (
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
                </div>
                <div className="thin-scrollbar flex gap-3 overflow-x-auto px-5 py-4">
                    {filteredSegments.length ? (
                        filteredSegments.flatMap((segment) =>
                            segment.packages.map((pkg) => (
                                <button
                                    key={pkg.id}
                                    type="button"
                                    className={`grid min-w-[220px] gap-2 rounded-lg border p-3 text-left transition ${selectedPackage?.id === pkg.id ? "border-cyan-300 bg-cyan-400/[0.10] shadow-[0_0_0_1px_rgba(103,232,249,0.18)]" : "border-white/[0.07] bg-white/[0.025] hover:border-cyan-400/40"}`}
                                    onClick={() => selectPackage(pkg)}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="text-base font-semibold text-slate-100">P{padEpisodeOrder(pkg.order)}</div>
                                        <span
                                            className={`rounded-md border px-2 py-0.5 text-xs ${pkg.tone === "red" ? "border-rose-400/45 text-rose-200" : pkg.tone === "amber" ? "border-amber-400/45 text-amber-200" : pkg.tone === "green" ? "border-emerald-400/45 text-emerald-200" : "border-slate-700 text-slate-300"}`}
                                        >
                                            {pkg.status}
                                        </span>
                                    </div>
                                    <div className="line-clamp-2 break-words text-sm font-medium text-slate-200">{pkg.title}</div>
                                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                        <span>{segment.title}</span>
                                        <span>{pkg.duration}s</span>
                                        <span>{pkg.assetLabels.length || 0} 资产</span>
                                    </div>
                                </button>
                            )),
                        )
                    ) : (
                        <div className="w-full px-4 py-6 text-center text-sm leading-6 text-slate-500">{sceneErrorText || "暂无符合筛选的生产包。"}</div>
                    )}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(260px,0.72fr)_minmax(340px,1.05fr)]">
                <section className="min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[#070b10]/82 shadow-[0_16px_60px_rgba(0,0,0,0.20)] backdrop-blur-xl">
                    <div className="border-b border-white/[0.07] px-5 py-4">
                        <div className="text-xs font-semibold uppercase text-slate-500">Script Source</div>
                        <h3 className="mt-1 break-words text-lg font-semibold text-slate-50">左：剧本原文</h3>
                        <p className="mt-1 text-sm text-slate-500">{selectedSegment ? `S${padEpisodeOrder(selectedSegment.order)} · ${selectedSegment.title} · ${selectedSegment.scriptRange}` : "请选择生产包查看原文。"}</p>
                    </div>
                    <div className="p-5">
                        <article className="thin-scrollbar min-h-[520px] max-h-[calc(100vh-390px)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-cyan-400/20 bg-cyan-400/[0.045] px-4 py-4 text-base leading-8 text-slate-100">
                            {selectedPackage?.scriptText || selectedSegment?.scriptText || "暂无原剧本片段。"}
                        </article>
                    </div>
                </section>

                <section className="min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[#070b10]/82 shadow-[0_16px_60px_rgba(0,0,0,0.20)] backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                        <div>
                            <div className="text-xs font-semibold uppercase text-slate-500">Matched Assets</div>
                            <h3 className="mt-1 text-lg font-semibold text-slate-50">中：资产缩略图</h3>
                            <p className="mt-1 text-sm text-slate-500">按本包提示词和资产标签匹配。</p>
                        </div>
                        <Button className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100" onClick={onOpenAssets}>
                            补资产
                        </Button>
                    </div>
                    <div className="thin-scrollbar grid max-h-[calc(100vh-305px)] min-h-[552px] gap-3 overflow-auto p-5">
                        {matchedAssets.length ? (
                            matchedAssets.map((asset) => <StoryboardAssetCard key={asset.id} asset={asset} />)
                        ) : (
                            <div className="rounded-lg border border-dashed border-amber-400/30 bg-amber-400/[0.06] px-4 py-8 text-center text-sm leading-6 text-amber-100">
                                当前生产包还没有匹配到资产。先到“资产与生图”生成或绑定角色、场景、道具参考图，再回到这里完善分镜提示词。
                            </div>
                        )}
                    </div>
                </section>

                <section className="min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[#070b10]/84 shadow-[0_18px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                    <div className="border-b border-white/[0.07] px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold uppercase text-slate-500">Generation Prompts</div>
                                <h3 className="mt-1 break-words text-lg font-semibold text-slate-50">右：生成提示词</h3>
                                <p className="mt-1 break-words text-sm text-slate-500">{selectedPackage ? `P${padEpisodeOrder(selectedPackage.order)} · ${selectedPackage.duration} 秒 · ${selectedPackage.shots.length} 个镜头` : "请选择生产包。"}</p>
                            </div>
                        </div>
                    </div>
                    <div className="thin-scrollbar grid max-h-[calc(100vh-305px)] min-h-[552px] gap-4 overflow-auto p-5">
                        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
                            <div className="mb-2 text-xs font-semibold text-slate-500">生产包总提示词</div>
                            <Input.TextArea className="!border-white/10 !bg-[#05080d]/70 !text-slate-100" rows={5} value={selectedPackage?.promptSummary || ""} readOnly placeholder="等待分镜 Agent 生成视频提示词。" />
                        </div>
                        <div className="grid gap-3">
                            {selectedPackage?.shots.length ? (
                                selectedPackage.shots.map((shot) => (
                                    <div key={shot.id} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="font-semibold text-slate-100">
                                                {padEpisodeOrder(shot.order)} · {shot.title}
                                            </div>
                                            <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300">{shot.duration}s</span>
                                        </div>
                                        <div className="mt-2 break-words text-xs leading-5 text-slate-500">{shot.camera}</div>
                                        <div className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-white/[0.07] bg-[#05080d]/55 p-3 text-sm leading-6 text-slate-200">{shot.prompt}</div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {(matchedAssets.length ? matchedAssets : assetRows.slice(0, 3)).slice(0, 5).map((asset) => (
                                                <span key={`${shot.id}-${asset.id}`} className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-xs text-cyan-100">
                                                    @{asset.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-lg border border-dashed border-white/[0.10] px-4 py-8 text-center text-sm text-slate-500">暂无镜头提示词。</div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button className="!rounded-xl !border-white/10 !bg-white/[0.04] !text-slate-200 hover:!border-cyan-400/60 hover:!text-cyan-100" disabled={staleRunning || runningStoryboard} onClick={() => onGeneratePreview("seedance-storyboard", "分镜提示词预览")}>
                                重新生成提示词
                            </Button>
                        </div>
                    </div>
                </section>
            </div>
        </section>
    );
}

function StoryboardAssetCard({ asset }: { asset: EpisodeAssetRow }) {
    const previewAsset = asset.previewAsset || asset.candidates.find((candidate) => candidate.kind === "image") || asset.candidates[0];
    const coverUrl = previewAsset?.coverUrl || (previewAsset?.kind === "image" ? previewAsset.data.dataUrl : "");
    return (
        <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-[#05080d]">
                {coverUrl ? (
                    <img src={coverUrl} alt={asset.name} className="aspect-square h-full w-full object-cover" />
                ) : (
                    <div className="flex aspect-square h-full w-full items-center justify-center text-xl font-semibold text-slate-500">{asset.type.slice(0, 1)}</div>
                )}
            </div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-slate-300">{asset.type}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-xs ${asset.tone === "green" ? "border-emerald-400/45 text-emerald-200" : asset.tone === "amber" ? "border-amber-400/45 text-amber-200" : "border-cyan-400/45 text-cyan-100"}`}>
                        {asset.status}
                    </span>
                </div>
                <div className="mt-2 break-words text-sm font-semibold text-slate-100">{asset.name}</div>
                <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-500">{asset.description}</div>
                {asset.promptDraft ? <div className="mt-2 line-clamp-2 break-words text-xs leading-5 text-cyan-100/75">{asset.promptDraft}</div> : null}
            </div>
        </div>
    );
}

function matchStoryboardPackageAssets(pkg: StoryboardProductionPackage | undefined, assets: EpisodeAssetRow[]) {
    if (!pkg) return [];
    const packageText = [pkg.title, pkg.summary, pkg.promptSummary, pkg.scriptText, pkg.assetLabels.join(" "), ...pkg.shots.flatMap((shot) => [shot.title, shot.action, shot.prompt])].join(" ").toLowerCase();
    const matched = assets
        .map((asset) => ({ asset, score: storyboardAssetMatchScore(asset, packageText, pkg.assetLabels) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name))
        .map((item) => item.asset);
    return matched.length ? matched.slice(0, 8) : assets.slice(0, 6);
}

function storyboardAssetMatchScore(asset: EpisodeAssetRow, packageText: string, labels: string[]) {
    const terms = [asset.name, asset.type, ...labels, ...asset.name.split(/[、，,\s]+/)].map((item) => item.trim()).filter((item) => item.length >= 2);
    let score = 0;
    terms.forEach((term) => {
        if (packageText.includes(term.toLowerCase())) score += term.length > 3 ? 3 : 2;
    });
    if (asset.status === "已绑定") score += 2;
    if (asset.type === "场景" && packageText.includes("场景")) score += 1;
    if (asset.type === "角色" && packageText.includes("人物")) score += 1;
    return score;
}
