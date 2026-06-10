"use client";

import type { StoryboardProductionPackage, StoryboardStorySegment } from "../storyboard-production-segments";
import { EpisodeStatusPill } from "./episode-module-panel";
import { type StoryboardPackageDrawerTab, padEpisodeOrder } from "./episode-storyboard-package-utils";

export function StoryboardPackageList({
    onAction,
    onOpenPackage,
    segments,
    selectedPackageId,
}: {
    onAction: (label: string) => void;
    onOpenPackage: (pkg: StoryboardProductionPackage, tab?: StoryboardPackageDrawerTab) => void;
    segments: StoryboardStorySegment[];
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
                            {segment.packages.map((pkg) => (
                                <StoryboardPackageRow key={pkg.id} onAction={onAction} onOpenPackage={onOpenPackage} pkg={pkg} selected={pkg.id === selectedPackageId} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StoryboardPackageRow({
    onAction,
    onOpenPackage,
    pkg,
    selected,
}: {
    onAction: (label: string) => void;
    onOpenPackage: (pkg: StoryboardProductionPackage, tab?: StoryboardPackageDrawerTab) => void;
    pkg: StoryboardProductionPackage;
    selected: boolean;
}) {
    const timeout = pkg.duration > 15 || pkg.status === "超时";
    return (
        <div>
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
