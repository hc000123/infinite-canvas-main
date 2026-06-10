"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button } from "antd";

import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { EpisodeStatusPill, episodeToneTextClass, type EpisodeStatusTone } from "./episode-module-panel";

type CanvasHandoffStatus = "未导入" | "待导入" | "已导入" | "缺资产" | "已进入画布" | "已生成" | "已回流";
type CanvasHandoffFilter = "全部" | CanvasHandoffStatus;

type CanvasHandoffShot = {
    id: string;
};

type CanvasHandoffPackage = {
    assetLabels: string[];
    duration: number;
    id: string;
    order: number;
    shots: CanvasHandoffShot[];
    status: string;
    summary: string;
    title: string;
};

export type CanvasHandoffImportTarget = {
    id: string;
    order: number;
    title: string;
};

export type CanvasHandoffStorySegment = {
    order: number;
    packages: CanvasHandoffPackage[];
    title: string;
};

type CanvasHandoffPackageRow = {
    assetState: string;
    canImport: boolean;
    importedNodeCount: number;
    pkg: CanvasHandoffPackage;
    segment: CanvasHandoffStorySegment;
    status: CanvasHandoffStatus;
    tone: EpisodeStatusTone;
};

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

function CanvasHandoffTable({
    onImport,
    onOpenAssets,
    onOpenCanvas,
    onOpenStoryboard,
    onPreview,
    rows,
    selectedPackageId,
}: {
    onImport: (row: CanvasHandoffPackageRow) => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    onPreview: (row: CanvasHandoffPackageRow) => void;
    rows: CanvasHandoffPackageRow[];
    selectedPackageId: string;
}) {
    if (!rows.length) return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的生产包。</div>;
    return (
        <div className="max-h-[calc(100vh-430px)] min-h-[520px] overflow-auto">
            <div className="min-w-[800px]">
                <div className="grid grid-cols-[56px_minmax(150px,1fr)_112px_50px_50px_72px_76px_126px] gap-2 border-b border-slate-800/70 px-5 py-3 text-xs font-medium text-slate-500">
                    <div>生产包</div>
                    <div>内容</div>
                    <div>所属剧情段落</div>
                    <div>时长</div>
                    <div>镜头</div>
                    <div>资产</div>
                    <div>承接状态</div>
                    <div>操作</div>
                </div>
                <div className="divide-y divide-slate-800/80">
                    {rows.map((row) => {
                        const selected = row.pkg.id === selectedPackageId;
                        return (
                            <div
                                key={row.pkg.id}
                                role="button"
                                tabIndex={0}
                                className={`grid grid-cols-[56px_minmax(150px,1fr)_112px_50px_50px_72px_76px_126px] gap-2 border-l-4 px-5 py-4 text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : row.status === "缺资产" ? "border-amber-400/70 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]" : "border-transparent hover:bg-white/[0.025]"}`}
                                onClick={() => onPreview(row)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") onPreview(row);
                                }}
                            >
                                <div className="self-center text-lg font-semibold text-slate-100">P{padEpisodeOrder(row.pkg.order)}</div>
                                <div className="min-w-0 self-center">
                                    <div className="break-words font-semibold text-slate-100">{row.pkg.title}</div>
                                    <div className="mt-1 break-words text-slate-500">{row.status === "已导入" ? `已创建 ${row.importedNodeCount} 个画布节点` : row.pkg.summary}</div>
                                </div>
                                <div className="self-center break-words text-slate-300">
                                    S{padEpisodeOrder(row.segment.order)} · {row.segment.title}
                                </div>
                                <div className="self-center font-semibold text-slate-200">{row.pkg.duration}s</div>
                                <div className="self-center text-slate-300">{row.pkg.shots.length} 镜</div>
                                <div className={`self-center font-semibold ${row.status === "缺资产" ? "text-amber-300" : "text-slate-200"}`}>{row.assetState}</div>
                                <div className="self-center">
                                    <EpisodeStatusPill status={row.status} tone={row.tone} />
                                </div>
                                <div className="flex flex-wrap gap-2 self-center" onClick={(event) => event.stopPropagation()}>
                                    <CanvasHandoffActionButton disabled={!row.canImport} label="导入" primary={row.canImport} onClick={() => onImport(row)} />
                                    <CanvasHandoffActionButton label="预览" onClick={() => onPreview(row)} />
                                    <CanvasHandoffActionButton label="查看画布" onClick={onOpenCanvas} />
                                    {row.status === "缺资产" ? <CanvasHandoffActionButton label="补资产" onClick={onOpenAssets} /> : null}
                                    <CanvasHandoffActionButton label="返回分镜" onClick={onOpenStoryboard} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function CanvasHandoffActionButton({ disabled, label, onClick, primary }: { disabled?: boolean; label: string; onClick: () => void; primary?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${primary ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/20" : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function CanvasHandoffPreviewPanel({
    boundCanvas,
    onCreateCanvas,
    onImport,
    onOpenCanvas,
    onOpenStoryboard,
    row,
}: {
    boundCanvas?: CanvasProject;
    onCreateCanvas: () => void;
    onImport: (row: CanvasHandoffPackageRow) => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    row?: CanvasHandoffPackageRow;
}) {
    if (!row) return <aside className="rounded-2xl border border-slate-800 bg-[#091018]/88 p-5 text-sm text-slate-500">请选择一个生产包查看导入预览。</aside>;
    const allAssetsBound = row.status !== "缺资产" && row.pkg.assetLabels.length > 0;
    return (
        <aside className="rounded-2xl border border-slate-800 bg-[#091018]/92 shadow-[0_18px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-2xl font-semibold text-slate-50">导入预览</h3>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">
                            P{padEpisodeOrder(row.pkg.order)} · {row.pkg.title}
                        </p>
                    </div>
                    <EpisodeStatusPill status={row.status} tone={row.tone} />
                </div>
            </div>
            <div className="grid max-h-[calc(100vh-260px)] gap-5 overflow-auto p-5">
                <CanvasHandoffNodePreview row={row} />
                <div className="rounded-lg border border-slate-800 bg-slate-950/45">
                    {[
                        ["所属段落", `S${padEpisodeOrder(row.segment.order)} · ${row.segment.title}`],
                        ["预计时长", `${row.pkg.duration} 秒`],
                        ["包内镜头", `${row.pkg.shots.length} 个`],
                        ["引用资产", `${row.pkg.assetLabels.length} 项，${allAssetsBound ? "全部已绑定" : "存在缺口"}`],
                        ["承接画布", boundCanvas ? boundCanvas.title : "未创建"],
                        ["导入后", "创建剧本、资产、提示词、配置和结果占位节点"],
                    ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-slate-800 px-4 py-3 text-sm last:border-b-0">
                            <div className="text-slate-500">{label}</div>
                            <div className="break-words font-semibold text-slate-100">{value}</div>
                        </div>
                    ))}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                    <div className="text-sm font-semibold text-slate-100">重要限制</div>
                    <div className="mt-2 break-words text-sm leading-6 text-slate-500">当前页面只负责导入画布节点组和查看承接状态；最终节点检查和视频生成必须进入完整画布后手动完成。</div>
                </div>
            </div>
            <div className="border-t border-slate-800 p-5">
                <div className="grid gap-2">
                    <Button type="primary" disabled={!row.canImport} onClick={() => onImport(row)}>
                        导入 P{padEpisodeOrder(row.pkg.order)} 到画布
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={boundCanvas ? onOpenCanvas : onCreateCanvas}>
                        {boundCanvas ? "进入完整画布" : "先创建承接画布"}
                    </Button>
                    <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" onClick={onOpenStoryboard}>
                        返回分镜生产包
                    </Button>
                </div>
            </div>
        </aside>
    );
}

function CanvasHandoffNodePreview({ row }: { row: CanvasHandoffPackageRow }) {
    const nodes = [
        { className: "left-[6%] top-[12%] border-cyan-400/45 bg-cyan-400/[0.08]", label: "原剧本", sub: "片段节点" },
        { className: "left-[38%] top-[38%] border-amber-400/45 bg-amber-400/[0.07]", label: "引用资产", sub: `${row.pkg.assetLabels.length || 1} 项` },
        { className: "right-[7%] top-[62%] border-emerald-400/45 bg-emerald-400/[0.07]", label: "提示词 + 配置", sub: "待画布检查" },
        { className: "left-[10%] bottom-[12%] border-slate-500/45 bg-slate-400/[0.04]", label: "结果占位", sub: "生成后回流" },
    ];
    return (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#050a0f]">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">导入后会创建的画布节点</div>
            <div className="relative h-64 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:28px_28px]">
                <div className="absolute left-[27%] top-[26%] h-px w-[29%] rotate-[20deg] bg-cyan-400/30" />
                <div className="absolute left-[58%] top-[52%] h-px w-[26%] rotate-[24deg] bg-cyan-400/30" />
                <div className="absolute left-[20%] top-[58%] h-px w-[28%] -rotate-[28deg] bg-cyan-400/20" />
                {nodes.map((node) => (
                    <div key={node.label} className={`absolute w-32 rounded-lg border px-3 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.24)] ${node.className}`}>
                        <div className="text-sm font-semibold text-slate-100">{node.label}</div>
                        <div className="mt-1 text-xs text-slate-400">{node.sub}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function buildCanvasHandoffRows({ boundCanvas, segments }: { boundCanvas?: CanvasProject; segments: CanvasHandoffStorySegment[] }): CanvasHandoffPackageRow[] {
    return segments.flatMap((segment) =>
        segment.packages.map((pkg) => {
            const assetMissing = pkg.status === "缺资产" || !pkg.assetLabels.length;
            const confirmed = pkg.status === "已确认" || pkg.status === "待承接";
            const importedNodeCount = countImportedCanvasPackageNodes(boundCanvas, pkg.order);
            let status: CanvasHandoffStatus = "未导入";
            if (assetMissing) status = "缺资产";
            else if (importedNodeCount) status = "已导入";
            else if (confirmed) status = "待导入";
            return {
                assetState: assetMissing ? "缺 1" : `${pkg.assetLabels.length} 项已绑定`,
                canImport: Boolean(boundCanvas) && status === "待导入",
                importedNodeCount,
                pkg,
                segment,
                status,
                tone: canvasHandoffTone(status),
            };
        }),
    );
}

function countImportedCanvasPackageNodes(boundCanvas: CanvasProject | undefined, packageOrder: number) {
    if (!boundCanvas) return 0;
    const previewItemId = `video_node-${packageOrder}`;
    return boundCanvas.nodes.filter((node) => node.metadata?.workflowSource?.previewItemId === previewItemId).length;
}

function summarizeCanvasHandoffRows(rows: CanvasHandoffPackageRow[], boundCanvas?: CanvasProject) {
    return {
        canvasCount: boundCanvas ? 1 : 0,
        confirmed: rows.filter((row) => row.pkg.status === "已确认" || row.pkg.status === "待承接").length,
        imported: rows.filter((row) => ["已导入", "已进入画布", "已生成", "已回流"].includes(row.status)).length,
        missingAssets: rows.filter((row) => row.status === "缺资产").length,
        pending: rows.filter((row) => row.status === "待导入").length,
    };
}

function filterCanvasHandoffRow(row: CanvasHandoffPackageRow, filter: CanvasHandoffFilter) {
    if (filter === "全部") return true;
    return row.status === filter;
}

function canvasHandoffTone(status: CanvasHandoffStatus): EpisodeStatusTone {
    if (status === "已回流" || status === "已生成" || status === "已进入画布" || status === "已导入") return "green";
    if (status === "待导入") return "cyan";
    if (status === "缺资产") return "amber";
    return "slate";
}

function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}
