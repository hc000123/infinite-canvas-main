import type { AgentSkillRef } from "@/services/api/agent-registry";
import type { SkillOption } from "@/services/api/admin-skills";
import type { AgentPlanCreateInput, AgentPlanStatus } from "@/services/api/agent-plans";
import type { CreateArtifactInput } from "@/services/api/invocations-contract";

export function buildSourceArtifactInput(input: { projectId: string; episodeId?: string; text: string }): CreateArtifactInput {
    return {
        artifactType: "source_text",
        schemaVersion: "1.0.0",
        projectId: input.projectId,
        episodeId: input.episodeId,
        payload: { text: input.text.trim() },
    };
}

export function buildAgentPlanRequest(input: {
    projectId: string;
    episodeId?: string;
    agentId: string;
    agentVersionId: string;
    sourceArtifact: { id: string; contentHash: string };
    sourceBindingName: string;
    goal: string;
    skillRefs: AgentSkillRef[];
    idempotencyKey: string;
}): AgentPlanCreateInput {
    return {
        projectId: input.projectId,
        episodeId: input.episodeId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        goal: input.goal.trim(),
        sourceArtifactRefs: [{ bindingName: input.sourceBindingName, artifactId: input.sourceArtifact.id, contentHash: input.sourceArtifact.contentHash }],
        skillOverrides: input.skillRefs.map((item) => ({ ...item, inputBindings: item.inputBindings.map((binding) => ({ ...binding })), parameters: { ...item.parameters } })),
        idempotencyKey: input.idempotencyKey,
    };
}

export function reorderAgentSkillRefs(refs: AgentSkillRef[], from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= refs.length || to >= refs.length) return refs.map((item) => ({ ...item }));
    const result = refs.map((item) => ({ ...item }));
    const [moved] = result.splice(from, 1);
    result.splice(to, 0, moved);
    return result;
}

export function rebindAgentSkillRefs(refs: AgentSkillRef[], options: readonly SkillOption[]) {
    return refs.map((ref, index) => {
        const option = options.find((item) => item.skillVersionId === ref.skillVersionId || (ref.skillVersionId === "" && item.skillId === ref.skillId));
        const previous = index > 0 ? refs[index - 1] : undefined;
        const previousOption = previous ? options.find((item) => item.skillVersionId === previous.skillVersionId || (previous.skillVersionId === "" && item.skillId === previous.skillId)) : undefined;
        const handoff = previousOption?.outputBindings.flatMap((output) => (option?.inputBindings || []).filter((input) => input.artifactType === output.artifactType).map((input) => ({ input, output })))[0];
        return {
            ...ref,
            label: option?.skillName || ref.label,
            capability: option?.manifest.capabilities[0] || ref.capability,
            skillId: option?.skillId || ref.skillId,
            skillVersionId: option?.skillVersionId || ref.skillVersionId,
            skillVersionConstraint: "",
            inputBindings: handoff && previous ? [{ bindingName: handoff.input.bindingName, fromStepKey: previous.stepKey, fromOutputBinding: handoff.output.bindingName }] : [],
            expectedOutputType: option?.outputBindings[0]?.artifactType || option?.manifest.outputArtifactTypes[0] || ref.expectedOutputType,
        };
    });
}

export function canPreflightAgentPlan(status: AgentPlanStatus) {
    return status === "draft";
}

export function canConfirmAgentPlan(input: { preflightFingerprint: string; currentFingerprint: string; status: AgentPlanStatus }) {
    return input.status === "awaiting_confirmation" && input.preflightFingerprint !== "" && input.preflightFingerprint === input.currentFingerprint;
}

export function canContinueAgentPlan(status: AgentPlanStatus) {
    return status === "running" || status === "needs_review";
}

const statusLabels: Record<AgentPlanStatus, string> = {
    draft: "草稿",
    preflight: "预检中",
    awaiting_confirmation: "等待确认",
    running: "运行中",
    needs_review: "等待审核",
    completed: "已完成",
    blocked: "已阻断",
    failed: "失败",
    cancelled: "已取消",
};

export function agentPlanStatusLabel(status: AgentPlanStatus) {
    return statusLabels[status];
}

export function agentRegistrySkillLabel(pkg?: { defaultSkillRefs: unknown[] }) {
    return pkg ? `${pkg.defaultSkillRefs.length} 个 Skill` : "草稿待发布";
}
