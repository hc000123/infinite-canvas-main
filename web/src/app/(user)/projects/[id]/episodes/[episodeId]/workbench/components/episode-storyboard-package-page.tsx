"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button } from "antd";

import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import type { AgentWorkflowMappingPreview, AgentWorkflowSceneRunState } from "../../../../../agent-runner-types";
import type { StoryboardProductionPackage, StoryboardStorySegment } from "../storyboard-production-segments";
import { episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";
import { filterStoryboardPackage, latestPreview, padEpisodeOrder, previewCounts, summarizeStoryboardProductionSegments, type StoryboardPackageDrawerTab, type StoryboardPackageFilter } from "./episode-storyboard-package-utils";
import { StoryboardPackageList } from "./storyboard-package-list";
import { StoryboardPackageProcessDrawer } from "./storyboard-package-process-drawer";

export function EpisodeStoryboardPackagePage({
    appliedPreviewItemIds,
    applyingPreviewIds,
    currentSceneState,
    episode,
    hasCanvas,
    onApplyPreview,
    onApproveStoryboardScene,
    onGeneratePreview,
    onOpenAssets,
    onOpenCanvas,
    onRunStoryboardScene,
    onSummarizeStoryboardScenes,
    previews,
    projectTitle,
    runningStoryboard,
    segments,
}: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    currentSceneState?: AgentWorkflowSceneRunState;
    episode: ScriptEpisode;
    hasCanvas: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApproveStoryboardScene: () => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    onRunStoryboardScene: () => void;
    onSummarizeStoryboardScenes: () => void;
    previews: AgentWorkflowMappingPreview[];
    projectTitle: string;
    runningStoryboard: boolean;
    segments: StoryboardStorySegment[];
}) {
    const { message } = App.useApp();
    const [filter, setFilter] = useState<StoryboardPackageFilter>("全部");
    const [selectedPackageId, setSelectedPackageId] = useState("");
    const [drawerTab, setDrawerTab] = useState<StoryboardPackageDrawerTab>("shots");
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
    const summary = summarizeStoryboardProductionSegments(segments);
    const storyboardPreview = latestPreview(previews, "storyboard_table");
    const videoPreview = latestPreview(previews, "video_node");
    const storyboardCounts = storyboardPreview ? previewCounts(storyboardPreview, appliedPreviewItemIds) : { pending: 0, total: 0 };
    const videoCounts = videoPreview ? previewCounts(videoPreview, appliedPreviewItemIds) : { pending: 0, total: 0 };
    const handoffDisabledReason = hasCanvas ? "" : "先创建承接画布";
    const sceneNeedsReview = currentSceneState?.status === "review";
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

    const openPackage = (pkg: StoryboardProductionPackage, tab: StoryboardPackageDrawerTab = "shots") => {
        setSelectedPackageId(pkg.id);
        setDrawerTab(tab);
    };
    const notifyAction = (label: string) => message.info(`${label} 已进入交互占位，后续接入生产包编辑能力。`);

    return (
        <section className="grid gap-5">
            <div className="grid gap-4 border-b border-slate-800 pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">分镜生产包</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title} · 分镜生产包</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">分镜 Agent 先拆剧情段落，再生成 15 秒以内生产包；确认后按包导入画布承接。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {sceneNeedsReview ? (
                        <Button type="primary" onClick={onApproveStoryboardScene}>
                            批准当前场次
                        </Button>
                    ) : null}
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" disabled={!hasApprovedScenes} onClick={onSummarizeStoryboardScenes}>
                        汇总已批准场次
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" loading={runningStoryboard} onClick={onRunStoryboardScene}>
                        重跑段落拆解
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" onClick={() => onGeneratePreview("seedance-storyboard", "分镜表和视频节点预览")}>
                        生成预览
                    </Button>
                    <Button
                        disabled={Boolean(handoffDisabledReason) || !storyboardPreview || storyboardCounts.pending <= 0}
                        loading={Boolean(storyboardPreview && applyingPreviewIds[storyboardPreview.previewId])}
                        onClick={() => storyboardPreview && onApplyPreview(storyboardPreview)}
                    >
                        写入分镜表 {storyboardCounts.pending ? storyboardCounts.pending : ""}
                    </Button>
                    <Button
                        type="primary"
                        disabled={Boolean(handoffDisabledReason) || !videoPreview || videoCounts.pending <= 0}
                        loading={Boolean(videoPreview && applyingPreviewIds[videoPreview.previewId])}
                        onClick={() => videoPreview && onApplyPreview(videoPreview)}
                    >
                        创建视频节点 {videoCounts.pending ? videoCounts.pending : ""}
                    </Button>
                    {handoffDisabledReason ? <span className="self-center text-xs text-amber-300">{handoffDisabledReason}</span> : null}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "剧情段落数", value: summary.segments },
                    { label: "生产包数", value: summary.packages, tone: "cyan" },
                    { label: "包内镜头数", value: summary.shots },
                    { label: "超时包数量", value: summary.timeout, tone: summary.timeout ? "red" : "green" },
                    { label: "缺资产包数量", value: summary.missingAssets, tone: summary.missingAssets ? "amber" : "green" },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass((item.tone as EpisodeStatusTone | undefined) || "slate")}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_450px]">
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/88">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                        <h3 className="text-lg font-semibold text-slate-50">剧情段落与生产包</h3>
                        <div className="flex flex-wrap gap-2">
                            {(["全部", "待编辑", "待审核", "缺资产", "超时", "已确认", "待承接"] as StoryboardPackageFilter[]).map((item) => (
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
                    </div>
                    <StoryboardPackageList segments={filteredSegments} selectedPackageId={selectedPackage?.id || ""} onAction={notifyAction} onOpenPackage={openPackage} />
                </div>
                <StoryboardPackageProcessDrawer
                    activeTab={drawerTab}
                    pkg={selectedPackage}
                    segment={selectedSegment}
                    onAction={notifyAction}
                    onChangeTab={setDrawerTab}
                    onGeneratePreview={() => onGeneratePreview("seedance-storyboard", "分镜生产包预览")}
                    onOpenAssets={onOpenAssets}
                    onOpenCanvas={onOpenCanvas}
                />
            </div>
        </section>
    );
}
