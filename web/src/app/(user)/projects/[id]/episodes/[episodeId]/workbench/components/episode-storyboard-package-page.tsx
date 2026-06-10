"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input } from "antd";

import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { workflowMappingPreviewItemKey, type AgentWorkflowMappingPreview, type AgentWorkflowSceneRunState } from "../../../../../agent-runner";
import { EpisodeStatusPill, episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";

type StoryboardPackageDrawerTab = "shots" | "script" | "prompt" | "assets";
type StoryboardPackageFilter = "全部" | "已确认" | "待编辑" | "待审核" | "缺资产" | "超时" | "待承接";

type StoryboardPackageShot = {
    action: string;
    camera: string;
    duration: number;
    id: string;
    order: number;
    prompt: string;
    title: string;
};

type StoryboardProductionPackage = {
    assetLabels: string[];
    duration: number;
    id: string;
    order: number;
    promptSummary: string;
    scriptText: string;
    segmentId: string;
    shots: StoryboardPackageShot[];
    status: StoryboardPackageFilter;
    summary: string;
    title: string;
    tone: EpisodeStatusTone;
};

export type StoryboardPackageStorySegment = {
    duration: number;
    id: string;
    order: number;
    packages: StoryboardProductionPackage[];
    scriptRange: string;
    scriptText: string;
    status: string;
    title: string;
    tone: EpisodeStatusTone;
};

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
    segments: StoryboardPackageStorySegment[];
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

function StoryboardPackageList({
    onAction,
    onOpenPackage,
    segments,
    selectedPackageId,
}: {
    onAction: (label: string) => void;
    onOpenPackage: (pkg: StoryboardProductionPackage, tab?: StoryboardPackageDrawerTab) => void;
    segments: StoryboardPackageStorySegment[];
    selectedPackageId: string;
}) {
    if (!segments.length) {
        return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的生产包。</div>;
    }
    return (
        <div className="max-h-[calc(100vh-360px)] min-h-[520px] overflow-auto">
            <div className="min-w-[800px]">
                {segments.map((segment) => (
                    <div key={segment.id} className="border-b border-slate-800/90 last:border-b-0">
                        <div className="grid grid-cols-[64px_minmax(160px,1fr)_78px_58px_58px_62px_72px_84px] gap-2 bg-slate-950/35 px-5 py-4 text-sm">
                            <div className="self-center text-lg font-semibold text-slate-100">S{padEpisodeOrder(segment.order)}</div>
                            <div className="min-w-0">
                                <div className="break-words font-semibold text-slate-100">{segment.title}</div>
                                <div className="mt-1 break-words text-xs text-slate-500">{segment.scriptRange}</div>
                            </div>
                            <div className="self-center text-slate-300">{segment.duration} 秒</div>
                            <div className="self-center text-slate-300">{segment.packages.length} 包</div>
                            <div className="self-center text-slate-300">{segment.packages.reduce((total, pkg) => total + pkg.shots.length, 0)} 镜</div>
                            <div className="self-center text-slate-300">{segment.packages.reduce((total, pkg) => total + pkg.assetLabels.length, 0)} 项</div>
                            <div className="self-center">
                                <EpisodeStatusPill status={segment.status} tone={segment.tone} />
                            </div>
                            <button
                                type="button"
                                className="self-center rounded-md border border-slate-700 bg-slate-900/80 px-2 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100"
                                onClick={() => segment.packages[0] && onOpenPackage(segment.packages[0], "script")}
                            >
                                查看原文
                            </button>
                        </div>
                        <div className="grid grid-cols-[64px_minmax(170px,1fr)_54px_54px_66px_72px_150px] gap-2 border-y border-slate-800/70 px-5 py-2 text-xs font-medium text-slate-500">
                            <div>生产包</div>
                            <div>包内容</div>
                            <div>时长</div>
                            <div>镜头</div>
                            <div>引用资产</div>
                            <div>状态</div>
                            <div>操作</div>
                        </div>
                        <div className="divide-y divide-slate-800/80">
                            {segment.packages.map((pkg) => {
                                const selected = pkg.id === selectedPackageId;
                                const timeout = pkg.duration > 15 || pkg.status === "超时";
                                return (
                                    <div key={pkg.id}>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            className={`grid grid-cols-[64px_minmax(170px,1fr)_54px_54px_66px_72px_150px] gap-2 border-l-4 px-5 py-4 text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : timeout ? "border-red-400/70 bg-red-500/[0.04] hover:bg-red-500/[0.07]" : "border-transparent hover:bg-white/[0.025]"}`}
                                            onClick={() => onOpenPackage(pkg)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") onOpenPackage(pkg);
                                            }}
                                        >
                                            <div className="self-center text-lg font-semibold text-slate-100">P{padEpisodeOrder(pkg.order)}</div>
                                            <div className="min-w-0 self-center">
                                                <div className="break-words font-semibold text-slate-100">{pkg.title}</div>
                                                <div className="mt-1 break-words text-slate-500">{pkg.summary}</div>
                                                {timeout ? <div className="mt-2 text-xs font-semibold text-red-300">预计超过 15 秒，需要拆分生产包。</div> : null}
                                            </div>
                                            <div className={`self-center font-semibold ${timeout ? "text-red-300" : "text-slate-200"}`}>{pkg.duration}s</div>
                                            <div className="self-center text-slate-300">{pkg.shots.length} 镜</div>
                                            <div className="self-center text-slate-300">{pkg.assetLabels.length ? `${pkg.assetLabels.length} 项` : "缺 1"}</div>
                                            <div className="self-center">
                                                <EpisodeStatusPill status={pkg.status} tone={pkg.tone} />
                                            </div>
                                            <div className="flex flex-wrap gap-2 self-center" onClick={(event) => event.stopPropagation()}>
                                                <StoryboardPackageActionButton label="查看" onClick={() => onOpenPackage(pkg)} />
                                                <StoryboardPackageActionButton label="编辑" onClick={() => onOpenPackage(pkg, "shots")} />
                                                <StoryboardPackageActionButton label="插入后" onClick={() => onAction(`在 P${padEpisodeOrder(pkg.order)} 后插入生产包`)} />
                                                <StoryboardPackageActionButton label={timeout ? "拆分" : "确认"} primary={timeout || pkg.status === "待审核"} onClick={() => onAction(timeout ? "拆分生产包" : "确认本包")} />
                                                <StoryboardPackageActionButton label="合并" onClick={() => onAction("合并到相邻生产包")} />
                                                <StoryboardPackageActionButton label="移动" onClick={() => onAction("移动顺序")} />
                                                <StoryboardPackageActionButton label="重提取" onClick={() => onAction("重提取本包")} />
                                                <StoryboardPackageActionButton label="导入画布" onClick={() => onAction("导入画布承接")} />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="mx-5 my-2 rounded-md border border-dashed border-cyan-500/40 bg-cyan-400/[0.04] px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/[0.08]"
                                            onClick={() => onAction(`在 P${padEpisodeOrder(pkg.order)} 后插入生产包`)}
                                        >
                                            + 在 P{padEpisodeOrder(pkg.order)} 后插入生产包
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StoryboardPackageActionButton({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
    return (
        <button
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${primary ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/20" : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function StoryboardPackageProcessDrawer({
    activeTab,
    onAction,
    onChangeTab,
    onGeneratePreview,
    onOpenAssets,
    onOpenCanvas,
    pkg,
    segment,
}: {
    activeTab: StoryboardPackageDrawerTab;
    onAction: (label: string) => void;
    onChangeTab: (tab: StoryboardPackageDrawerTab) => void;
    onGeneratePreview: () => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    pkg?: StoryboardProductionPackage;
    segment?: StoryboardPackageStorySegment;
}) {
    const [promptDraft, setPromptDraft] = useState("");
    useEffect(() => {
        setPromptDraft(pkg?.promptSummary || "");
    }, [pkg?.id, pkg?.promptSummary]);

    if (!pkg) return <aside className="rounded-2xl border border-slate-800 bg-[#091018]/88 p-5 text-sm text-slate-500">请选择一个生产包。</aside>;

    return (
        <aside className="rounded-2xl border border-slate-800 bg-[#091018]/92 shadow-[0_18px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="break-words text-2xl font-semibold leading-tight text-slate-50">
                            P{padEpisodeOrder(pkg.order)} · {pkg.title}
                        </h3>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">
                            属于 S{padEpisodeOrder(segment?.order || 1)} · {pkg.duration} 秒 · {pkg.shots.length} 个镜头
                        </p>
                    </div>
                    <EpisodeStatusPill status={pkg.status} tone={pkg.tone} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                    {(
                        [
                            ["shots", "包内镜头"],
                            ["script", "原剧本"],
                            ["prompt", "提示词"],
                            ["assets", "资产"],
                        ] as Array<[StoryboardPackageDrawerTab, string]>
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${activeTab === key ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-200"}`}
                            onClick={() => onChangeTab(key)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid max-h-[calc(100vh-260px)] gap-4 overflow-auto p-5">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-xs font-semibold text-slate-500">生产包约束</div>
                    <div className="mt-2 break-words text-sm leading-6 text-slate-200">
                        当前包预计 {pkg.duration} 秒，{pkg.duration > 15 ? "已超过 15 秒，建议拆分为新生产包。" : "符合 15 秒以内规则，可继续新增镜头；超过后需要拆分。"}
                    </div>
                </div>
                {activeTab === "shots" ? (
                    <div className="grid gap-4">
                        <div className="overflow-hidden rounded-lg border border-slate-800">
                            <div className="grid grid-cols-[48px_minmax(0,1fr)_96px_48px_70px] gap-2 border-b border-slate-800 bg-slate-950/45 px-3 py-2 text-xs font-medium text-slate-500">
                                <div>镜头</div>
                                <div>内容</div>
                                <div>景别 / 运动</div>
                                <div>时长</div>
                                <div>操作</div>
                            </div>
                            <div className="divide-y divide-slate-800/80">
                                {pkg.shots.map((shot) => (
                                    <div key={shot.id} className="grid grid-cols-[48px_minmax(0,1fr)_96px_48px_70px] gap-2 px-3 py-3 text-sm">
                                        <div className="font-semibold text-slate-100">{padEpisodeOrder(shot.order)}</div>
                                        <div className="min-w-0">
                                            <div className="break-words font-semibold text-slate-100">{shot.title}</div>
                                            <div className="mt-1 break-words text-slate-500">{shot.action}</div>
                                        </div>
                                        <div className="break-words text-slate-400">{shot.camera}</div>
                                        <div className="font-semibold text-slate-200">{shot.duration}s</div>
                                        <div className="flex flex-wrap gap-1">
                                            <button type="button" className="text-xs text-cyan-200" onClick={() => onAction("编辑镜头")}>
                                                编辑
                                            </button>
                                            <button type="button" className="text-xs text-slate-400" onClick={() => onAction("调整顺序")}>
                                                顺序
                                            </button>
                                            <button type="button" className="text-xs text-red-300" onClick={() => onAction("删除镜头")}>
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("包内新增镜头")}>
                                + 包内新增镜头
                            </Button>
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("拆分生产包")}>
                                拆分生产包
                            </Button>
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("移动到下一包")}>
                                移到下一包
                            </Button>
                        </div>
                    </div>
                ) : null}
                {activeTab === "script" ? (
                    <div className="grid gap-4">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                            <div className="text-xs font-semibold text-slate-500">对应原剧本内容</div>
                            <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-cyan-500/25 bg-cyan-400/[0.05] p-4 text-sm leading-7 text-slate-100">{pkg.scriptText || segment?.scriptText || "暂无原剧本片段。"}</div>
                        </div>
                        <div className="text-sm leading-6 text-slate-500">原剧本只用于查看和定位，不在生产包抽屉内直接修改。</div>
                    </div>
                ) : null}
                {activeTab === "prompt" ? (
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <div className="text-xs font-semibold text-slate-500">生产包提示词摘要</div>
                            <Input.TextArea className="!bg-slate-950/70 !text-slate-100" rows={5} value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-800">
                            <div className="border-b border-slate-800 bg-slate-950/45 px-3 py-2 text-xs font-medium text-slate-500">包内镜头动态提示词</div>
                            <div className="divide-y divide-slate-800/80">
                                {pkg.shots.map((shot) => (
                                    <div key={shot.id} className="px-3 py-3">
                                        <div className="text-sm font-semibold text-slate-100">
                                            {padEpisodeOrder(shot.order)} · {shot.title}
                                        </div>
                                        <div className="mt-2 break-words text-sm leading-6 text-slate-400">{shot.prompt}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onGeneratePreview}>
                                重提取提示词
                            </Button>
                            <Button type="primary" onClick={() => onAction("确认提示词")}>
                                确认提示词
                            </Button>
                        </div>
                    </div>
                ) : null}
                {activeTab === "assets" ? (
                    <div className="grid gap-4">
                        <div className="overflow-hidden rounded-lg border border-slate-800">
                            <div className="grid grid-cols-[88px_minmax(0,1fr)_90px] gap-3 border-b border-slate-800 bg-slate-950/45 px-3 py-2 text-xs font-medium text-slate-500">
                                <div>类型</div>
                                <div>资产</div>
                                <div>状态</div>
                            </div>
                            <div className="divide-y divide-slate-800/80">
                                {(pkg.assetLabels.length ? pkg.assetLabels : ["待补齐场景参考"]).map((asset, index) => (
                                    <div key={`${asset}-${index}`} className="grid grid-cols-[88px_minmax(0,1fr)_90px] gap-3 px-3 py-3 text-sm">
                                        <div className="font-semibold text-slate-100">{index === 0 ? "场景" : "引用"}</div>
                                        <div className="break-words text-slate-300">{asset}</div>
                                        <div>
                                            <EpisodeStatusPill status={pkg.status === "缺资产" && index === 0 ? "缺资产" : "已绑定"} tone={pkg.status === "缺资产" && index === 0 ? "amber" : "green"} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {pkg.status === "缺资产" ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3 text-sm leading-6 text-amber-100">当前包存在缺资产项，可跳转到资产与生图模块补齐绑定，或直接打开资产处理抽屉。</div> : null}
                        <div className="flex flex-wrap gap-2">
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onOpenAssets}>
                                跳到资产与生图
                            </Button>
                            <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("打开资产处理抽屉")}>
                                打开资产处理抽屉
                            </Button>
                            <Button type="primary" onClick={onOpenCanvas}>
                                导入画布承接
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="border-t border-slate-800 p-5">
                <div className="flex flex-wrap gap-2">
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("重提取本包")}>
                        重提取本包
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={() => onAction("编辑包信息")}>
                        编辑包信息
                    </Button>
                    <Button type="primary" onClick={() => onAction("保存并确认")}>
                        保存并确认
                    </Button>
                </div>
            </div>
        </aside>
    );
}

function summarizeStoryboardProductionSegments(segments: StoryboardPackageStorySegment[]) {
    const packages = segments.flatMap((segment) => segment.packages);
    return {
        missingAssets: packages.filter((pkg) => pkg.status === "缺资产").length,
        packages: packages.length,
        segments: segments.length,
        shots: packages.reduce((total, pkg) => total + pkg.shots.length, 0),
        timeout: packages.filter((pkg) => pkg.status === "超时" || pkg.duration > 15).length,
    };
}

function filterStoryboardPackage(pkg: StoryboardProductionPackage, filter: StoryboardPackageFilter) {
    if (filter === "全部") return true;
    if (filter === "超时") return pkg.status === "超时" || pkg.duration > 15;
    return pkg.status === filter;
}

function latestPreview(previews: AgentWorkflowMappingPreview[], targetType: AgentWorkflowMappingPreview["targetType"]) {
    return previews.filter((preview) => preview.targetType === targetType).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function previewCounts(preview: AgentWorkflowMappingPreview, appliedPreviewItemIds: string[]) {
    const creatable = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
    const applied = creatable.filter((item) => appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
    return { applied, pending: Math.max(0, creatable.length - applied), total: creatable.length };
}

function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}
