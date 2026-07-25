"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Select } from "antd";
import { Braces, CheckCircle2, Play, RefreshCw } from "lucide-react";

import { listWorkflowSkillOptions, type RemoteWorkflowRunDetail, type WorkflowSkillOption } from "@/services/api/workflow-runs";
import type { useWorkflowStageActions } from "../use-workflow-stage-actions";

type StageActions = ReturnType<typeof useWorkflowStageActions>;

export function WorkflowScriptExtractionPanel(props: { agentRuns: RemoteWorkflowRunDetail["agentRuns"]; asset: StageActions; projectId: string; shot: StageActions; workerReady: boolean }) {
    const [assetOptions, setAssetOptions] = useState<WorkflowSkillOption[]>([]);
    const [shotOptions, setShotOptions] = useState<WorkflowSkillOption[]>([]);
    const [assetSkill, setAssetSkill] = useState("");
    const [shotSkill, setShotSkill] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        Promise.all([listWorkflowSkillOptions("asset-extraction", props.projectId), listWorkflowSkillOptions("shot-breakdown", props.projectId)])
            .then(([assets, shots]) => {
                if (cancelled) return;
                setAssetOptions(assets);
                setShotOptions(shots);
                const assetDefault = assets.find((item) => item.isDefault);
                const shotDefault = shots.find((item) => item.isDefault);
                setAssetSkill(assetDefault ? assetDefault.skillVersionId : assets[0]?.skillVersionId || "");
                setShotSkill(shotDefault ? shotDefault.skillVersionId : shots[0]?.skillVersionId || "");
            })
            .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Skill 列表读取失败"));
        return () => { cancelled = true; };
    }, [props.projectId]);

    const canStart = props.workerReady && (props.asset.actions.canStart || props.shot.actions.canStart);
    const busy = Boolean(props.asset.busyAction || props.shot.busyAction);
    const start = async () => {
        setError("");
        const tasks: Array<Promise<unknown>> = [];
        if (props.asset.actions.canStart) tasks.push(Promise.resolve(props.asset.start({ skillVersionId: assetSkill })));
        if (props.shot.actions.canStart) tasks.push(Promise.resolve(props.shot.start({ skillVersionId: shotSkill })));
        const results = await Promise.allSettled(tasks);
        if (results.some((item) => item.status === "rejected")) setError("部分信息提取未能启动，可单独重试失败项");
    };

    return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 shadow-[var(--studio-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2 text-sm font-semibold"><Braces className="size-4 text-[var(--studio-accent)]" />信息提取</div><p className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">资产清单与结构化分镜并行读取本集原剧本；可按剧情类型选择不同 Skill。</p></div>
            <Button type="primary" icon={<Play className="size-4" />} disabled={!canStart} loading={busy} onClick={() => void start()}>开始信息提取</Button>
        </div>
        {error ? <Alert className="mt-4" showIcon type="warning" title={error} /> : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ExtractionRow label="资产提取" options={assetOptions} state={props.asset} value={assetSkill} frozenVersion={frozenVersion(props.agentRuns, props.asset.stage?.agentRunId)} onChange={setAssetSkill} />
            <ExtractionRow label="分镜提取" options={shotOptions} state={props.shot} value={shotSkill} frozenVersion={frozenVersion(props.agentRuns, props.shot.stage?.agentRunId)} onChange={setShotSkill} />
        </div>
    </section>;
}

function ExtractionRow(props: { frozenVersion: string; label: string; onChange: (value: string) => void; options: WorkflowSkillOption[]; state: StageActions; value: string }) {
    const active = ["queued", "running", "cancel_requested"].includes(props.state.stage?.status || "");
    const done = ["needs_review", "approved", "applied"].includes(props.state.stage?.status || "");
    const options = useMemo(() => props.options.map((item) => ({ label: `${item.skillName} · ${item.version}${item.isDefault ? "（推荐）" : ""}`, value: item.skillVersionId })), [props.options]);
    return <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
        <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{props.label}</span><span className={`flex items-center gap-1 text-xs ${done ? "text-[var(--studio-success)]" : "text-[var(--studio-text-muted)]"}`}>{active ? <RefreshCw className="size-3 animate-spin" /> : done ? <CheckCircle2 className="size-3" /> : null}{stageLabel(props.state.stage?.status)}</span></div>
        <Select className="mt-3 w-full" value={props.value || undefined} options={options} disabled={active || done} placeholder="选择提取 Skill" onChange={props.onChange} />
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--studio-text-muted)]"><span>{props.frozenVersion ? `本次冻结 ${props.frozenVersion}` : "启动时冻结所选版本"}</span>{props.state.actions.canRetry ? <Button size="small" icon={<RefreshCw className="size-3" />} onClick={props.state.retry}>重新提取</Button> : null}</div>
    </div>;
}

function frozenVersion(runs: RemoteWorkflowRunDetail["agentRuns"], agentRunId?: string) { return runs.find((item) => item.id === agentRunId)?.skillVersion || ""; }
function stageLabel(status?: string) { return ({ ready: "待开始", blocked: "等待剧本", queued: "排队中", running: "提取中", needs_review: "结果有效", approved: "已批准", applied: "已载入", failed: "失败", rejected: "需重提", cancelled: "已停止" } as Record<string, string>)[status || ""] || "待开始"; }
