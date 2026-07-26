"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Modal, Space, Steps, Tag } from "antd";
import { Check, CircleStop, Eye, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchAgentPlan } from "@/services/api/agent-plans";
import { getArtifact, getInvocation, reviewInvocation } from "@/services/api/invocations";
import { cancelWorkflowExecution, confirmWorkflowExecution, continueWorkflowExecution, fetchWorkflowExecution, preflightWorkflowExecution, type WorkflowExecutionResponse, type WorkflowNodeExecution } from "@/services/api/workflow-registry";
import { loadWorkflowRunSession, saveWorkflowRunSession } from "../workflow-run-session";
import { workflowRunSessionStorage } from "../workflow-run-session-storage";
import type { WorkflowPreparedRun } from "./workflow-route-preview";

const errorText = (error: unknown) => error instanceof Error ? error.message : "执行失败";

export function WorkflowExecutionConsole({ prepared, projectId, workflowId, versionId }: { prepared?: WorkflowPreparedRun; projectId: string; workflowId: string; versionId: string }) {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [executionId, setExecutionId] = useState("");
    const [artifactId, setArtifactId] = useState("");

    useEffect(() => {
        setExecutionId("");
        if (!workflowId) return;
        let active = true;
        void loadWorkflowRunSession(workflowRunSessionStorage, projectId, workflowId).then((session) => {
            if (active && session?.executionId) setExecutionId(session.executionId);
        }).catch(() => undefined);
        return () => { active = false; };
    }, [projectId, workflowId]);

    const executionQuery = useQuery({
        queryKey: ["workflow-execution", executionId],
        queryFn: () => fetchWorkflowExecution(executionId),
        enabled: Boolean(executionId),
        retry: false,
        refetchInterval: (query) => {
            const status = (query.state.data as WorkflowExecutionResponse | undefined)?.run.status;
            return status && ["running", "needs_review"].includes(status) ? 3000 : false;
        },
    });
    const artifactQuery = useQuery({ queryKey: ["artifact-preview", artifactId], queryFn: () => getArtifact(artifactId), enabled: Boolean(artifactId), retry: false });
    useEffect(() => {
        const error = executionQuery.error || artifactQuery.error;
        if (error) message.error(errorText(error));
    }, [artifactQuery.error, executionQuery.error, message]);

    const setExecution = (result: WorkflowExecutionResponse) => queryClient.setQueryData(["workflow-execution", result.run.id], result);
    const preflightMutation = useMutation({
        mutationFn: () => {
            if (!prepared || !versionId) throw new Error("请先完成可执行的路由预览");
            if (!prepared.preview.executable) throw new Error("当前路由仍有阻断项，不能执行");
            return preflightWorkflowExecution({ ...prepared.input, workflowVersionId: versionId, idempotencyKey: globalThis.crypto.randomUUID() });
        },
        onSuccess: (result) => {
            setExecutionId(result.run.id);
            setExecution(result);
            void saveWorkflowRunSession(workflowRunSessionStorage, projectId, workflowId, { executionId: result.run.id, sourceText: prepared!.sourceText, episodeId: prepared!.episodeId }).catch(() => undefined);
            message.success("Workflow Revision 已预检，版本、输入、参数和额度已冻结");
        },
        onError: (error) => message.error(errorText(error)),
    });
    const confirmMutation = useMutation({
        mutationFn: () => confirmWorkflowExecution(executionId, { revision: detail!.run.revision, fingerprint: detail!.run.confirmationFingerprint, requirementCodes: detail!.confirmationRequirements }),
        onSuccess: (result) => { setExecution(result); message.success("Workflow 已确认，根节点开始并行执行"); },
        onError: (error) => message.error(errorText(error)),
    });
    const continueMutation = useMutation({
        mutationFn: () => continueWorkflowExecution(executionId),
        onSuccess: (result) => { setExecution(result); if (result.run.status === "completed") message.success("Workflow 已完成"); else if (result.run.status === "needs_review") message.warning("有节点产物等待人工审核"); },
        onError: (error) => message.error(errorText(error)),
    });
    const cancelMutation = useMutation({
        mutationFn: () => cancelWorkflowExecution(executionId),
        onSuccess: (result) => { setExecution(result); message.success("Workflow 与活动中的 Invocation / Agent Plan 已取消"); },
        onError: (error) => message.error(errorText(error)),
    });
    const reviewMutation = useMutation({
        mutationFn: async (node: WorkflowNodeExecution) => {
            let invocationId = node.invocationId || "";
            if (!invocationId && node.agentPlanId) {
                const plan = await fetchAgentPlan(node.agentPlanId);
                invocationId = plan.steps.find((step) => step.step.status === "needs_review")?.step.invocationId || "";
            }
            if (!invocationId) throw new Error("未找到等待审核的 Invocation");
            const invocation = await getInvocation(invocationId);
            if (!invocation.artifactSetHash || invocation.run.latestAttempt < 1) throw new Error("当前 Invocation 尚无可审核产物");
            await reviewInvocation(invocationId, { decision: "approved", attempt: invocation.run.latestAttempt, artifactSetHash: invocation.artifactSetHash, comment: "Workflow 中心人工批准" });
            return continueWorkflowExecution(executionId);
        },
        onSuccess: (result) => { setExecution(result); message.success("节点产物已批准，已继续解析下游"); },
        onError: (error) => message.error(errorText(error)),
    });

    const detail = executionQuery.data;
    const busy = [preflightMutation, confirmMutation, continueMutation, cancelMutation, reviewMutation].some((mutation) => mutation.isPending);
    const confirmRun = () => {
        if (!detail) return;
        if (!detail.confirmationRequirements.length) {
            confirmMutation.mutate();
            return;
        }
        modal.confirm({
            title: "确认执行此 Workflow Revision？",
            content: <div className="space-y-2 pt-2 text-sm"><p>预计最多消耗 {detail.run.estimatedCredits} Credits。</p>{detail.confirmationRequirements.map((code) => <div key={code} className="rounded-md bg-[var(--studio-panel-muted-bg)] px-3 py-2">{code}</div>)}</div>,
            okText: "确认版本、输入与额度",
            cancelText: "取消",
            onOk: async () => { await confirmMutation.mutateAsync(); },
        });
    };

    if (!workflowId) return <section className="studio-panel grid min-h-72 place-items-center p-6"><Empty description="选择 Workflow 后开始执行" /></section>;

    return (
        <section className="studio-panel min-w-0 overflow-hidden">
            <header className="border-b border-[var(--studio-border-subtle)] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">EXECUTION CONSOLE</p><h2 className="mt-2 text-xl font-semibold">Revision 与 Artifact 轨迹</h2><p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">刷新页面后会通过 execution ID 恢复同一组节点坐标，不重新创建运行记录。</p></div>{detail ? <Tag color={statusColor(detail.run.status)}>{statusLabel(detail.run.status)}</Tag> : <Tag>尚未预检</Tag>}</div></header>
            <div className="space-y-4 p-5">
                <div className="flex flex-wrap gap-2"><Button type="primary" icon={<ShieldCheck className="size-4" />} loading={preflightMutation.isPending} disabled={!prepared?.preview.executable || busy} onClick={() => preflightMutation.mutate()}>预检并冻结 Revision</Button><Button icon={<Check className="size-4" />} loading={confirmMutation.isPending} disabled={!detail || detail.run.status !== "awaiting_confirmation" || busy} onClick={confirmRun}>明确确认执行</Button><Button icon={<Play className="size-4" />} loading={continueMutation.isPending} disabled={!detail || !["running", "needs_review", "partial", "failed"].includes(detail.run.status) || busy} onClick={() => continueMutation.mutate()}>推进 / 同步</Button><Button icon={<RefreshCw className="size-4" />} disabled={!executionId || busy} onClick={() => void executionQuery.refetch()}>刷新</Button><Button danger icon={<CircleStop className="size-4" />} loading={cancelMutation.isPending} disabled={!detail || ["completed", "cancelled"].includes(detail.run.status) || busy} onClick={() => cancelMutation.mutate()}>取消</Button></div>
                {detail ? <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 text-xs text-[var(--studio-text-secondary)]"><Space wrap><Tag>Revision {detail.run.revision}</Tag><Tag>{detail.run.estimatedCredits} Credits</Tag><Tag>{detail.run.workflowContentHash.slice(0, 14)}…</Tag><span className="break-all">Execution {detail.run.id}</span></Space></div> : null}
                {detail ? <WorkflowExecutionSteps detail={detail} reviewing={reviewMutation.isPending} onReview={(node) => reviewMutation.mutate(node)} onArtifact={setArtifactId} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="预览可执行后创建 Workflow Revision" />}
            </div>
            <Modal open={Boolean(artifactId)} title="Artifact 详情" footer={null} width={780} onCancel={() => setArtifactId("")}>
                {artifactQuery.data ? <pre className="max-h-[65vh] overflow-auto rounded-lg bg-[var(--studio-panel-muted-bg)] p-4 text-xs leading-6">{JSON.stringify(artifactQuery.data, null, 2)}</pre> : <div className="py-10 text-center text-sm text-[var(--studio-text-muted)]">正在读取 Artifact…</div>}
            </Modal>
        </section>
    );
}

function WorkflowExecutionSteps({ detail, reviewing, onReview, onArtifact }: { detail: WorkflowExecutionResponse; reviewing: boolean; onReview: (node: WorkflowNodeExecution) => void; onArtifact: (id: string) => void }) {
    return <Steps orientation="vertical" size="small" items={detail.nodes.map((node) => ({ status: stepStatus(node.status), title: <div className="flex flex-wrap items-center gap-2"><span>{node.nodeKey}</span><Tag>{nodeStatusLabel(node.status)}</Tag><span className="text-xs font-normal text-[var(--studio-text-muted)]">{node.executorType}{node.invocationId ? ` · ${node.invocationId}` : node.agentPlanId ? ` · ${node.agentPlanId}` : ""}</span></div>, content: <div className="space-y-2 pb-3"><Space wrap>{node.outputArtifactRefs.map((ref) => <Button key={`${node.id}-${ref.artifactId}`} type="link" size="small" icon={<Eye className="size-3.5" />} className="!h-auto !p-0" onClick={() => onArtifact(ref.artifactId)}>{ref.bindingName}</Button>)}</Space>{node.status === "needs_review" ? <Button size="small" type="primary" icon={<Check className="size-3.5" />} loading={reviewing} onClick={() => onReview(node)}>批准产物并继续</Button> : null}{node.errorMessage ? <div className="text-xs text-red-500">{node.errorCode}: {node.errorMessage}</div> : null}</div> }))} />;
}

function stepStatus(status: WorkflowNodeExecution["status"]): "wait" | "process" | "finish" | "error" {
    if (["approved", "completed", "skipped"].includes(status)) return "finish";
    if (["failed", "cancelled"].includes(status)) return "error";
    if (["queued", "running", "needs_review"].includes(status)) return "process";
    return "wait";
}

function statusColor(status: WorkflowExecutionResponse["run"]["status"]) {
    if (status === "completed") return "success";
    if (["failed", "cancelled", "blocked"].includes(status)) return "error";
    if (["needs_review", "awaiting_confirmation", "partial"].includes(status)) return "warning";
    return "processing";
}

const statusLabels: Record<WorkflowExecutionResponse["run"]["status"], string> = { preflight: "预检中", awaiting_confirmation: "等待确认", running: "运行中", needs_review: "等待审核", completed: "已完成", blocked: "已阻断", partial: "部分完成", failed: "失败", cancelled: "已取消" };
const nodeStatusLabels: Record<WorkflowNodeExecution["status"], string> = { blocked: "等待依赖", ready: "就绪", queued: "已排队", running: "执行中", needs_review: "等待审核", approved: "已批准", completed: "已完成", skipped: "已跳过", failed: "失败", cancelled: "已取消" };
const statusLabel = (status: WorkflowExecutionResponse["run"]["status"]) => statusLabels[status];
const nodeStatusLabel = (status: WorkflowNodeExecution["status"]) => nodeStatusLabels[status];
