"use client";

import { useState } from "react";
import { Activity, ChevronDown, Clock3, ServerCog } from "lucide-react";

import type { RemoteWorkflowEvent, RemoteWorkflowRunDetail, RemoteWorkflowStageRun, WorkflowWorkerHealth } from "@/services/api/workflow-runs";

type Props = { agentRun: RemoteWorkflowRunDetail["agentRuns"][number] | null; events: RemoteWorkflowEvent[]; floating?: boolean; health: WorkflowWorkerHealth | null; stage: RemoteWorkflowStageRun | null };

export function WorkflowRunConsole(props: Props) {
    const [open, setOpen] = useState(false);
    const status = props.stage ? stageStatusLabel(props.stage.status) : props.health?.ready ? "运行正常" : "待恢复";
    if (props.floating) return <div className="fixed bottom-5 right-5 z-50 hidden w-[300px] xl:block">
        {open ? <aside className="mb-2 flex max-h-[min(620px,70vh)] flex-col overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[color-mix(in_srgb,var(--studio-panel-bg)_88%,transparent)] shadow-[var(--studio-shadow)] backdrop-blur-xl"><ConsoleContent {...props} /></aside> : null}
        <button type="button" className="ml-auto flex h-9 items-center gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[color-mix(in_srgb,var(--studio-panel-bg)_72%,transparent)] px-3 text-xs text-[var(--studio-text-secondary)] shadow-[var(--studio-shadow)] backdrop-blur-xl transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]" onClick={() => setOpen((value) => !value)} aria-expanded={open}><Activity className="size-3.5 text-[var(--studio-accent)]" />{status}<span className="text-[10px] text-[var(--studio-text-muted)]">{props.events.length} 条</span><ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} /></button>
    </div>;
    return <aside className="hidden min-h-0 border-l border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] xl:flex xl:flex-col"><ConsoleContent {...props} /></aside>;
}

function ConsoleContent(props: Props) {
    return <>
        <div className="shrink-0 border-b border-[var(--studio-border-subtle)] px-4 py-3"><div className="text-xs font-semibold">结果与运行控制台</div><div className="mt-1 text-[11px] text-[var(--studio-text-muted)]">任务状态、质量门与安全化日志</div></div>
        <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><ServerCog className="size-4 text-[var(--studio-accent)]" />{props.health?.executorLabel || "工作流执行器"}</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><ConsoleMetric label="队列" value={String(props.health?.queueDepth ?? "—")} /><ConsoleMetric label="运行中" value={String(props.health?.runningCount ?? "—")} /><ConsoleMetric label="心跳" value={props.health?.heartbeatFresh ? "正常" : "待恢复"} /><ConsoleMetric label="文本通道" value={props.health?.textChannelAvailable ? "可用" : "不可用"} /></div></div>
            {props.stage ? <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3"><div className="text-xs font-semibold">当前阶段任务</div><div className="mt-3 space-y-2 text-xs"><InfoLine label="状态" value={stageStatusLabel(props.stage.status)} /><InfoLine label="第几次" value={String(props.stage.attempt)} /><InfoLine label="预计算力点" value={String(props.stage.estimatedCredits || "—")} /><InfoLine label="Skill" value={props.agentRun?.skillVersion ? `${props.agentRun.skillVersion} · ${props.agentRun.skillContentHash.slice(0, 8)}` : "启动时冻结"} /></div></div> : null}
            <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="size-4" />最近运行</div><div className="mt-2 space-y-2">{props.events.slice(-8).reverse().map((event) => <div key={event.cursor} className="border-l border-[var(--studio-border-strong)] pl-2 text-[11px] leading-4 text-[var(--studio-text-secondary)]">{eventLabel(event.type)}<div className="text-[10px] text-[var(--studio-text-muted)]">{new Date(event.createdAt).toLocaleTimeString()}</div></div>)}{!props.events.length ? <div className="py-4 text-center text-xs text-[var(--studio-text-muted)]">暂无运行记录</div> : null}</div></div>
        </div>
    </>;
}

function stageStatusLabel(status: string) { return ({ applied: "已写入", approved: "已通过", blocked: "被阻断", cancel_requested: "停止中", cancelled: "已停止", complete: "已完成", failed: "失败", idle: "未开始", needs_review: "待审核", queued: "排队中", ready: "可开始", rejected: "需修改", running: "进行中" } as Record<string, string>)[status] || status; }
function eventLabel(type: string) { return ({ "stage.approved": "阶段已批准", "stage.applied": "阶段已写入", "stage.cancelled": "阶段已停止", "stage.failed": "阶段执行失败", "stage.needs_review": "产物等待审核", "stage.queued": "阶段已加入队列", "stage.rejected": "产物已退回", "stage.running": "云端开始执行", "workflow.created": "工作流已创建" } as Record<string, string>)[type] || type; }
function ConsoleMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-[var(--studio-panel-muted-bg)] px-2 py-2"><div className="text-[10px] text-[var(--studio-text-muted)]">{label}</div><div className="mt-1 font-medium tabular-nums">{value}</div></div>; }
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><span className="text-[var(--studio-text-muted)]">{label}</span><span className="truncate text-right">{value}</span></div>; }
