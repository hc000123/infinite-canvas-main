import { Clock3, ServerCog } from "lucide-react";

import type { RemoteWorkflowEvent, RemoteWorkflowRunDetail, RemoteWorkflowStageRun, WorkflowWorkerHealth } from "@/services/api/workflow-runs";

export function WorkflowRunConsole(props: { agentRun: RemoteWorkflowRunDetail["agentRuns"][number] | null; events: RemoteWorkflowEvent[]; health: WorkflowWorkerHealth | null; stage: RemoteWorkflowStageRun | null }) {
    return (
        <aside className="hidden min-h-0 border-l border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] xl:flex xl:flex-col">
            <div className="shrink-0 border-b border-[var(--studio-border-subtle)] px-4 py-3">
                <div className="text-xs font-semibold">结果与运行控制台</div>
                <div className="mt-1 text-[11px] text-[var(--studio-text-muted)]">任务状态、质量门与安全化日志</div>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                        <ServerCog className="size-4 text-[var(--studio-accent)]" />
                        {props.health?.executorLabel || "工作流执行器"}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <ConsoleMetric label="队列" value={String(props.health?.queueDepth ?? "—")} />
                        <ConsoleMetric label="运行中" value={String(props.health?.runningCount ?? "—")} />
                        <ConsoleMetric label="心跳" value={props.health?.heartbeatFresh ? "正常" : "待恢复"} />
                        <ConsoleMetric label="文本通道" value={props.health?.textChannelAvailable ? "可用" : "不可用"} />
                    </div>
                </div>
                {props.stage ? (
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3">
                        <div className="text-xs font-semibold">当前阶段任务</div>
                        <div className="mt-3 space-y-2 text-xs">
                            <InfoLine label="状态" value={stageStatusLabel(props.stage.status)} />
                            <InfoLine label="第几次" value={String(props.stage.attempt)} />
                            <InfoLine label="预计算力点" value={props.agentRun?.executor === "codex-cli" ? "本地验证 · 0" : String(props.stage.estimatedCredits || "—")} />
                            <InfoLine label="Skill" value={props.agentRun?.skillVersion ? `${props.agentRun.skillVersion} · ${props.agentRun.skillContentHash.slice(0, 8)}` : "启动时冻结"} />
                            <InfoLine label="任务 ID" value={props.stage.agentRunId ? props.stage.agentRunId.slice(-10) : "未创建"} />
                        </div>
                    </div>
                ) : null}
                <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                        <Clock3 className="size-4" />
                        最近运行
                    </div>
                    <div className="mt-2 space-y-2">
                        {props.events
                            .slice(-8)
                            .reverse()
                            .map((event) => (
                                <div key={event.cursor} className="border-l border-[var(--studio-border-strong)] pl-2 text-[11px] leading-4 text-[var(--studio-text-secondary)]">
                                    {eventLabel(event.type)}
                                    <div className="text-[10px] text-[var(--studio-text-muted)]">{new Date(event.createdAt).toLocaleTimeString()}</div>
                                </div>
                            ))}
                        {!props.events.length ? <div className="py-4 text-center text-xs text-[var(--studio-text-muted)]">暂无运行记录</div> : null}
                    </div>
                </div>
            </div>
        </aside>
    );
}

function stageStatusLabel(status: string) {
    return (
        (
            {
                applied: "已写入",
                approved: "已通过",
                blocked: "被阻断",
                cancel_requested: "停止中",
                cancelled: "已停止",
                complete: "已完成",
                failed: "失败",
                idle: "未开始",
                needs_review: "待审核",
                queued: "排队中",
                ready: "可开始",
                rejected: "需修改",
                running: "进行中",
            } as Record<string, string>
        )[status] || status
    );
}
function eventLabel(type: string) {
    return (
        (
            {
                "stage.approved": "阶段已批准",
                "stage.cancelled": "阶段已停止",
                "stage.failed": "阶段执行失败",
                "stage.needs_review": "产物等待审核",
                "stage.queued": "阶段已加入队列",
                "stage.rejected": "产物已退回",
                "stage.running": "云端开始执行",
                "workflow.created": "工作流已创建",
            } as Record<string, string>
        )[type] || type
    );
}
function ConsoleMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-[var(--studio-panel-muted-bg)] px-2 py-2">
            <div className="text-[10px] text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-1 font-medium tabular-nums">{value}</div>
        </div>
    );
}
function InfoLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-[var(--studio-text-muted)]">{label}</span>
            <span className="truncate text-right">{value}</span>
        </div>
    );
}
