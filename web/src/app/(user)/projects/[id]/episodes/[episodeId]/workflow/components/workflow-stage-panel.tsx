import { Button, Progress } from "antd";
import { Ban, Check, CircleAlert, Clock3, Eye, Play, RefreshCw, RotateCcw, X } from "lucide-react";

import type { useWorkflowStageActions } from "../use-workflow-stage-actions";
import { parseWorkflowGateIssues } from "../workflow-stage-actions";
import { parseWorkflowReferenceEvidence } from "../workflow-reference-evidence";

type StageActions = ReturnType<typeof useWorkflowStageActions>;

export function WorkflowStagePanel(props: { executorLabel: string; label: string; preparing: boolean; state: StageActions; workerReady: boolean; onConfirmStart: () => void; onConfirmReject: () => void }) {
    const { actions, artifact, busyAction, gate, stage } = props.state;
    const issues = parseWorkflowGateIssues(gate?.issuesJson);
    const referenceEvidence = parseWorkflowReferenceEvidence(artifact?.contentJson);
    return (
        <div className="space-y-3">
            <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-xs font-medium text-[var(--studio-accent)]">{props.executorLabel}</div>
                        <h3 className="mt-1 text-lg font-semibold">{props.label}</h3>
                        <p className="mt-1 text-xs text-[var(--studio-text-muted)]">阶段启动后立即进入持久化队列，执行器与 Skill 版本会冻结到本次任务。</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--studio-border-subtle)] px-2 py-1 text-xs">
                        <StageIcon status={stage?.status || "idle"} />
                        {statusLabel(stage?.status || "idle")}
                    </span>
                </div>
                {stage ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        <Metric label="预计算力点" value={stage.estimatedCredits ? String(stage.estimatedCredits) : "启动时计算"} />
                        <Metric label="执行尝试" value={String(stage.attempt)} />
                        <Metric label="进度" value={`${stage.progressCurrent}/${stage.progressTotal || 1}`} />
                        <Metric label="更新时间" value={stage.updatedAt ? new Date(stage.updatedAt).toLocaleTimeString() : "—"} />
                    </div>
                ) : null}
                {stage?.progressTotal ? <Progress className="mt-3" percent={Math.round((stage.progressCurrent / stage.progressTotal) * 100)} showInfo={false} size="small" strokeColor="var(--studio-accent)" /> : null}
                {stage?.errorMessage ? (
                    <div className="mt-3 flex gap-2 rounded-md border border-[var(--studio-danger)]/40 bg-[var(--studio-panel-muted-bg)] p-3 text-xs leading-5 text-[var(--studio-danger)]">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" />
                        {stage.errorMessage}
                    </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="primary" icon={<Play className="size-4" />} disabled={!actions.canStart || !props.workerReady} loading={props.preparing || busyAction === "start"} onClick={props.onConfirmStart}>
                        启动阶段
                    </Button>
                    <Button danger icon={<Ban className="size-4" />} disabled={!actions.canCancel} loading={busyAction === "cancel"} onClick={props.state.cancel}>
                        停止
                    </Button>
                    <Button icon={<RotateCcw className="size-4" />} disabled={!actions.canRetry || !props.workerReady} loading={busyAction === "retry"} onClick={props.state.retry}>
                        重试
                    </Button>
                    {actions.reason ? <span className="self-center text-xs text-[var(--studio-text-muted)]">{actions.reason}</span> : null}
                </div>
            </section>

            {artifact ? (
                <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold">产物审核</h3>
                            <p className="mt-1 text-xs text-[var(--studio-text-muted)]">
                                版本 {artifact.version} · 摘要 {artifact.contentHash.slice(0, 10)}
                            </p>
                        </div>
                        <span className={`text-xs ${gate?.passed ? "text-[var(--studio-success)]" : "text-[var(--studio-warning)]"}`}>{gate?.passed ? "质量门通过" : "质量门未通过"}</span>
                    </div>
                    {referenceEvidence.length ? (
                        <div className="mt-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold">
                                <Eye className="size-4 text-[var(--studio-accent)]" />
                                图片理解证据
                            </div>
                            <div className="mt-2 grid gap-2 xl:grid-cols-2">
                                {referenceEvidence.map((item) => (
                                    <div key={item.imageRef} className="rounded-md bg-[var(--studio-elevated-bg)] p-3 text-xs leading-5">
                                        <div className="font-semibold text-[var(--studio-accent)]">{item.imageRef}</div>
                                        <div className="mt-1 text-[var(--studio-text-secondary)]">{item.observations.join("；")}</div>
                                        <div className="mt-2 text-[var(--studio-text-muted)]">应用到：{item.appliedTo.join("、")}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <pre className="thin-scrollbar mt-3 max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3 text-xs leading-6 text-[var(--studio-text-secondary)]">
                        {formatArtifact(artifact.contentJson)}
                    </pre>
                    {issues.length ? (
                        <div className="mt-3 space-y-1 rounded-md border border-[var(--studio-warning)]/40 p-3">
                            {issues.map((issue, index) => (
                                <div key={`${index}:${issue}`} className="flex gap-2 text-xs leading-5 text-[var(--studio-warning)]">
                                    <CircleAlert className="mt-1 size-3 shrink-0" />
                                    {issue}
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div className="mt-4 flex gap-2">
                        <Button type="primary" icon={<Check className="size-4" />} disabled={!actions.canApprove} loading={busyAction === "approve"} onClick={props.state.approve}>
                            批准产物
                        </Button>
                        <Button icon={<X className="size-4" />} disabled={!actions.canReject} loading={busyAction === "reject"} onClick={props.onConfirmReject}>
                            退回修改
                        </Button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function formatArtifact(value: string) {
    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
}
function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-[var(--studio-panel-muted-bg)] px-3 py-2">
            <div className="text-[10px] text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-1 truncate text-xs font-medium tabular-nums">{value}</div>
        </div>
    );
}
function StageIcon({ status }: { status: string }) {
    if (["running", "queued", "cancel_requested"].includes(status)) return <RefreshCw className="size-3 animate-spin text-[var(--studio-accent)]" />;
    if (["approved", "applied"].includes(status)) return <Check className="size-3 text-[var(--studio-success)]" />;
    if (["failed", "blocked", "rejected"].includes(status)) return <CircleAlert className="size-3 text-[var(--studio-warning)]" />;
    return <Clock3 className="size-3" />;
}
function statusLabel(status: string) {
    return (
        (
            {
                applied: "已写入",
                approved: "已批准",
                blocked: "被阻断",
                cancel_requested: "停止中",
                cancelled: "已停止",
                failed: "失败",
                idle: "未开始",
                needs_review: "待审核",
                queued: "排队中",
                ready: "可启动",
                rejected: "需修改",
                running: "执行中",
            } as Record<string, string>
        )[status] || status
    );
}
