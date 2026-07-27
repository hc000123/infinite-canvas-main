"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { fetchSkillOptions, type SkillOption } from "@/services/api/admin-skills";
import { fetchAgents } from "@/services/api/agent-registry";
import { cancelAgentPlan, confirmAgentPlan, continueAgentPlan, createAgentPlanRevision, fetchAgentPlan, preflightAgentPlan, type AgentPlanDetail } from "@/services/api/agent-plans";
import { applyInvocation, getArtifact, getInvocation, reviewInvocation, type ArtifactEnvelope, type InvocationDetail } from "@/services/api/invocations";
import type { CapabilityConsumeTrace } from "@/components/capability-runtime/use-capability-run";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasAgentPlanRun } from "../types";
import { activeAgentPlanInvocationId, buildCanvasAgentApplyInput, canvasAgentPlanActions, cloneCanvasAgentSkillRefs, finalAgentPlanOutputRefs } from "../utils/canvas-agent-plan-model";

const activeInvocationStatuses = new Set(["queued", "running", "cancel_requested"]);
const errorText = (error: unknown) => (error instanceof Error ? error.message : error ? String(error) : "");

export function useCanvasAgentPlan({ run, projectId, sourceMessageId, enabled, onRunPatch, onConsume }: { run: CanvasAgentPlanRun; projectId: string; sourceMessageId: string; enabled: boolean; onRunPatch: (patch: Partial<CanvasAgentPlanRun>) => void; onConsume: (input: { artifacts: ArtifactEnvelope[]; trace: CapabilityConsumeTrace; sourceNodeIds: string[]; sourceMessageId: string; agentPlanId: string }) => Promise<void> }) {
    const token = useUserStore((state) => state.token);
    const queryClient = useQueryClient();
    const [draftSkillRefs, setDraftSkillRefs] = useState(() => cloneCanvasAgentSkillRefs(run.skillRefs));

    useEffect(() => setDraftSkillRefs(cloneCanvasAgentSkillRefs(run.skillRefs)), [run.skillRefs]);

    const planKey = ["canvas-agent-plan", run.planId];
    const planQuery = useQuery({ queryKey: planKey, queryFn: () => fetchAgentPlan(run.planId), enabled: enabled && Boolean(run.planId), retry: false });
    const agentsQuery = useQuery({ queryKey: ["canvas-agent-options", projectId], queryFn: () => fetchAgents(projectId), enabled: enabled && Boolean(projectId), retry: false, staleTime: 30_000 });
    const skillsQuery = useQuery({ queryKey: ["canvas-agent-skill-options", projectId], queryFn: () => fetchSkillOptions(token, { projectId }), enabled: enabled && Boolean(token), retry: false, staleTime: 30_000 });
    const agent = agentsQuery.data?.find((item) => item.agent.id === run.agentId);
    const allowedSkillOptions = useMemo(() => filterAllowedSkillOptions(skillsQuery.data || [], agent?.recommendedPackage?.skillAccessPolicy), [agent?.recommendedPackage?.skillAccessPolicy, skillsQuery.data]);

    const plan = planQuery.data;
    const finalStep = [...(plan?.steps || [])].sort((left, right) => right.step.ordinal - left.step.ordinal).find((item) => item.outputArtifactRefs.length);
    const activeInvocationId = activeAgentPlanInvocationId(plan) || (plan?.plan.status === "completed" ? finalStep?.step.invocationId || "" : "");
    const invocationQuery = useQuery({
        queryKey: ["canvas-agent-invocation", activeInvocationId],
        queryFn: () => getInvocation(activeInvocationId),
        enabled: enabled && Boolean(activeInvocationId),
        retry: false,
        refetchInterval: (query) => activeInvocationStatuses.has((query.state.data as InvocationDetail | undefined)?.run.status || "") ? 2_000 : false,
    });
    const finalOutputRefs = finalAgentPlanOutputRefs(plan);
    const artifactQueries = useQueries({
        queries: finalOutputRefs.map((ref) => ({ queryKey: ["canvas-agent-artifact", ref.artifactId], queryFn: () => getArtifact(ref.artifactId), enabled, retry: false })),
    });
    const artifacts = artifactQueries.flatMap((query) => query.data ? [query.data] : []);
    const setPlanData = (detail: AgentPlanDetail) => queryClient.setQueryData(planKey, detail);

    const revisionMutation = useMutation({
        mutationFn: async () => {
            if (!plan || plan.plan.status !== "draft") throw new Error("只有草稿 Plan 可以保存修订");
            return createAgentPlanRevision(run.planId, { agentVersionId: run.agentVersionId, goal: plan.plan.goal, sourceArtifactRefs: [{ ...run.sourceArtifactRef }], skillOverrides: cloneCanvasAgentSkillRefs(draftSkillRefs) });
        },
        onSuccess: (detail) => {
            setPlanData(detail);
            onRunPatch({ skillRefs: cloneCanvasAgentSkillRefs(draftSkillRefs), confirmationRequirementCodes: undefined });
        },
    });
    const preflightMutation = useMutation({
        mutationFn: () => preflightAgentPlan(run.planId),
        onSuccess: (detail) => {
            setPlanData(detail);
            onRunPatch({ confirmationRequirementCodes: (detail.confirmationRequirements || []).map((item) => item.code) });
        },
    });
    const confirmMutation = useMutation({
        mutationFn: async () => {
            if (!plan || plan.plan.status !== "awaiting_confirmation") throw new Error("当前 Plan 不可确认");
            return confirmAgentPlan(run.planId, { revision: plan.plan.currentRevision, fingerprint: plan.plan.confirmationFingerprint, requirementCodes: run.confirmationRequirementCodes || [] });
        },
        onSuccess: setPlanData,
    });
    const continueMutation = useMutation({ mutationFn: () => continueAgentPlan(run.planId), onSuccess: setPlanData });
    const cancelMutation = useMutation({ mutationFn: () => cancelAgentPlan(run.planId), onSuccess: setPlanData });
    const reviewMutation = useMutation({
        mutationFn: async () => {
            const detail = invocationQuery.data || (activeInvocationId ? await getInvocation(activeInvocationId) : undefined);
            if (!detail?.artifactSetHash || detail.run.latestAttempt < 1) throw new Error("当前 Invocation 尚无可审核产物");
            await reviewInvocation(detail.run.id, { decision: "approved", attempt: detail.run.latestAttempt, artifactSetHash: detail.artifactSetHash, comment: "画布对话 Agent 人工批准" });
            return continueAgentPlan(run.planId);
        },
        onSuccess: (detail) => {
            setPlanData(detail);
            void invocationQuery.refetch();
        },
    });
    const applyMutation = useMutation({
        mutationFn: async () => {
            if (!plan || plan.plan.status !== "completed" || !finalStep?.step.invocationId || artifacts.length !== finalOutputRefs.length) throw new Error("最终 Artifact 尚未准备完成");
            const detail = invocationQuery.data || await getInvocation(finalStep.step.invocationId);
            if (!["approved", "applied"].includes(detail.run.status) || !detail.artifactSetHash || detail.run.latestAttempt < 1) throw new Error("最终 Invocation 尚未批准");
            const appliedAt = new Date().toISOString();
            const trace: CapabilityConsumeTrace = { invocationId: detail.run.id, artifactIds: artifacts.map((artifact) => artifact.artifact.id), skillVersionId: finalStep.step.skillVersionId, appliedAt };
            await onConsume({ artifacts, trace, sourceNodeIds: run.sourceNodeIds, sourceMessageId, agentPlanId: run.planId });
            await applyInvocation(detail.run.id, buildCanvasAgentApplyInput({ invocationId: detail.run.id, attempt: detail.run.latestAttempt, artifactSetHash: detail.artifactSetHash, sourceMessageId, artifactIds: trace.artifactIds }));
            onRunPatch({ appliedAt });
            return appliedAt;
        },
        onSuccess: () => void invocationQuery.refetch(),
    });

    const mutations = [revisionMutation, preflightMutation, confirmMutation, continueMutation, cancelMutation, reviewMutation, applyMutation];
    const mutationError = mutations.find((mutation) => mutation.error)?.error;
    const actions = canvasAgentPlanActions(plan?.plan.status || "draft", { hasFinalOutputs: finalOutputRefs.length > 0, applied: Boolean(run.appliedAt) });
    const replaceSkill = (index: number, skillVersionId: string) => {
        const option = allowedSkillOptions.find((item) => item.skillVersionId === skillVersionId);
        if (!option) return;
        setDraftSkillRefs((current) => rebindSkillRefs(current.map((ref, refIndex) => refIndex === index ? { ...ref, skillId: option.skillId, skillVersionId } : ref), skillsQuery.data || []));
    };
    const moveSkill = (index: number, offset: -1 | 1) => setDraftSkillRefs((current) => rebindSkillRefs(move(current, index, index + offset), skillsQuery.data || []));
    const removeSkill = (index: number) => setDraftSkillRefs((current) => rebindSkillRefs(current.filter((_, refIndex) => refIndex !== index), skillsQuery.data || []));

    return {
        plan,
        invocation: invocationQuery.data,
        artifacts,
        draftSkillRefs,
        allowedSkillOptions,
        allowRuntimeSkillOverride: Boolean(agent?.recommendedPackage?.executionPolicy.allowRuntimeSkillOverride),
        actions,
        busy: mutations.some((mutation) => mutation.isPending),
        loading: planQuery.isLoading || agentsQuery.isLoading || skillsQuery.isLoading,
        error: errorText(planQuery.error || agentsQuery.error || skillsQuery.error || invocationQuery.error || artifactQueries.find((query) => query.error)?.error || mutationError),
        replaceSkill,
        moveSkill,
        removeSkill,
        saveRevision: () => revisionMutation.mutateAsync(),
        preflight: () => preflightMutation.mutateAsync(),
        confirm: () => confirmMutation.mutateAsync(),
        continuePlan: () => continueMutation.mutateAsync(),
        review: () => reviewMutation.mutateAsync(),
        cancel: () => cancelMutation.mutateAsync(),
        apply: () => applyMutation.mutateAsync(),
        refresh: () => Promise.all([planQuery.refetch(), invocationQuery.refetch()]),
    };
}

