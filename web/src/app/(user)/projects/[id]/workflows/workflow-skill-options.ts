import type { SkillOption } from "@/services/api/admin-skills";
import type { WorkflowNodeSpec } from "@/services/api/workflow-registry";

export function compatibleWorkflowSkillOptions(node: WorkflowNodeSpec, options: SkillOption[]) {
    const binding = node.skillBinding;
    if (!binding) return [];
    const requiredInputs = new Set(node.inputBindings.filter((item) => item.required).map((item) => item.artifactType));
    return options.filter((option) =>
        (!binding.capability || option.manifest.capabilities.includes(binding.capability)) &&
        (!binding.candidateSkillIds.length || binding.candidateSkillIds.includes(option.skillId)) &&
        option.manifest.outputArtifactTypes.includes(binding.expectedOutputArtifactType || node.outputArtifactType) &&
        [...requiredInputs].every((type) => option.manifest.inputArtifactTypes.includes(type)),
    );
}

export function defaultWorkflowSkillVersionId(node: WorkflowNodeSpec, options: SkillOption[], selected: Record<string, string>) {
    const compatible = compatibleWorkflowSkillOptions(node, options);
    if (compatible.some((item) => item.skillVersionId === selected[node.nodeKey])) return selected[node.nodeKey];
    return compatible.find((item) => item.isRecommended)?.skillVersionId || compatible[0]?.skillVersionId || "";
}
