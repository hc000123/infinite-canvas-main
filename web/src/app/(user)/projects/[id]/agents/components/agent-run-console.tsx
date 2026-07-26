"use client";

import { Check, CircleStop, FileText, Play, RefreshCw, Route, ShieldCheck, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Descriptions, Empty, Input, Modal, Select, Space, Steps, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { SkillOption } from "@/services/api/admin-skills";
import type { AgentRegistryItem, AgentSkillRef } from "@/services/api/agent-registry";
import { cancelAgentPlan, confirmAgentPlan, continueAgentPlan, createAgentPlan, fetchAgentPlan, preflightAgentPlan, type AgentPlanContinueResult, type AgentPlanDetail, type AgentPlanPreflightResult, type AgentPlanStepDetail } from "@/services/api/agent-plans";
import { createArtifact, getArtifact, getInvocation, reviewInvocation, type ArtifactEnvelope } from "@/services/api/invocations";
import { agentPlanStatusLabel, buildAgentPlanRequest, buildSourceArtifactInput, canConfirmAgentPlan, canContinueAgentPlan, canPreflightAgentPlan, rebindAgentSkillRefs } from "../agent-center-utils";
import { loadAgentRunSession, saveAgentRunSession } from "../agent-run-session";
import { agentRunSessionStorage } from "../agent-run-session-storage";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "操作失败");

