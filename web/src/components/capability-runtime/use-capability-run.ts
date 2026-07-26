"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { fetchSkillOptions, type SkillOption } from "@/services/api/admin-skills";
import {
    applyInvocation,
    cancelInvocation,
    confirmInvocation,
    createArtifact,
    createInvocation,
    getInvocation,
    listArtifacts,
    retryInvocation,
    reviewInvocation,
    type ArtifactEnvelope,
    type ClientInvocationSource,
    type InvocationDetail,
    type InvocationPreflightResponse,
} from "@/services/api/invocations";
import { useUserStore } from "@/stores/use-user-store";
import { buildCapabilityInputRefs, capabilityRunActions, capabilitySkillCompatibility } from "./capability-run-model";

export type CapabilityConsumerSource = Extract<ClientInvocationSource, "image" | "canvas_chat">;
export type CapabilityConsumerTargetKind = "prompt" | "node" | "message" | "asset";

export type CapabilityConsumeTrace = {
    invocationId: string;
    artifactIds: string[];
    skillVersionId: string;
    appliedAt: string;
};

export type UseCapabilityRunOptions = {
    enabled: boolean;
    source: CapabilityConsumerSource;
    projectId: string;
    episodeId?: string;
    sourceText: string;
    targetKind: CapabilityConsumerTargetKind;
    targetId: string;
    onConsume: (artifacts: ArtifactEnvelope[], trace: CapabilityConsumeTrace) => void | Promise<void>;
};

const activeInvocationStatuses = new Set(["queued", "running", "cancel_requested"]);
const errorText = (error: unknown) => error instanceof Error ? error.message : error ? String(error) : "";

