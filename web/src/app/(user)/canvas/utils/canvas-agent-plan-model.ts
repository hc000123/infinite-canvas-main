import type { AgentPlanCreateInput, AgentPlanDetail, AgentPlanStatus } from "../../../../services/api/agent-plans.ts";
import type { AgentRegistryItem, AgentSkillRef } from "../../../../services/api/agent-registry.ts";
import type { ArtifactRefInput, InvocationApplyInput } from "../../../../services/api/invocations-contract.ts";
import type { CanvasAssistantReference } from "../types.ts";

export type CanvasAgentPlanRequestInput = {
    projectId: string;
    episodeId?: string;
    agentId: string;
    agentVersionId: string;
    goal: string;
    sourceArtifact: Pick<ArtifactRefInput, "artifactId" | "contentHash">;
    sourceBindingName: string;
    skillRefs: AgentSkillRef[];
    idempotencyKey: string;
};

export function buildCanvasAgentSourceText(goal: string, references: CanvasAssistantReference[]) {
    const sections = references.flatMap((reference) => {
        const text = reference.text?.trim();
        return text ? [`[${reference.title.trim() || reference.id}]\n${text}`] : [];
    });
    return [`用户目标：${goal.trim()}`, sections.length ? `画布引用：\n${sections.join("\n\n")}` : ""].filter(Boolean).join("\n\n");
}

export function canvasAgentCandidates(items: AgentRegistryItem[]) {
    return items.filter((item) => item.agent.enabled && item.agent.recommendedVersionId && item.recommendedPackage && item.versions.some((version) => version.id === item.agent.recommendedVersionId && version.status === "published"));
}

export function cloneCanvasAgentSkillRefs(refs: AgentSkillRef[]) {
    return refs.map((ref) => ({ ...ref, inputBindings: ref.inputBindings.map((binding) => ({ ...binding })), parameters: { ...ref.parameters } }));
}

export function buildCanvasAgentPlanRequest(input: CanvasAgentPlanRequestInput): AgentPlanCreateInput {
    return {
        projectId: input.projectId,
        episodeId: input.episodeId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        goal: input.goal.trim(),
        sourceArtifactRefs: [{ bindingName: input.sourceBindingName, artifactId: input.sourceArtifact.artifactId, contentHash: input.sourceArtifact.contentHash }],
        skillOverrides: cloneCanvasAgentSkillRefs(input.skillRefs),
        idempotencyKey: input.idempotencyKey,
    };
}

export function activeAgentPlanInvocationId(detail?: AgentPlanDetail) {
    if (!detail) return "";
    const active = [...detail.steps]
        .sort((left, right) => right.step.ordinal - left.step.ordinal)
        .find((item) => ["queued", "running", "needs_review"].includes(item.step.status) && item.step.invocationId);
    return active?.step.invocationId || "";
}

export function finalAgentPlanOutputRefs(detail?: AgentPlanDetail) {
    if (!detail) return [];
    const last = [...detail.steps]
        .sort((left, right) => right.step.ordinal - left.step.ordinal)
        .find((item) => item.outputArtifactRefs.length);
    return last?.outputArtifactRefs.map((ref) => ({ ...ref })) || [];
}

export function canvasAgentPlanActions(status: AgentPlanStatus, options: { hasFinalOutputs: boolean; applied: boolean }) {
    const terminalFailure = status === "blocked" || status === "failed" || status === "cancelled";
    return {
        canEdit: status === "draft",
        canPreflight: status === "draft",
        canConfirm: status === "awaiting_confirmation",
        canContinue: status === "running",
        canReview: status === "needs_review",
        canCancel: !terminalFailure && status !== "completed",
        canApply: status === "completed" && options.hasFinalOutputs && !options.applied,
    };
}

export function buildCanvasAgentApplyInput(input: { invocationId: string; attempt: number; artifactSetHash: string; sourceMessageId: string; artifactIds: string[] }): InvocationApplyInput {
    return {
        idempotencyKey: `client-local-agent-${input.invocationId}-${input.attempt}`,
        attempt: input.attempt,
        artifactSetHash: input.artifactSetHash,
        target: "client_local_receipt",
        targetId: input.sourceMessageId,
        payload: { surface: "canvas", targetKind: "message", targetId: input.sourceMessageId, artifactIds: input.artifactIds },
    };
}
