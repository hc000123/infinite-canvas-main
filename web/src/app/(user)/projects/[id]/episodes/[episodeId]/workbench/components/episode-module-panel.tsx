"use client";

import { useState, type ReactNode } from "react";
import { Button, Drawer } from "antd";

import { EpisodeDetailBody } from "./episode-detail-body";

export type EpisodeDetailRecord = {
    action?: EpisodeModuleAction;
    body: string;
    meta?: Array<{ label: string; value: string }>;
    subtitle?: string;
    title: string;
};

export type EpisodeStatusTone = "cyan" | "green" | "amber" | "red" | "slate";

export type EpisodeModuleAction = {
    danger?: boolean;
    disabled?: boolean;
    label: string;
    loading?: boolean;
    onClick: () => void;
    primary?: boolean;
};

export type EpisodeModuleRow = {
    actionLabel: string;
    cells: ReactNode[];
    detail: EpisodeDetailRecord;
    highlight?: boolean;
    id: string;
    onAction?: () => void;
    status: string;
    tone?: EpisodeStatusTone;
};

export type EpisodeModuleConfig = {
    actions: EpisodeModuleAction[];
    columns: string;
    emptyText: string;
    filters: string[];
    headers: string[];
    notice?: { actionLabel?: string; onAction?: () => void; text: string; title: string; tone?: EpisodeStatusTone };
    rows: EpisodeModuleRow[];
    runningPreview?: { lines: string[]; title: string };
    subtitle: string;
    summary: Array<{ label: string; tone?: EpisodeStatusTone; value: string }>;
    title: string;
};