export function useCapabilityRun(options: UseCapabilityRunOptions) {
    const token = useUserStore((state) => state.token);
    const queryClient = useQueryClient();
    const projectId = options.projectId.trim() || "local-image-workbench";
    const episodeId = options.episodeId?.trim() || "";
    const sourceText = options.sourceText.trim();
    const [selectedSkillVersionId, setSelectedSkillVersionId] = useState("");
    const [preflight, setPreflight] = useState<InvocationPreflightResponse>();
    const [sourceArtifact, setSourceArtifact] = useState<ArtifactEnvelope>();
    const [frozenLocalFingerprint, setFrozenLocalFingerprint] = useState("");

    const skillsQuery = useQuery({
        queryKey: ["capability-skill-options", projectId],
        queryFn: () => fetchSkillOptions(token, { projectId }),
        enabled: options.enabled && Boolean(token),
        retry: false,
        staleTime: 30_000,
    });
    const artifactsQuery = useQuery({
        queryKey: ["capability-approved-artifacts", projectId],
        queryFn: () => listArtifacts({ project: projectId, approvalState: "approved", pageSize: 500 }),
        enabled: options.enabled && Boolean(token),
        retry: false,
        staleTime: 10_000,
    });

    const skillOptions = skillsQuery.data || [];
    const approvedArtifacts = artifactsQuery.data?.items || [];
    const selectableArtifacts = useMemo(() => sourceText ? approvedArtifacts.filter((item) => item.artifact.artifactType !== "source_text") : approvedArtifacts, [approvedArtifacts, sourceText]);
    const compatibilities = useMemo(() => new Map(skillOptions.map((skill) => [skill.skillVersionId, capabilitySkillCompatibility(skill, selectableArtifacts, { pendingSourceText: Boolean(sourceText) })])), [selectableArtifacts, skillOptions, sourceText]);
    const defaultSkill = skillOptions.find((skill) => skill.isRecommended && compatibilities.get(skill.skillVersionId)?.compatible) || skillOptions.find((skill) => compatibilities.get(skill.skillVersionId)?.compatible) || skillOptions.find((skill) => skill.isRecommended) || skillOptions[0];
    const effectiveSkillVersionId = selectedSkillVersionId || defaultSkill?.skillVersionId || "";
    const selectedSkill = skillOptions.find((skill) => skill.skillVersionId === effectiveSkillVersionId);
    const compatibility = selectedSkill ? compatibilities.get(selectedSkill.skillVersionId) : undefined;
    const localFingerprint = useMemo(() => JSON.stringify({
        source: options.source,
        projectId,
        episodeId,
        sourceText,
        skillVersionId: effectiveSkillVersionId,
        artifacts: compatibility?.selectedArtifactIdsByBinding || {},
        pendingSourceTextBindings: compatibility?.pendingSourceTextBindings || [],
    }), [compatibility, effectiveSkillVersionId, episodeId, options.source, projectId, sourceText]);

    const invocationId = preflight?.run.id || "";
    const invocationQuery = useQuery({
        queryKey: ["capability-invocation", invocationId],
        queryFn: () => getInvocation(invocationId),
        enabled: options.enabled && Boolean(invocationId),
        retry: false,
        refetchInterval: (query) => activeInvocationStatuses.has((query.state.data as InvocationDetail | undefined)?.run.status || "") ? 2_000 : false,
    });
    const detail = invocationQuery.data;
    const status = detail?.run.status || preflight?.run.status || "draft";
    const actions = capabilityRunActions(status, { fingerprintMatches: Boolean(frozenLocalFingerprint) && frozenLocalFingerprint === localFingerprint });

    const preflightMutation = useMutation({
        mutationFn: async () => {
            if (!selectedSkill || !compatibility?.compatible) throw new Error(compatibility?.missingBindings.length ? `缺少输入：${compatibility.missingBindings.join("、")}` : "请选择可运行的 Skill");
            let createdSource: ArtifactEnvelope | undefined;
            if (compatibility.pendingSourceTextBindings.length) {
                if (!sourceText) throw new Error("当前 Skill 需要 source_text，请先填写内容文本");
                createdSource = await createArtifact({ artifactType: "source_text", schemaVersion: "1.0.0", projectId, episodeId: episodeId || undefined, payload: { text: sourceText } });
            }
            const inputs = createdSource ? [createdSource, ...selectableArtifacts] : selectableArtifacts;
            const refs = buildCapabilityInputRefs(selectedSkill, inputs);
            const resolved = capabilitySkillCompatibility(selectedSkill, inputs);
            if (!resolved.compatible) throw new Error(`无法冻结输入：${resolved.missingBindings.join("、")}`);
            const result = await createInvocation({
                source: options.source,
                projectId,
                episodeId: episodeId || undefined,
                skillVersionId: selectedSkill.skillVersionId,
                expectedOutputArtifactType: selectedSkill.outputBindings.length === 1 ? selectedSkill.outputBindings[0].artifactType : undefined,
                inputArtifactRefs: refs,
                parameters: { consumerSurface: options.source === "image" ? "image" : "canvas" },
                idempotencyKey: globalThis.crypto.randomUUID(),
            });
            return { result, createdSource };
        },
        onSuccess: ({ result, createdSource }) => {
            if (preflight?.run.id && preflight.run.id !== result.run.id) queryClient.removeQueries({ queryKey: ["capability-invocation", preflight.run.id] });
            setPreflight(result);
            setSourceArtifact(createdSource);
            setFrozenLocalFingerprint(localFingerprint);
        },
    });

    const refresh = async () => {
        if (!invocationId) return;
        await invocationQuery.refetch();
    };
    const confirmMutation = useMutation({
        mutationFn: async () => {
            if (!preflight || !actions.canConfirm) throw new Error("当前输入与预检快照不一致，请重新预检");
            await confirmInvocation(preflight.run.id, { requirementCodes: preflight.confirmationRequirements });
        },
        onSuccess: refresh,
    });
    const cancelMutation = useMutation({ mutationFn: () => cancelInvocation(invocationId), onSuccess: refresh });
    const retryMutation = useMutation({ mutationFn: () => retryInvocation(invocationId), onSuccess: refresh });
    const reviewMutation = useMutation({
        mutationFn: async (decision: "approved" | "rejected") => {
            if (!detail?.artifactSetHash || detail.run.latestAttempt < 1) throw new Error("当前 Invocation 没有可审核的 Artifact-set");
            await reviewInvocation(detail.run.id, { decision, attempt: detail.run.latestAttempt, artifactSetHash: detail.artifactSetHash, comment: decision === "approved" ? "客户端能力运行人工批准" : "客户端能力运行人工拒绝" });
        },
        onSuccess: refresh,
    });
    const applyMutation = useMutation({
        mutationFn: async () => {
            if (!detail || detail.run.status !== "approved" || !detail.outputArtifacts.length) throw new Error("只有已批准且非空的 Artifact-set 可以使用");
            const trace: CapabilityConsumeTrace = {
                invocationId: detail.run.id,
                artifactIds: detail.outputArtifacts.map((item) => item.artifact.id),
                skillVersionId: preflight?.revision.skillVersionId || detail.revisions.at(-1)?.skillVersionId || "",
                appliedAt: new Date().toISOString(),
            };
            await options.onConsume(detail.outputArtifacts, trace);
            await applyInvocation(detail.run.id, {
                idempotencyKey: `client-local-${detail.run.id}-${detail.run.latestAttempt}`,
                attempt: detail.run.latestAttempt,
                artifactSetHash: detail.artifactSetHash,
                target: "client_local_receipt",
                targetId: options.targetId,
                payload: {
                    surface: options.source === "image" ? "image" : "canvas",
                    targetKind: options.targetKind,
                    targetId: options.targetId,
                    artifactIds: trace.artifactIds,
                },
            });
            return trace;
        },
        onSuccess: refresh,
    });

    const mutations = [preflightMutation, confirmMutation, cancelMutation, retryMutation, reviewMutation, applyMutation];
    const mutationError = mutations.find((mutation) => mutation.error)?.error;
    const reset = () => {
        if (invocationId) queryClient.removeQueries({ queryKey: ["capability-invocation", invocationId] });
        setPreflight(undefined);
        setSourceArtifact(undefined);
        setFrozenLocalFingerprint("");
    };

    return {
        skillOptions,
        approvedArtifacts,
        compatibilities,
        selectedSkill,
        selectedSkillVersionId: effectiveSkillVersionId,
        setSelectedSkillVersionId,
        compatibility,
        preflight,
        sourceArtifact,
        frozenLocalFingerprint,
        localFingerprint,
        fingerprintMatches: Boolean(frozenLocalFingerprint) && frozenLocalFingerprint === localFingerprint,
        detail,
        status,
        actions,
        busy: mutations.some((mutation) => mutation.isPending),
        loading: skillsQuery.isLoading || artifactsQuery.isLoading,
        error: errorText(skillsQuery.error || artifactsQuery.error || invocationQuery.error || mutationError),
        preflightRun: () => preflightMutation.mutateAsync(),
        confirm: () => confirmMutation.mutateAsync(),
        refresh,
        cancel: () => cancelMutation.mutateAsync(),
        retry: () => retryMutation.mutateAsync(),
        review: (decision: "approved" | "rejected") => reviewMutation.mutateAsync(decision),
        apply: () => applyMutation.mutateAsync(),
        reset,
    };
}

export type CapabilityRunController = ReturnType<typeof useCapabilityRun>;
export type CapabilityRunSkill = SkillOption;
