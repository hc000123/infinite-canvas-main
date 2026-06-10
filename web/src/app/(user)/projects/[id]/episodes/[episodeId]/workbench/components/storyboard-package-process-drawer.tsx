"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "antd";

import type { StoryboardProductionPackage, StoryboardStorySegment } from "../storyboard-production-segments";
import { EpisodeStatusPill } from "./episode-module-panel";
import { type StoryboardPackageDrawerTab, padEpisodeOrder } from "./episode-storyboard-package-utils";

export function StoryboardPackageProcessDrawer({
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
    segment?: StoryboardStorySegment;
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
                {activeTab === "shots" ? <StoryboardPackageShotsTab onAction={onAction} pkg={pkg} /> : null}
                {activeTab === "script" ? <StoryboardPackageScriptTab pkg={pkg} segment={segment} /> : null}
                {activeTab === "prompt" ? <StoryboardPackagePromptTab onAction={onAction} onGeneratePreview={onGeneratePreview} pkg={pkg} promptDraft={promptDraft} setPromptDraft={setPromptDraft} /> : null}
                {activeTab === "assets" ? <StoryboardPackageAssetsTab onAction={onAction} onOpenAssets={onOpenAssets} onOpenCanvas={onOpenCanvas} pkg={pkg} /> : null}
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

function StoryboardPackageShotsTab({ onAction, pkg }: { onAction: (label: string) => void; pkg: StoryboardProductionPackage }) {
    return (
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
    );
}

function StoryboardPackageScriptTab({ pkg, segment }: { pkg: StoryboardProductionPackage; segment?: StoryboardStorySegment }) {
    return (
        <div className="grid gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="text-xs font-semibold text-slate-500">对应原剧本内容</div>
                <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-cyan-500/25 bg-cyan-400/[0.05] p-4 text-sm leading-7 text-slate-100">{pkg.scriptText || segment?.scriptText || "暂无原剧本片段。"}</div>
            </div>
            <div className="text-sm leading-6 text-slate-500">原剧本只用于查看和定位，不在生产包抽屉内直接修改。</div>
        </div>
    );
}

function StoryboardPackagePromptTab({
    onAction,
    onGeneratePreview,
    pkg,
    promptDraft,
    setPromptDraft,
}: {
    onAction: (label: string) => void;
    onGeneratePreview: () => void;
    pkg: StoryboardProductionPackage;
    promptDraft: string;
    setPromptDraft: (value: string) => void;
}) {
    return (
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
    );
}

function StoryboardPackageAssetsTab({ onAction, onOpenAssets, onOpenCanvas, pkg }: { onAction: (label: string) => void; onOpenAssets: () => void; onOpenCanvas: () => void; pkg: StoryboardProductionPackage }) {
    return (
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
    );
}