export function AgentRunConsole({ item, projectId, initialEpisodeId, skillOptions }: { item?: AgentRegistryItem; projectId: string; initialEpisodeId?: string; skillOptions: SkillOption[] }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [episodeId, setEpisodeId] = useState(initialEpisodeId || "");
    const [goal, setGoal] = useState("按当前 Agent 的 Skill 顺序完成内容生产");
    const [sourceText, setSourceText] = useState("");
    const [sourceArtifact, setSourceArtifact] = useState<ArtifactEnvelope>();
    const [skillRefs, setSkillRefs] = useState<AgentSkillRef[]>([]);
    const [planId, setPlanId] = useState("");
    const [preflight, setPreflight] = useState<AgentPlanPreflightResult>();
    const [preflightLocalFingerprint, setPreflightLocalFingerprint] = useState("");
    const [lastContinue, setLastContinue] = useState<AgentPlanContinueResult>();
    const [artifactId, setArtifactId] = useState("");

    useEffect(() => {
        setSkillRefs(item?.recommendedPackage?.defaultSkillRefs.map((ref) => ({ ...ref, inputBindings: ref.inputBindings.map((binding) => ({ ...binding })), parameters: { ...ref.parameters } })) || []);
        setPlanId("");
        setSourceText("");
        setEpisodeId(initialEpisodeId || "");
        setGoal("按当前 Agent 的 Skill 顺序完成内容生产");
        setPreflight(undefined);
        setLastContinue(undefined);
        setSourceArtifact(undefined);
        if (!item) return;
        let active = true;
        void loadAgentRunSession(agentRunSessionStorage, projectId, item.agent.id).then((session) => {
            if (!active || !session) return;
            setPlanId(session.planId);
            setSourceText(session.sourceText);
            setEpisodeId(session.episodeId);
            setGoal(session.goal);
        }).catch(() => undefined);
        return () => { active = false; };
    }, [initialEpisodeId, item, projectId]);

    const planQuery = useQuery({ queryKey: ["agent-plan", planId], queryFn: () => fetchAgentPlan(planId), enabled: Boolean(planId), retry: false });
    const plan = planQuery.data;
    const activeInvocationId = lastContinue?.invocation?.run.id || plan?.steps.find((step) => step.step.status === "needs_review")?.step.invocationId || "";
    const invocationQuery = useQuery({ queryKey: ["invocation-detail", activeInvocationId], queryFn: () => getInvocation(activeInvocationId), enabled: Boolean(activeInvocationId), retry: false, refetchInterval: activeInvocationId ? 3000 : false });
    const artifactQuery = useQuery({ queryKey: ["artifact-preview", artifactId], queryFn: () => getArtifact(artifactId), enabled: Boolean(artifactId), retry: false });
    useEffect(() => {
        const error = planQuery.error || invocationQuery.error || artifactQuery.error;
        if (error) message.error(errorText(error));
    }, [artifactQuery.error, invocationQuery.error, message, planQuery.error]);

    const packageValue = item?.recommendedPackage;
    const firstSkill = skillOptions.find((option) => option.skillVersionId === skillRefs[0]?.skillVersionId);
    const sourceBindingName = firstSkill?.inputBindings.find((binding) => binding.artifactType === "source_text")?.bindingName || firstSkill?.inputBindings[0]?.bindingName || "source_text";
    const allowedOptions = useMemo(() => {
        if (!packageValue) return [];
        const policy = packageValue.skillAccessPolicy;
        return skillOptions.filter((option) => {
            const idAllowed = !policy.allowedSkillIds.length || policy.allowedSkillIds.includes(option.skillId);
            const capabilityAllowed = !policy.allowedCapabilities.length || option.manifest.capabilities.some((capability) => policy.allowedCapabilities.includes(capability));
            const ownerAllowed = !policy.allowedOwnerTypes.length || policy.allowedOwnerTypes.includes(option.ownerType);
            return idAllowed && capabilityAllowed && ownerAllowed;
        });
    }, [packageValue, skillOptions]);
    const localFingerprint = useMemo(() => JSON.stringify({ sourceText, goal, episodeId, sourceArtifactId: sourceArtifact?.artifact.id || "", skillRefs }), [episodeId, goal, skillRefs, sourceArtifact?.artifact.id, sourceText]);

    const setPlanData = (id: string, detail: AgentPlanDetail) => queryClient.setQueryData(["agent-plan", id], detail);
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!item || !packageValue || !sourceText.trim() || !goal.trim()) throw new Error("请先选择可运行 Agent，并填写文本与运行目标");
            const artifact = await createArtifact(buildSourceArtifactInput({ projectId, episodeId: episodeId || undefined, text: sourceText }));
            const request = buildAgentPlanRequest({ projectId, episodeId: episodeId || undefined, agentId: item.agent.id, agentVersionId: item.agent.recommendedVersionId, sourceArtifact: { id: artifact.artifact.id, contentHash: artifact.artifact.contentHash }, sourceBindingName, goal, skillRefs, idempotencyKey: globalThis.crypto.randomUUID() });
            return { artifact, detail: await createAgentPlan(request) };
        },
        onSuccess: ({ artifact, detail }) => {
            setSourceArtifact(artifact);
            setPlanId(detail.plan.id);
            void saveAgentRunSession(agentRunSessionStorage, projectId, item!.agent.id, { planId: detail.plan.id, sourceText, episodeId, goal }).catch(() => undefined);
            setPlanData(detail.plan.id, detail);
            setPreflight(undefined);
            setLastContinue(undefined);
            message.success("已创建不可变来源 Artifact 与 Agent Plan 草稿");
        },
        onError: (error) => message.error(errorText(error)),
    });
    const preflightMutation = useMutation({
        mutationFn: () => preflightAgentPlan(planId),
        onSuccess: (result) => { setPreflight(result); setPreflightLocalFingerprint(localFingerprint); setPlanData(planId, result); message.success("预检完成，版本、交接与额度已冻结"); },
        onError: (error) => message.error(errorText(error)),
    });
    const confirmMutation = useMutation({
        mutationFn: () => confirmAgentPlan(planId, { revision: preflight!.plan.currentRevision, fingerprint: preflight!.plan.confirmationFingerprint, requirementCodes: preflight!.confirmationRequirements.map((requirement) => requirement.code) }),
        onSuccess: (result) => { setPlanData(planId, result); message.success("Agent Plan 已确认，可以开始执行"); },
        onError: (error) => message.error(errorText(error)),
    });
    const continueMutation = useMutation({
        mutationFn: () => continueAgentPlan(planId),
        onSuccess: (result) => { setLastContinue(result); setPlanData(planId, result); if (result.plan.status === "needs_review") message.warning("当前步骤等待人工审核"); else if (result.plan.status === "completed") message.success("Agent Plan 已完成"); },
        onError: (error) => message.error(errorText(error)),
    });
    const cancelMutation = useMutation({
        mutationFn: () => cancelAgentPlan(planId),
        onSuccess: (result) => { setPlanData(planId, result); setLastContinue(undefined); message.success("Agent Plan 已取消"); },
        onError: (error) => message.error(errorText(error)),
    });
    const reviewMutation = useMutation({
        mutationFn: async () => {
            const detail = invocationQuery.data;
            if (!detail || !detail.artifactSetHash || detail.run.latestAttempt < 1) throw new Error("当前 Invocation 尚无可审核产物");
            await reviewInvocation(detail.run.id, { decision: "approved", attempt: detail.run.latestAttempt, artifactSetHash: detail.artifactSetHash, comment: "Agent 中心人工批准" });
            return continueAgentPlan(planId);
        },
        onSuccess: (result) => { setLastContinue(result); setPlanData(planId, result); void invocationQuery.refetch(); message.success("产物已批准并交接到下一步"); },
        onError: (error) => message.error(errorText(error)),
    });
    const busy = [createMutation, preflightMutation, confirmMutation, continueMutation, cancelMutation, reviewMutation].some((mutation) => mutation.isPending);

    if (!item || !packageValue) return <section className="studio-panel grid min-h-80 place-items-center p-6"><Empty description="请选择带推荐版本的 Agent 后开始运行" /></section>;

    const canConfirm = Boolean(preflight && plan && canConfirmAgentPlan({ preflightFingerprint: preflightLocalFingerprint, currentFingerprint: localFingerprint, status: plan.plan.status }));
    const steps = plan?.steps || packageValue.defaultSkillRefs.map((ref, index) => ({ step: { id: ref.stepKey, agentPlanId: "", revision: 0, ordinal: index + 1, stepKey: ref.stepKey, label: ref.label, capability: ref.capability, skillId: ref.skillId, skillVersionId: ref.skillVersionId, skillVersion: "", skillContentHash: "", expectedOutputType: ref.expectedOutputType, invocationId: "", status: "pending" as const, errorCode: "", errorMessage: "", createdAt: "", updatedAt: "" }, inputBindings: ref.inputBindings, parameters: ref.parameters, outputArtifactRefs: [] }));

    return (
        <section className="studio-panel min-w-0 overflow-hidden">
            <header className="border-b border-[var(--studio-border-subtle)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">INVOCATION CONSOLE</p><h2 className="mt-2 text-2xl font-semibold">运行 {item.agent.name}</h2><p className="mt-2 text-sm text-[var(--studio-text-secondary)]">文本先成为 Artifact，再由确认后的 Plan 逐步生成新 Artifact；每一步都可追溯到精确 Agent 与 Skill 版本。</p></div>{plan ? <Tag color={statusColor(plan.plan.status)}>{agentPlanStatusLabel(plan.plan.status)}</Tag> : <Tag>尚未创建 Plan</Tag>}</div>
            </header>

            <div className="space-y-6 p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <label><span className="mb-2 block text-xs font-medium text-[var(--studio-text-muted)]">内容文本</span><Input.TextArea value={sourceText} onChange={(event) => setSourceText(event.target.value)} autoSize={{ minRows: 8, maxRows: 18 }} placeholder="粘贴剧本、故事梗概或其他待处理文本…" /></label>
                    <div className="space-y-3">
                        <label><span className="mb-2 block text-xs font-medium text-[var(--studio-text-muted)]">本集 / Episode ID（可选）</span><Input value={episodeId} onChange={(event) => setEpisodeId(event.target.value)} placeholder="用于产物隔离" /></label>
                        <label><span className="mb-2 block text-xs font-medium text-[var(--studio-text-muted)]">运行目标</span><Input.TextArea value={goal} onChange={(event) => setGoal(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} /></label>
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--studio-border-strong)] px-3 py-4 text-sm text-[var(--studio-text-secondary)] transition hover:bg-[var(--studio-hover-bg)]"><Upload className="size-4" />导入 .txt / .md<input type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setSourceText(await file.text()); event.target.value = ""; }} /></label>
                    </div>
                </div>

                <div>
                    <div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-semibold">本次 Skill 组合</div><div className="mt-1 text-xs text-[var(--studio-text-muted)]">只允许 Agent Policy 授权的 Skill；预检后禁止悄悄变更。</div></div><Tag icon={<Route className="size-3.5" />}>{skillRefs.length} 步</Tag></div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {skillRefs.map((ref, index) => {
                            const option = skillOptions.find((candidate) => candidate.skillVersionId === ref.skillVersionId);
                            return <div key={ref.stepKey} className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-md bg-[var(--studio-accent-soft)] text-xs font-semibold text-[var(--studio-accent)]">{index + 1}</span><span className="truncate text-sm font-medium">{ref.label}</span></div><Select className="mt-3 w-full" value={ref.skillVersionId} disabled={!packageValue.executionPolicy.allowRuntimeSkillOverride || Boolean(preflight)} options={allowedOptions.map((candidate) => ({ value: candidate.skillVersionId, label: `${candidate.skillName} v${candidate.version}` }))} onChange={(skillVersionId) => { const optionValue = allowedOptions.find((candidate) => candidate.skillVersionId === skillVersionId); if (!optionValue) return; setSkillRefs(rebindAgentSkillRefs(skillRefs.map((item, itemIndex) => itemIndex === index ? { ...item, skillId: optionValue.skillId, skillVersionId } : item), skillOptions)); }} /><div className="mt-2 text-[11px] text-[var(--studio-text-muted)]">{option?.manifest.inputArtifactTypes.join("+") || "无输入"} → {option?.manifest.outputArtifactTypes.join("+") || ref.expectedOutputType}</div></div>;
                        })}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button type="primary" icon={<FileText className="size-4" />} loading={createMutation.isPending} disabled={busy || !sourceText.trim()} onClick={() => createMutation.mutate()}>创建 Artifact 与 Plan</Button>
                    <Button icon={<ShieldCheck className="size-4" />} loading={preflightMutation.isPending} disabled={busy || !plan || !canPreflightAgentPlan(plan.plan.status)} onClick={() => preflightMutation.mutate()}>预检并冻结</Button>
                    <Button icon={<Check className="size-4" />} loading={confirmMutation.isPending} disabled={busy || !canConfirm} onClick={() => confirmMutation.mutate()}>确认版本与额度</Button>
                    <Button icon={<Play className="size-4" />} loading={continueMutation.isPending} disabled={busy || !plan || !canContinueAgentPlan(plan.plan.status)} onClick={() => continueMutation.mutate()}>推进 / 同步状态</Button>
                    <Button icon={<RefreshCw className="size-4" />} disabled={!planId || busy} onClick={() => void Promise.all([planQuery.refetch(), invocationQuery.refetch()])}>刷新</Button>
                    <Button danger icon={<CircleStop className="size-4" />} loading={cancelMutation.isPending} disabled={!planId || busy || ["completed", "cancelled", "failed"].includes(plan?.plan.status || "")} onClick={() => cancelMutation.mutate()}>取消</Button>
                </div>
                {preflight && preflightLocalFingerprint !== localFingerprint ? <div className="rounded-lg border border-[var(--studio-border-strong)] bg-[var(--studio-accent-soft)] p-3 text-sm text-[var(--studio-text-secondary)]">预检后输入或 Skill 组合发生变化，确认已锁定。请创建新的 Plan Revision 或重新创建 Plan。</div> : null}

                {preflight ? <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="font-semibold">冻结预检</div><Space wrap><Tag>{preflight.plan.estimatedCredits} Credits 上限</Tag><Tag>{preflight.revision.agentContentHash.slice(0, 14)}…</Tag></Space></div><Descriptions className="mt-3" size="small" column={{ xs: 1, md: 2 }} items={[{ key: "revision", label: "Plan Revision", children: preflight.plan.currentRevision }, { key: "fingerprint", label: "确认指纹", children: `${preflight.plan.confirmationFingerprint.slice(0, 18)}…` }, { key: "requirements", label: "确认项", children: preflight.confirmationRequirements.map((item) => item.message).join("；") || "无" }, { key: "agent", label: "Agent Version", children: preflight.plan.agentVersionId }]} /></div> : null}

                <PlanSteps steps={steps} onArtifact={setArtifactId} />
                {plan?.plan.status === "needs_review" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--studio-border-strong)] bg-[var(--studio-accent-soft)] p-4"><div><div className="font-semibold">人工审核闸门</div><div className="mt-1 text-sm text-[var(--studio-text-secondary)]">先检查当前 Invocation 的结构化产物，再批准交接给下一步。</div></div><Button type="primary" icon={<Check className="size-4" />} loading={reviewMutation.isPending} disabled={!invocationQuery.data?.artifactSetHash} onClick={() => reviewMutation.mutate()}>批准当前产物并继续</Button></div> : null}
            </div>

            <Modal open={Boolean(artifactId)} title="Artifact 详情" footer={null} onCancel={() => setArtifactId("")} width={760}>
                {artifactQuery.data ? <pre className="max-h-[60vh] overflow-auto rounded-lg bg-[var(--studio-panel-muted-bg)] p-4 text-xs leading-6">{JSON.stringify(artifactQuery.data, null, 2)}</pre> : <div className="py-10 text-center text-sm text-[var(--studio-text-muted)]">正在读取 Artifact…</div>}
            </Modal>
        </section>
    );
}

