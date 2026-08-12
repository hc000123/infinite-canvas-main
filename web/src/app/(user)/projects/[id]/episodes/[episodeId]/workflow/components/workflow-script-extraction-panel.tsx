"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Select } from "antd";
import { Braces, CheckCircle2, Play, RefreshCw } from "lucide-react";

import { listWorkflowSkillOptions, type RemoteWorkflowRunDetail, type WorkflowSkillOption } from "@/services/api/workflow-runs";
import type { useWorkflowStageActions } from "../use-workflow-stage-actions";

type StageActions = ReturnType<typeof useWorkflowStageActions>;

const copy = {
    "asset-extraction": { action: "开始资产解析", description: "从本集确认稿识别角色、场景、道具和站位槽位；启动前可选择提取 Skill。", title: "资产提取" },
    "shot-breakdown": { action: "生成结构化分镜", description: "从本集确认稿编排镜头、节奏与连续性；启动前可选择提取 Skill。", title: "分镜提取" },
} as const;

export function WorkflowStageExtractionPanel(props: { agentRuns: RemoteWorkflowRunDetail["agentRuns"]; projectId: string; stageId: keyof typeof copy; state: StageActions; workerReady: boolean }) {
    const [options, setOptions] = useState<WorkflowSkillOption[]>([]);
    const [skill, setSkill] = useState("");
    const [error, setError] = useState("");
    const content = copy[props.stageId];

    useEffect(() => {
        let cancelled = false;
        listWorkflowSkillOptions(props.stageId, props.projectId)
            .then((items) => {
                if (cancelled) return;
                setOptions(items);
                const defaultOption = items.find((item) => item.isDefault);
                setSkill(defaultOption ? defaultOption.skillVersionId : items[0]?.skillVersionId || "");
            })
            .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Skill 列表读取失败"));
        return () => { cancelled = true; };
    }, [props.projectId, props.stageId]);

    const canStart = props.workerReady && props.state.actions.canStart;
    const busy = Boolean(props.state.busyAction);
    const start = async () => {
        setError("");
        const started = await props.state.start({ skillVersionId: skill });
        if (!started) setError(`${content.title}未能启动，请检查执行器状态后重试`);
    };

    return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 shadow-[var(--studio-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2 text-sm font-semibold"><Braces className="size-4 text-[var(--studio-accent)]" />{content.title}</div><p className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">{content.description}</p></div>
            <Button type="primary" icon={<Play className="size-4" />} disabled={!canStart} loading={busy} onClick={() => void start()}>{content.action}</Button>
        </div>
        {error ? <Alert className="mt-4" showIcon type="warning" title={error} /> : null}
        <ExtractionRow options={options} state={props.state} value={skill} frozenVersion={frozenVersion(props.agentRuns, props.state.stage?.agentRunId)} onChange={setSkill} />
    </section>;
}

function ExtractionRow(props: { frozenVersion: string; onChange: (value: string) => void; options: WorkflowSkillOption[]; state: StageActions; value: string }) {
    const active = ["queued", "running", "cancel_requested"].includes(props.state.stage?.status || "");
    const done = ["needs_review", "approved", "applied"].includes(props.state.stage?.status || "");
    const options = useMemo(() => props.options.map((item) => ({ label: `${item.skillName} · ${item.version}${item.isDefault ? "（推荐）" : ""}`, value: item.skillVersionId })), [props.options]);
    return <div className="mt-4 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--studio-text-muted)]">提取 Skill</span><span className={`flex items-center gap-1 text-xs ${done ? "text-[var(--studio-success)]" : "text-[var(--studio-text-muted)]"}`}>{active ? <RefreshCw className="size-3 animate-spin" /> : done ? <CheckCircle2 className="size-3" /> : null}{stageLabel(props.state.stage?.status)}</span></div>
        <Select className="mt-2 w-full" value={props.value || undefined} options={options} disabled={active || done} placeholder="选择提取 Skill" onChange={props.onChange} />
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--studio-text-muted)]"><span>{props.frozenVersion ? `本次冻结 ${props.frozenVersion}` : "启动时冻结所选版本"}</span>{props.state.actions.canRetry ? <Button size="small" icon={<RefreshCw className="size-3" />} onClick={props.state.retry}>重新提取</Button> : null}</div>
    </div>;
}

function frozenVersion(runs: RemoteWorkflowRunDetail["agentRuns"], agentRunId?: string) { return runs.find((item) => item.id === agentRunId)?.skillVersion || ""; }
function stageLabel(status?: string) { return ({ ready: "待开始", blocked: "等待剧本", queued: "排队中", running: "提取中", needs_review: "结果有效", approved: "已批准", applied: "已载入", failed: "失败", rejected: "需重提", cancelled: "已停止" } as Record<string, string>)[status || ""] || "待开始"; }