export function EpisodeModulePanel({
    activeFilter,
    config,
    editorSlot,
    filteredRows,
    onFilterChange,
    onOpenDetail,
}: {
    activeFilter: string;
    config: EpisodeModuleConfig;
    editorSlot?: ReactNode;
    filteredRows: EpisodeModuleRow[];
    onFilterChange: (filter: string) => void;
    onOpenDetail: (record: EpisodeDetailRecord) => void;
}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#091018]/82 shadow-[0_18px_80px_rgba(0,0,0,0.28)]">
            <div className="grid gap-4 border-b border-slate-800 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-slate-50">{config.title}</h2>
                    <p className="mt-1 break-words text-sm leading-6 text-slate-500">{config.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {config.actions.map((action) => (
                        <Button
                            key={action.label}
                            className={action.primary || action.danger ? "" : "!border-slate-700 !bg-slate-950/55 !text-slate-200 hover:!border-cyan-500/70 hover:!text-cyan-100"}
                            danger={action.danger}
                            type={action.primary ? "primary" : "default"}
                            disabled={action.disabled}
                            loading={action.loading}
                            onClick={action.onClick}
                        >
                            {action.label}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="grid gap-4 p-5">
                {config.notice ? <EpisodeFlowNotice notice={config.notice} /> : null}
                <div className="grid gap-3 md:grid-cols-4">
                    {config.summary.map((item) => (
                        <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                            <div className="text-xs text-slate-500">{item.label}</div>
                            <div className={`mt-1 break-words text-2xl font-semibold ${episodeToneTextClass(item.tone || "slate")}`}>{item.value}</div>
                        </div>
                    ))}
                </div>
                {editorSlot}
                {config.runningPreview ? <EpisodeRunningPreview preview={config.runningPreview} /> : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                        {config.filters.map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                className={`rounded-md border px-3 py-1.5 text-sm transition ${activeFilter === filter ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/35 text-slate-500 hover:text-slate-200"}`}
                                onClick={() => onFilterChange(filter)}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                    <div className="text-sm text-slate-500">当前显示 {filteredRows.length} 条</div>
                </div>
                <EpisodeDenseTable columns={config.columns} emptyText={config.emptyText} headers={config.headers} onOpenDetail={onOpenDetail} rows={filteredRows} />
            </div>
        </section>
    );
}

function EpisodeFlowNotice({ notice }: { notice: NonNullable<EpisodeModuleConfig["notice"]> }) {
    const toneClass: Record<EpisodeStatusTone, string> = {
        amber: "border-amber-400/35 bg-amber-400/10 text-amber-100",
        cyan: "border-cyan-400/35 bg-cyan-400/10 text-cyan-100",
        green: "border-emerald-400/35 bg-emerald-400/10 text-emerald-100",
        red: "border-rose-400/40 bg-rose-400/10 text-rose-100",
        slate: "border-slate-700 bg-slate-900/60 text-slate-200",
    };
    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${toneClass[notice.tone || "slate"]}`}>
            <div className="min-w-0">
                <div className="text-sm font-semibold">{notice.title}</div>
                <div className="mt-1 break-words text-sm leading-6 opacity-85">{notice.text}</div>
            </div>
            {notice.actionLabel && notice.onAction ? (
                <Button className="!border-current !bg-transparent !text-current hover:!bg-white/10" onClick={notice.onAction}>
                    {notice.actionLabel}
                </Button>
            ) : null}
        </div>
    );
}

function EpisodeRunningPreview({ preview }: { preview: NonNullable<EpisodeModuleConfig["runningPreview"]> }) {
    return (
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.07] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-100">
                <span className="size-2 animate-pulse rounded-full bg-cyan-300" />
                {preview.title}
            </div>
            <div className="grid gap-2">
                {preview.lines.map((line, index) => (
                    <div key={`${line}-${index}`} className="flex gap-3 rounded-lg border border-cyan-400/10 bg-slate-950/35 px-3 py-2 text-sm leading-6 text-slate-300">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/12 text-xs font-semibold text-cyan-100">{index + 1}</span>
                        <span className="break-words">{line}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EpisodeDenseTable({ columns, emptyText, headers, onOpenDetail, rows }: { columns: string; emptyText: string; headers: string[]; onOpenDetail: (record: EpisodeDetailRecord) => void; rows: EpisodeModuleRow[] }) {
    const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
    if (!rows.length) {
        return <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-5 py-10 text-center text-sm text-slate-500">{emptyText}</div>;
    }
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#070d13]/90">
            <div className="min-w-[860px]">
                <div className="grid gap-4 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-500" style={{ gridTemplateColumns: columns }}>
                    {headers.map((header) => (
                        <div key={header}>{header}</div>
                    ))}
                </div>
                <div className="divide-y divide-slate-800/90">
                    {rows.map((row) => {
                        const expanded = Boolean(expandedRowIds[row.id]);
                        const expandable = row.cells.some(isLongTableCell);
                        return (
                            <div key={row.id} className={`grid gap-4 px-4 py-3 text-sm ${row.highlight ? "border-l-4 border-cyan-300 bg-cyan-400/[0.08]" : "border-l-4 border-transparent hover:bg-white/[0.025]"}`} style={{ gridTemplateColumns: columns }}>
                                {row.cells.map((cell, index) => (
                                    <div key={index} className={`min-w-0 ${expanded ? "self-start" : "self-center"}`}>
                                        <div className={`break-words whitespace-pre-wrap leading-6 text-slate-200 ${expanded ? "" : "max-h-[4.5rem] overflow-hidden"}`}>{cell}</div>
                                        {expandable && index === 1 ? (
                                            <button type="button" className="mt-1 block text-xs font-medium text-cyan-300 hover:text-cyan-100" onClick={() => setExpandedRowIds((current) => ({ ...current, [row.id]: !expanded }))}>
                                                {expanded ? "收起内容" : "展开内容"}
                                            </button>
                                        ) : null}
                                    </div>
                                ))}
                                <div className={expanded ? "self-start" : "self-center"}>
                                    <EpisodeStatusPill status={row.status} tone={row.tone || "slate"} />
                                </div>
                                <button
                                    type="button"
                                    className={`${expanded ? "self-start" : "self-center"} rounded-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100`}
                                    onClick={row.onAction || (() => onOpenDetail(row.detail))}
                                >
                                    {row.actionLabel}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function isLongTableCell(cell: ReactNode) {
    return typeof cell === "string" && (cell.length > 90 || cell.includes("\n"));
}

export function EpisodeStatusPill({ status, tone = "slate" }: { status: string; tone?: EpisodeStatusTone }) {
    const toneClass: Record<EpisodeStatusTone, string> = {
        amber: "border-amber-400/45 bg-amber-400/10 text-amber-200",
        cyan: "border-cyan-400/55 bg-cyan-400/12 text-cyan-100",
        green: "border-emerald-400/45 bg-emerald-400/10 text-emerald-200",
        red: "border-rose-400/45 bg-rose-400/10 text-rose-200",
        slate: "border-slate-700 bg-slate-900/70 text-slate-300",
    };
    return <span className={`inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}>{status}</span>;
}

export function EpisodeDetailDrawer({ onClose, record }: { onClose: () => void; record: EpisodeDetailRecord | null }) {
    return (
        <Drawer
            className="[&_.ant-drawer-close]:!text-slate-300"
            open={Boolean(record)}
            title={<span className="text-slate-100">{record?.title || "详情"}</span>}
            size={620}
            onClose={onClose}
            styles={{
                body: { background: "#061018", color: "#cbd5e1" },
                header: { background: "#061018", borderBottom: "1px solid rgba(148,163,184,0.2)" },
                section: { background: "#061018" },
            }}
        >
            {record ? (
                <div className="grid gap-4 text-slate-200">
                    {record.subtitle ? <div className="break-words text-sm leading-6 text-slate-500">{record.subtitle}</div> : null}
                    {record.meta?.length ? (
                        <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                            {record.meta.map((item) => (
                                <div key={item.label} className="grid gap-2 text-sm sm:grid-cols-[110px_minmax(0,1fr)]">
                                    <div className="text-slate-500">{item.label}</div>
                                    <div className="break-words text-slate-200">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <EpisodeDetailBody body={record.body} />
                    {record.action ? (
                        <Button
                            className="w-fit"
                            type={record.action.primary ? "primary" : "default"}
                            disabled={record.action.disabled}
                            loading={record.action.loading}
                            onClick={() => {
                                record.action?.onClick();
                                onClose();
                            }}
                        >
                            {record.action.label}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </Drawer>
    );
}

export function EpisodeProgress({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
            </div>
            <span className="text-xs text-slate-400">{label}</span>
        </div>
    );
}

export function episodeToneTextClass(tone: EpisodeStatusTone) {
    const classes: Record<EpisodeStatusTone, string> = {
        amber: "text-amber-200",
        cyan: "text-cyan-100",
        green: "text-emerald-200",
        red: "text-rose-200",
        slate: "text-slate-100",
    };
    return classes[tone];
}
