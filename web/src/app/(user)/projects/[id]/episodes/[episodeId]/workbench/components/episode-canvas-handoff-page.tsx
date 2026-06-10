"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button } from "antd";

import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { CanvasHandoffPreviewPanel, CanvasHandoffTable } from "./episode-canvas-handoff-components";
import { episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";
import {
    buildCanvasHandoffRows,
    filterCanvasHandoffRow,
    padEpisodeOrder,
    summarizeCanvasHandoffRows,
    type CanvasHandoffFilter,
    type CanvasHandoffImportTarget,
    type CanvasHandoffPackageRow,
    type CanvasHandoffStorySegment,
} from "./episode-canvas-handoff-utils";

export function EpisodeCanvasHandoffPage({
    boundCanvas,
    episode,
    onCreateCanvas,
    onImportPackage,
    onOpenAssets,
    onOpenCanvas,
    onOpenStoryboard,
    projectTitle,
    segments,
}: {
    boundCanvas?: CanvasProject;
    episode: ScriptEpisode;
    onCreateCanvas: () => void;
    onImportPackage: (pkg: CanvasHandoffImportTarget) => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    projectTitle: string;
    segments: CanvasHandoffStorySegment[];
}) {
    const { message } = App.useApp();
    const [filter, setFilter] = useState<CanvasHandoffFilter>("全部");
    const rows = useMemo(() => buildCanvasHandoffRows({ boundCanvas, segments }), [boundCanvas, segments]);
    const [selectedPackageId, setSelectedPackageId] = useState("");
    const filteredRows = useMemo(() => rows.filter((row) => filterCanvasHandoffRow(row, filter)), [filter, rows]);
    const preferredFilteredRow = filteredRows.find((row) => row.canImport) || filteredRows[0];
    const selectedRow = rows.find((row) => row.pkg.id === selectedPackageId) || preferredFilteredRow || rows.find((row) => row.canImport) || rows[0];
    const summary = summarizeCanvasHandoffRows(rows, boundCanvas);

    useEffect(() => {
        if (!rows.length) {
            setSelectedPackageId("");
            return;
        }
        if (!selectedRow || !filterCanvasHandoffRow(selectedRow, filter)) setSelectedPackageId(preferredFilteredRow?.pkg.id || rows[0].pkg.id);
    }, [filter, filteredRows, preferredFilteredRow, rows, selectedRow]);

    const importPackage = (row?: CanvasHandoffPackageRow) => {
        if (!row) return;
        if (!boundCanvas) {
            message.info("请先创建承接画布，再导入生产包节点组。");
            onCreateCanvas();
            return;
        }
        if (!row.canImport) {
            message.warning(row.status === "缺资产" ? "当前生产包缺资产，请先补齐资产后再导入。" : "只有已确认且资产完整的生产包可以导入。");
            return;
        }
        onImportPackage({ id: row.pkg.id, order: row.pkg.order, title: row.pkg.title });
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
                        <span className="text-cyan-300">画布承接</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">{episode.title} · 画布承接</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">将已确认的 15 秒生产包导入画布节点组，进入完整画布后再逐一检查节点、资产、提示词和配置。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100" onClick={onCreateCanvas}>
                        创建新承接画布
                    </Button>
                    <Button type="primary" disabled={!selectedRow?.canImport} onClick={() => importPackage(selectedRow)}>
                        导入选中生产包
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
                {[
                    { label: "1. 确认生产包", text: "分镜生产包页面完成审核", tone: "green" },
                    { active: true, label: "2. 导入到画布", text: "创建节点后自动进入画布", tone: "cyan" },
                    { label: "3. 进入完整画布", text: "聚焦新节点检查链路", tone: "slate" },
                    { label: "4. 在画布生成", text: "确认后手动触发视频任务", tone: "slate" },
                    { label: "5. 结果回流", text: "写入项目资产库并追踪来源", tone: "slate" },
                ].map((step) => (
                    <div
                        key={step.label}
                        className={`rounded-lg border px-4 py-3 transition ${step.active ? "border-cyan-400/70 bg-cyan-400/12 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]" : step.tone === "green" ? "border-emerald-500/35 bg-emerald-500/[0.06]" : "border-slate-800 bg-slate-950/45"}`}
                    >
                        <div className={`text-sm font-semibold ${episodeToneTextClass(step.tone as EpisodeStatusTone)}`}>{step.label}</div>
                        <div className="mt-2 break-words text-xs leading-5 text-slate-500">{step.text}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                {[
                    { label: "已确认生产包", value: summary.confirmed, tone: "green" },
                    { label: "已导入", value: summary.imported, tone: summary.imported ? "green" : "slate" },
                    { label: "待导入", value: summary.pending, tone: summary.pending ? "cyan" : "slate" },
                    { label: "缺资产", value: summary.missingAssets, tone: summary.missingAssets ? "amber" : "green" },
                    { label: "承接画布", value: summary.canvasCount, tone: summary.canvasCount ? "green" : "amber" },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${episodeToneTextClass(item.tone as EpisodeStatusTone)}`}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_450px]">
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/88">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                        <h3 className="text-lg font-semibold text-slate-50">生产包导入状态</h3>
                        <div className="flex flex-wrap gap-2">
                            {(["全部", "待导入", "已导入", "缺资产", "已进入画布", "已生成", "已回流"] as CanvasHandoffFilter[]).map((item) => (
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
                    <CanvasHandoffTable
                        rows={filteredRows}
                        selectedPackageId={selectedRow?.pkg.id || ""}
                        onImport={importPackage}
                        onOpenAssets={onOpenAssets}
                        onOpenCanvas={onOpenCanvas}
                        onOpenStoryboard={onOpenStoryboard}
                        onPreview={(row) => setSelectedPackageId(row.pkg.id)}
                    />
                </div>
                <CanvasHandoffPreviewPanel boundCanvas={boundCanvas} row={selectedRow} onCreateCanvas={onCreateCanvas} onImport={importPackage} onOpenCanvas={onOpenCanvas} onOpenStoryboard={onOpenStoryboard} />
            </div>
        </section>
    );
}
