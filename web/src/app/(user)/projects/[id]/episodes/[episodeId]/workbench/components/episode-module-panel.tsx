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
    runningPreview?: { body?: string; lines: string[]; title: string };
    subtitle: string;
    summary: Array<{ label: string; tone?: EpisodeStatusTone; value: string }>;
    title: string;
};

export function EpisodeModulePanel({
    activeFilter,
    config,
    editorSlot,
    filteredRows,
    showRows = true,
    onFilterChange,
    onOpenDetail,
}: {
    activeFilter: string;
    config: EpisodeModuleConfig;
    editorSlot?: ReactNode;
    filteredRows: EpisodeModuleRow[];
    showRows?: boolean;
    onFilterChange: (filter: string) => void;
    onOpenDetail: (record: EpisodeDetailRecord) => void;
}) {
    return (
        <section className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)] backdrop-blur-xl">
            <div className="grid gap-4 border-b border-[var(--studio-border-subtle)] px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-[var(--studio-text-primary)]">{config.title}</h2>
                    <p className="mt-1 break-words text-sm leading-6 text-[var(--studio-text-muted)]">{config.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {config.actions.map((action) => (
                        <Button
                            key={action.label}
                            className="!rounded-md"
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
                <div className="grid gap-2.5 md:grid-cols-4">
                    {config.summary.map((item) => (
                        <div key={item.label} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-4 py-3">
                            <div className="text-xs text-[var(--studio-text-muted)]">{item.label}</div>
                            <div className={`mt-1 break-words text-2xl font-semibold ${episodeToneTextClass(item.tone || "slate")}`}>{item.value}</div>
                        </div>
                    ))}
                </div>
                {editorSlot}
                {config.runningPreview ? <EpisodeRunningPreview preview={config.runningPreview} /> : null}
                {showRows ? (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                                {config.filters.map((filter) => (
                                    <button
                                        key={filter}
                                        type="button"
                                        className={`rounded-md border px-3 py-1.5 text-sm transition ${activeFilter === filter ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] text-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-[var(--studio-text-muted)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"}`}
                                        onClick={() => onFilterChange(filter)}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                            <div className="text-sm text-[var(--studio-text-muted)]">当前显示 {filteredRows.length} 条</div>
                        </div>
                        <EpisodeDenseTable columns={config.columns} emptyText={config.emptyText} headers={config.headers} onOpenDetail={onOpenDetail} rows={filteredRows} />
                    </>
                ) : null}
            </div>
        </section>
    );
}

function EpisodeRunningPreview({ preview }: { preview: NonNullable<EpisodeModuleConfig["runningPreview"]> }) {
    return (
        <div className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--studio-accent)]">
                <span className="size-2 animate-pulse rounded-full bg-[var(--studio-accent)]" />
                {preview.title}
            </div>
            {preview.body ? (
                <pre className="thin-scrollbar max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-4 py-3 text-sm leading-7 text-[var(--studio-text-secondary)]">{preview.body}</pre>
            ) : (
                <div className="grid gap-2">
                    {preview.lines.map((line, index) => (
                        <div key={`${line}-${index}`} className="flex gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-2 text-sm leading-6 text-[var(--studio-text-secondary)]">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--studio-active-bg)] text-xs font-semibold text-[var(--studio-accent)]">{index + 1}</span>
                            <span className="break-words">{line}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function EpisodeDenseTable({ columns, emptyText, headers, onOpenDetail, rows }: { columns: string; emptyText: string; headers: string[]; onOpenDetail: (record: EpisodeDetailRecord) => void; rows: EpisodeModuleRow[] }) {
    const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
    if (!rows.length) {
        return <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-5 py-10 text-center text-sm text-[var(--studio-text-muted)]">{emptyText}</div>;
    }
    return (
        <div className="overflow-x-auto rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
            <div className="min-w-[860px]">
                <div className="grid gap-4 border-b border-[var(--studio-border-subtle)] px-4 py-3 text-sm font-medium text-[var(--studio-text-muted)]" style={{ gridTemplateColumns: columns }}>
                    {headers.map((header) => (
                        <div key={header}>{header}</div>
                    ))}
                </div>
                <div className="divide-y divide-[var(--studio-border-subtle)]">
                    {rows.map((row) => {
                        const expanded = Boolean(expandedRowIds[row.id]);
                        const expandable = row.cells.some(isLongTableCell);
                        return (
                            <div key={row.id} className={`grid gap-4 px-4 py-3 text-sm transition ${row.highlight ? "border-l-4 border-[var(--studio-accent)] bg-[var(--studio-active-bg)]" : "border-l-4 border-transparent hover:bg-[var(--studio-hover-bg)]"}`} style={{ gridTemplateColumns: columns }}>
                                {row.cells.map((cell, index) => (
                                    <div key={index} className={`min-w-0 ${expanded ? "self-start" : "self-center"}`}>
                                        <div className={`break-words whitespace-pre-wrap leading-6 text-[var(--studio-text-secondary)] ${expanded ? "" : "max-h-[4.5rem] overflow-hidden"}`}>{cell}</div>
                                        {expandable && index === 1 ? (
                                            <button type="button" className="mt-1 block text-xs font-medium text-[var(--studio-accent)] transition hover:text-[var(--studio-accent-hover)]" onClick={() => setExpandedRowIds((current) => ({ ...current, [row.id]: !expanded }))}>
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
                                    className={`${expanded ? "self-start" : "self-center"} rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-3 py-1.5 text-sm font-medium text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]`}
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
    return <span className={`studio-semantic-tag inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${episodeToneSemanticClass(tone)}`}>{status}</span>;
}

export function EpisodeDetailDrawer({ onClose, record }: { onClose: () => void; record: EpisodeDetailRecord | null }) {
    return (
        <Drawer
            rootClassName="studio-modal"
            className="[&_.ant-drawer-close]:!text-[var(--studio-text-secondary)]"
            open={Boolean(record)}
            title={<span className="text-[var(--studio-text-primary)]">{record?.title || "详情"}</span>}
            size={620}
            onClose={onClose}
            styles={{
                body: { background: "var(--studio-elevated-bg)", color: "var(--studio-text-primary)" },
                header: { background: "var(--studio-elevated-bg)", borderBottom: "1px solid var(--studio-border-subtle)" },
                section: { background: "var(--studio-elevated-bg)" },
            }}
        >
            {record ? (
                <div className="grid gap-4 text-[var(--studio-text-secondary)]">
                    {record.subtitle ? <div className="break-words text-sm leading-6 text-[var(--studio-text-muted)]">{record.subtitle}</div> : null}
                    {record.meta?.length ? (
                        <div className="grid gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                            {record.meta.map((item) => (
                                <div key={item.label} className="grid gap-2 text-sm sm:grid-cols-[110px_minmax(0,1fr)]">
                                    <div className="text-[var(--studio-text-muted)]">{item.label}</div>
                                    <div className="break-words text-[var(--studio-text-secondary)]">{item.value}</div>
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
            <div className="h-1.5 flex-1 rounded-full bg-[var(--studio-panel-muted-bg)]">
                <div className="h-full rounded-full bg-[var(--studio-accent)]" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
            </div>
            <span className="text-xs text-[var(--studio-text-muted)]">{label}</span>
        </div>
    );
}

export function episodeToneTextClass(tone: EpisodeStatusTone) {
    const classes: Record<EpisodeStatusTone, string> = {
        amber: "text-[var(--studio-warning)]",
        cyan: "text-[var(--studio-accent)]",
        green: "text-[var(--studio-success)]",
        red: "text-[var(--studio-danger)]",
        slate: "text-[var(--studio-text-primary)]",
    };
    return classes[tone];
}

export function episodeToneSemanticClass(tone: EpisodeStatusTone) {
    const classes: Record<EpisodeStatusTone, string> = {
        amber: "studio-semantic-warning",
        cyan: "studio-semantic-info",
        green: "studio-semantic-success",
        red: "studio-semantic-danger",
        slate: "studio-semantic-neutral",
    };
    return classes[tone];
}
