import type { SkillOption } from "../../../../services/api/admin-skills.ts";
import type { AgentSkillRef } from "../../../../services/api/agent-registry.ts";

export const CANVAS_ORCHESTRATOR_AGENT_ID = "agent-system-canvas-orchestrator";

export type CanvasOrchestratorDecision =
    | { kind: "answer"; answer: string }
    | { kind: "plan"; summary: string; steps: Array<{ stepKey: string; skillVersionId: string; parameters?: Record<string, unknown>; reason: string }> };

export type ResolvedCanvasOrchestratorDecision =
    | { kind: "answer"; answer: string }
    | { kind: "plan"; summary: string; steps: Extract<CanvasOrchestratorDecision, { kind: "plan" }>["steps"]; sourceBindingName: string; skillRefs: AgentSkillRef[] };

type SkillAccessPolicy = { allowedSkillIds: string[]; allowedCapabilities: string[]; allowedOwnerTypes: string[] };

export function filterCanvasOrchestratorSkillCatalog(options: SkillOption[], policy?: SkillAccessPolicy) {
    if (!policy) return [];
    return options.filter((option) => {
        const idAllowed = !policy.allowedSkillIds.length || policy.allowedSkillIds.includes(option.skillId);
        const capabilityAllowed = !policy.allowedCapabilities.length || option.manifest.capabilities.some((capability) => policy.allowedCapabilities.includes(capability));
        const ownerAllowed = !policy.allowedOwnerTypes.length || policy.allowedOwnerTypes.includes(option.ownerType);
        return idAllowed && capabilityAllowed && ownerAllowed;
    });
}

export function buildCanvasOrchestratorSystemPrompt(rolePrompt: string, catalog: SkillOption[], maxSteps: number) {
    const facts = catalog.map((option) => ({
        skillVersionId: option.skillVersionId,
        name: option.skillName,
        summary: option.summary,
        capabilities: option.manifest.capabilities,
        inputs: option.inputBindings.map((input) => ({ bindingName: input.bindingName, artifactType: input.artifactType })),
        outputs: option.outputBindings.map((output) => ({ bindingName: output.bindingName, artifactType: output.artifactType })),
    }));
    return [
        rolePrompt.trim(),
        "你必须只返回一个 JSON 对象，不要使用 Markdown。普通咨询返回 {\"kind\":\"answer\",\"answer\":\"...\"}。确实需要执行 Skill 时返回 {\"kind\":\"plan\",\"summary\":\"...\",\"steps\":[{\"stepKey\":\"...\",\"skillVersionId\":\"...\",\"parameters\":{},\"reason\":\"...\"}]}。",
        `计划最多 ${maxSteps} 步。只能使用下方 Catalog 的 skillVersionId；第一步必须接收 source_text，相邻步骤的输出与输入 Artifact 类型必须兼容。不要返回 capability、skillId、输入绑定或输出类型，这些字段由客户端从 Catalog 重建。`,
        `Skill Catalog：${JSON.stringify(facts)}`,
    ].filter(Boolean).join("\n\n");
}

export function resolveCanvasOrchestratorDecision(raw: string | unknown, catalog: SkillOption[], maxSteps: number): ResolvedCanvasOrchestratorDecision {
    const value = parseDecision(raw);
    if (value.kind === "answer") {
        const answer = stringField(value.answer);
        if (!answer) throw new Error("画布总控没有返回有效回答");
        return { kind: "answer", answer };
    }
    if (value.kind !== "plan" || !Array.isArray(value.steps)) throw new Error("画布总控返回的决策格式无效");
    const summary = stringField(value.summary);
    if (!summary || value.steps.length < 1 || value.steps.length > maxSteps) throw new Error(`画布总控计划步骤必须为 1–${maxSteps} 步`);
    const byVersion = new Map(catalog.map((option) => [option.skillVersionId, option]));
    const seen = new Set<string>();
    const decisions = value.steps.map((rawStep) => {
        const step = objectField(rawStep);
        const stepKey = stringField(step.stepKey).toLowerCase();
        const skillVersionId = stringField(step.skillVersionId);
        const reason = stringField(step.reason);
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(stepKey)) throw new Error("画布总控 Step Key 格式无效");
        if (seen.has(stepKey)) throw new Error("画布总控 Step Key 重复");
        seen.add(stepKey);
        if (!byVersion.has(skillVersionId)) throw new Error(`画布总控引用了未知 Skill 版本：${skillVersionId}`);
        if (!reason) throw new Error(`画布总控步骤 ${stepKey} 缺少选择理由`);
        const parameters = step.parameters === undefined ? {} : objectField(step.parameters);
        return { stepKey, skillVersionId, parameters, reason };
    });
    const firstOption = byVersion.get(decisions[0]!.skillVersionId)!;
    const sourceInput = firstOption.inputBindings.find((input) => input.artifactType === "source_text");
    if (!sourceInput) throw new Error("画布总控计划第一步必须接收 source_text");
    const skillRefs: AgentSkillRef[] = decisions.map((step, index) => {
        const option = byVersion.get(step.skillVersionId)!;
        let inputBindings: AgentSkillRef["inputBindings"];
        if (index === 0) {
            inputBindings = [{ bindingName: sourceInput.bindingName }];
        } else {
            const previousStep = decisions[index - 1]!;
            const previous = byVersion.get(previousStep.skillVersionId)!;
            const handoff = previous.outputBindings.flatMap((output) => option.inputBindings.filter((input) => input.artifactType === output.artifactType).map((input) => ({ input, output })))[0];
            if (!handoff) throw new Error(`画布总控步骤 ${previousStep.stepKey} → ${step.stepKey} 的 Artifact 契约不兼容`);
            inputBindings = [{ bindingName: handoff.input.bindingName, fromStepKey: previousStep.stepKey, fromOutputBinding: handoff.output.bindingName }];
        }
        return {
            stepKey: step.stepKey,
            label: option.skillName,
            capability: option.manifest.capabilities[0] || "",
            skillId: option.skillId,
            skillVersionId: option.skillVersionId,
            skillVersionConstraint: "",
            required: true,
            inputBindings,
            parameters: { ...step.parameters },
            expectedOutputType: option.outputBindings[0]?.artifactType || option.manifest.outputArtifactTypes[0] || "",
        };
    });
    return { kind: "plan", summary, steps: decisions, sourceBindingName: sourceInput.bindingName, skillRefs };
}

function parseDecision(raw: string | unknown): Record<string, unknown> {
    if (typeof raw !== "string") return objectField(raw);
    const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        return objectField(JSON.parse(text));
    } catch {
        throw new Error("画布总控没有返回有效 JSON 决策");
    }
}

function objectField(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("画布总控返回的对象格式无效");
    return value as Record<string, unknown>;
}

function stringField(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
