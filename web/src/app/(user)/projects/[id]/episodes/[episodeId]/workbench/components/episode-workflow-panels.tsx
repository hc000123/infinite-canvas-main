"use client";

import { Button, Tag } from "antd";

import type { WorkflowRequiredReading } from "../../../../../workflow-quality-gates";
import type { AgentWorkflowMappingPreview, AgentWorkflowStageState } from "../../../../../agent-runner-types";
import { workflowStageStatusLabel, type AgentWorkflowDisplayStatus } from "../../../../../agent-runner-workflow-display";
import { episodeModuleNavToneClass, previewActionLabel, previewApplyDisabledReason, previewCounts, previewTypeName, type EpisodeModuleKey, type EpisodeModuleNavStatus } from "../episode-workbench-display";

export function EpisodeModuleTabs({ activeModule, onChange, tabs }: { activeModule: EpisodeModuleKey; onChange: (module: EpisodeModuleKey) => void; tabs: Array<{ key: EpisodeModuleKey; label: string; status: EpisodeModuleNavStatus; step: number }> }) {
    return (
        <nav className="grid content-start gap-1.5 rounded-xl border border-slate-800 bg-slate-950/35 p-2">
            {tabs.map((tab) => {
                const active = tab.key === activeModule;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        className={`rounded-lg border px-3 py-2.5 text-left transition ${active ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]" : "border-transparent bg-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-950/45 hover:text-slate-100"}`}
                        onClick={() => onChange(tab.key)}
                        title={tab.status.detail || tab.status.text}
                    >
                        <span className="flex items-center gap-2">
                            <span className={`grid size-6 shrink-0 place-items-center rounded-md border text-xs font-semibold ${active ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100" : "border-slate-700 bg-slate-900/70 text-slate-400"}`}>
                                {tab.step}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-base font-semibold">{tab.label}</span>
                        </span>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${episodeModuleNavToneClass(tab.status.tone)}`}>{tab.status.text}</span>
                    </button>
                );
            })}
        </nav>
    );
}

export function PreviewList({
    previews,
    appliedPreviewItemIds,
    applyingPreviewIds,
    hasCanvas,
    onApplyPreview,
}: {
    previews: AgentWorkflowMappingPreview[];
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    hasCanvas: boolean;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
}) {
    return (
        <div className="grid gap-2 rounded-lg border border-dashed border-teal-500/35 bg-teal-700/5 p-3 dark:border-teal-200/25 dark:bg-teal-200/5">
            {previews.map((preview) => {
                const counts = previewCounts(preview, appliedPreviewItemIds);
                const disabledReason = previewApplyDisabledReason(preview, counts.pending, hasCanvas);
                return (
                    <div key={preview.previewId} className="studio-panel-muted p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0">{previewTypeName(preview.targetType)}</Tag>
                            <span className="font-medium">{preview.title}</span>
                            <Tag className="m-0">待写入 {counts.pending}</Tag>
                            <Tag className="m-0" color={counts.applied ? "green" : undefined}>
                                已写入 {counts.applied}
                            </Tag>
                            <Button size="small" type="primary" disabled={Boolean(disabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyPreview(preview)}>
                                {previewActionLabel(preview.targetType)}
                            </Button>
                        </div>
                        <div className="mt-1 text-stone-600 dark:text-stone-300">{preview.summary}</div>
                        {preview.warnings.length ? <div className="mt-1 text-amber-600">提示：{preview.warnings.join("；")}</div> : null}
                        {disabledReason ? <div className="mt-1 text-stone-500">{disabledReason}</div> : null}
                        <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-stone-500">映射字段 / 流程追溯</summary>
                            <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-50">{JSON.stringify(preview, null, 2)}</pre>
                        </details>
                    </div>
                );
            })}
        </div>
    );
}

export function StageReadingList({ requiredReadings, readingRecords }: { requiredReadings: WorkflowRequiredReading[]; readingRecords: AgentWorkflowStageState["readingRecords"] }) {
    if (!requiredReadings.length) return null;
    return (
        <div className="studio-panel-muted p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-stone-500">规范读取清单</div>
                <div className="text-xs text-stone-500">这些文件 / 规范需要在运行或审核本阶段前确认读过。</div>
            </div>
            <div className="grid gap-1.5">
                {requiredReadings.map((reading) => {
                    const record = readingRecords.find((item) => (item.readingId ? item.readingId === reading.readingId : item.sourceFile === reading.sourceFile));
                    const isRead = record?.status === "read";
                    return (
                        <div key={reading.readingId} className="grid gap-2 rounded-md border border-stone-950/10 bg-white/45 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.035] md:grid-cols-[auto_auto_minmax(0,1fr)] md:items-start">
                            <Tag className="m-0 w-fit" color={isRead ? "green" : "red"}>
                                {isRead ? "已读" : "未读"}
                            </Tag>
                            <Tag className="m-0 w-fit">{readingSourceTypeLabel(reading.sourceType)}</Tag>
                            <div className="min-w-0">
                                <div className="font-medium text-stone-800 dark:text-stone-100">{reading.label}</div>
                                <div className="mt-1 break-all font-mono text-[11px] leading-5 text-stone-500">{reading.sourceFile}</div>
                                {reading.note ? <div className="mt-1 text-stone-500">{reading.note}</div> : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function InfoBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="studio-panel-muted p-3 text-sm">
            <div className="mb-1 text-xs text-stone-500">{label}</div>
            <div className="leading-6">{value}</div>
        </div>
    );
}

export function StatusTag({ status }: { status: AgentWorkflowDisplayStatus }) {
    const color = status === "approved" ? "green" : status === "review" ? "blue" : status === "running" ? "processing" : status === "rejected" || status === "error" ? "red" : status === "blocked" || status === "partial" ? "orange" : undefined;
    return (
        <Tag className="m-0" color={color}>
            {workflowStageStatusLabel(status)}
        </Tag>
    );
}

function readingSourceTypeLabel(type: WorkflowRequiredReading["sourceType"]) {
    const labels: Record<WorkflowRequiredReading["sourceType"], string> = {
        agent: "Agent",
        skill: "Skill",
        template: "模板",
        example: "示例",
        tool: "工具",
        rule: "规则",
    };
    return labels[type];
}