function PlanSteps({ steps, onArtifact }: { steps: AgentPlanStepDetail[]; onArtifact: (id: string) => void }) {
    return <div><div className="mb-3 text-sm font-semibold">执行轨迹</div><Steps orientation="vertical" size="small" items={steps.map((detail) => ({ title: <div className="flex flex-wrap items-center gap-2"><span>{detail.step.label}</span><Tag>{detail.step.status}</Tag><span className="text-xs font-normal text-[var(--studio-text-muted)]">{detail.step.skillVersion ? `v${detail.step.skillVersion}` : detail.step.skillVersionId}</span></div>, content: <div className="space-y-2 pb-3 text-xs text-[var(--studio-text-secondary)]"><div>{detail.inputBindings.length ? detail.inputBindings.map((binding) => binding.fromStepKey ? `${binding.fromStepKey}.${binding.fromOutputBinding} → ${binding.bindingName}` : `${binding.artifactId} → ${binding.bindingName}`).join("；") : "等待外部来源或上游 Artifact"}</div>{detail.outputArtifactRefs.length ? <Space wrap>{detail.outputArtifactRefs.map((artifact) => <Button key={artifact.artifactId} type="link" size="small" className="!h-auto !p-0" onClick={() => onArtifact(artifact.artifactId)}>查看产物 {artifact.bindingName}</Button>)}</Space> : null}{detail.step.errorMessage ? <div className="text-red-500">{detail.step.errorMessage}</div> : null}</div>, status: stepStatus(detail.step.status) }))} /></div>;
}

function stepStatus(status: AgentPlanStepDetail["step"]["status"]): "wait" | "process" | "finish" | "error" {
    if (status === "completed" || status === "approved") return "finish";
    if (status === "failed" || status === "cancelled") return "error";
    if (["queued", "running", "needs_review"].includes(status)) return "process";
    return "wait";
}

function statusColor(status: AgentPlanDetail["plan"]["status"]) {
    if (status === "completed") return "success";
    if (status === "failed" || status === "cancelled" || status === "blocked") return "error";
    if (status === "needs_review" || status === "awaiting_confirmation") return "warning";
    return "processing";
}