function filterAllowedSkillOptions(options: SkillOption[], policy?: { allowedSkillIds: string[]; allowedCapabilities: string[]; allowedOwnerTypes: string[] }) {
    if (!policy) return [];
    return options.filter((option) => {
        const idAllowed = !policy.allowedSkillIds.length || policy.allowedSkillIds.includes(option.skillId);
        const capabilityAllowed = !policy.allowedCapabilities.length || option.manifest.capabilities.some((capability) => policy.allowedCapabilities.includes(capability));
        const ownerAllowed = !policy.allowedOwnerTypes.length || policy.allowedOwnerTypes.includes(option.ownerType);
        return idAllowed && capabilityAllowed && ownerAllowed;
    });
}

function move<T>(items: T[], from: number, to: number) {
    const result = [...items];
    if (from < 0 || to < 0 || from >= result.length || to >= result.length || from === to) return result;
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
}

function rebindSkillRefs(refs: CanvasAgentPlanRun["skillRefs"], options: SkillOption[]) {
    return refs.map((ref, index) => {
        const option = options.find((item) => item.skillVersionId === ref.skillVersionId);
        const previous = refs[index - 1];
        const previousOption = previous ? options.find((item) => item.skillVersionId === previous.skillVersionId) : undefined;
        const handoff = previousOption?.outputBindings.flatMap((output) => (option?.inputBindings || []).filter((input) => input.artifactType === output.artifactType).map((input) => ({ input, output })))[0];
        return {
            ...ref,
            label: option?.skillName || ref.label,
            capability: option?.manifest.capabilities[0] || ref.capability,
            skillId: option?.skillId || ref.skillId,
            skillVersionId: option?.skillVersionId || ref.skillVersionId,
            skillVersionConstraint: "",
            inputBindings: handoff && previous ? [{ bindingName: handoff.input.bindingName, fromStepKey: previous.stepKey, fromOutputBinding: handoff.output.bindingName }] : index === 0 ? ref.inputBindings.filter((binding) => !binding.fromStepKey) : [],
            expectedOutputType: option?.outputBindings[0]?.artifactType || option?.manifest.outputArtifactTypes[0] || ref.expectedOutputType,
        };
    });
}
