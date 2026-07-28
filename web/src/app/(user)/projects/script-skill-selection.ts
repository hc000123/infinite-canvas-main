import type { SkillOption } from "@/services/api/admin-skills";
import type { AgentPackage, AgentSkillRef } from "@/services/api/agent-registry";

const includes = (values: readonly string[] | undefined, value: string) => Boolean(values?.includes(value));

function scriptRef(pkg: AgentPackage) {
    return pkg.defaultSkillRefs.find((ref) => ref.expectedOutputType === "production_script");
}

export function compatibleScriptSkillOptions(pkg: AgentPackage, options: SkillOption[]) {
    const ref = scriptRef(pkg);
    if (!ref || !pkg.executionPolicy.allowRuntimeSkillOverride) return [];
    const access = pkg.skillAccessPolicy;
    return options.filter((option) => {
        if (!includes(option.manifest.inputArtifactTypes, "source_text") || !includes(option.manifest.outputArtifactTypes, "production_script")) return false;
        if (access.allowedSkillIds.length && !includes(access.allowedSkillIds, option.skillId)) return false;
        if (access.allowedOwnerTypes.length && !includes(access.allowedOwnerTypes, option.ownerType)) return false;
        if (ref.capability && !includes(option.manifest.capabilities, ref.capability)) return false;
        if (access.allowedCapabilities.length && !option.manifest.capabilities.some((capability) => includes(access.allowedCapabilities, capability))) return false;
        if ((option.manifest.requiredTools || []).some((tool) => !includes(pkg.toolPolicy.allowedTools, tool))) return false;
        return true;
    });
}

export function resolveScriptSkillVersionId(pkg: AgentPackage, options: SkillOption[], storedVersionId = "") {
    const compatible = compatibleScriptSkillOptions(pkg, options);
    if (compatible.some((option) => option.skillVersionId === storedVersionId)) return storedVersionId;
    const defaultVersionId = scriptRef(pkg)?.skillVersionId || "";
    return compatible.find((option) => option.skillVersionId === defaultVersionId)?.skillVersionId || compatible[0]?.skillVersionId || "";
}

export function buildScriptSkillOverride(pkg: AgentPackage, options: SkillOption[], versionId: string): AgentSkillRef[] {
    const ref = scriptRef(pkg);
    const selected = compatibleScriptSkillOptions(pkg, options).find((option) => option.skillVersionId === versionId);
    if (!ref || !selected) throw new Error("所选剧本 Skill 已失效或不在系统 Agent 授权范围内");
    return pkg.defaultSkillRefs.map((item) => item.stepKey !== ref.stepKey ? cloneRef(item) : {
        ...cloneRef(item),
        label: selected.skillName,
        capability: ref.capability || selected.manifest.capabilities[0] || "",
        skillId: selected.skillId,
        skillVersionId: selected.skillVersionId,
        skillVersionConstraint: "",
        expectedOutputType: selected.outputBindings.find((output) => output.artifactType === "production_script")?.artifactType || "production_script",
    });
}

function cloneRef(ref: AgentSkillRef): AgentSkillRef {
    return { ...ref, inputBindings: ref.inputBindings.map((binding) => ({ ...binding })), parameters: { ...ref.parameters } };
}
