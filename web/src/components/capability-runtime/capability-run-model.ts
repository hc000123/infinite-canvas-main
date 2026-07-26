import type { SkillArtifactInputSpec, SkillOption } from "../../services/api/admin-skills";
import type { ArtifactEnvelope, ArtifactRefInput } from "../../services/api/invocations-contract";

export type CapabilityCompatibilityOptions = {
    pendingSourceText?: boolean;
    explicitArtifactIdsByBinding?: Record<string, string>;
};

export type CapabilitySkillCompatibility = {
    compatible: boolean;
    missingBindings: string[];
    selectedArtifactIdsByBinding: Record<string, string>;
    pendingSourceTextBindings: string[];
};

const requiredBinding = (binding: SkillArtifactInputSpec) => binding.required || binding.min > 0;

function selectCapabilityInputs(skill: SkillOption, artifacts: ArtifactEnvelope[], options: CapabilityCompatibilityOptions = {}) {
    const artifactsById = new Map(artifacts.map((item) => [item.artifact.id, item]));
    const usedArtifactIds = new Set<string>();
    const selected = new Map<string, ArtifactEnvelope>();
    const pending = new Set<string>();
    let pendingSourceTextAvailable = Boolean(options.pendingSourceText);

    const allocate = (binding: SkillArtifactInputSpec) => {
        const explicitID = options.explicitArtifactIdsByBinding?.[binding.bindingName]?.trim();
        if (explicitID) {
            const explicit = artifactsById.get(explicitID);
            if (explicit?.artifact.artifactType === binding.artifactType) {
                selected.set(binding.bindingName, explicit);
                usedArtifactIds.add(explicitID);
            }
            return;
        }
        const available = artifacts.find((item) => item.artifact.artifactType === binding.artifactType && !usedArtifactIds.has(item.artifact.id));
        if (available) {
            selected.set(binding.bindingName, available);
            usedArtifactIds.add(available.artifact.id);
            return;
        }
        if (binding.artifactType === "source_text" && pendingSourceTextAvailable) {
            pending.add(binding.bindingName);
            pendingSourceTextAvailable = false;
        }
    };

    skill.inputBindings.filter(requiredBinding).forEach(allocate);
    skill.inputBindings.filter((binding) => !requiredBinding(binding)).forEach(allocate);
    return { selected, pending };
}

export function capabilitySkillCompatibility(skill: SkillOption, artifacts: ArtifactEnvelope[], options: CapabilityCompatibilityOptions = {}): CapabilitySkillCompatibility {
    const { selected, pending } = selectCapabilityInputs(skill, artifacts, options);
    const missingBindings = skill.inputBindings.filter((binding) => requiredBinding(binding) && !selected.has(binding.bindingName) && !pending.has(binding.bindingName)).map((binding) => binding.bindingName);
    return {
        compatible: missingBindings.length === 0,
        missingBindings,
        selectedArtifactIdsByBinding: Object.fromEntries([...selected].map(([bindingName, artifact]) => [bindingName, artifact.artifact.id])),
        pendingSourceTextBindings: skill.inputBindings.filter((binding) => pending.has(binding.bindingName)).map((binding) => binding.bindingName),
    };
}

export function buildCapabilityInputRefs(skill: SkillOption, artifacts: ArtifactEnvelope[], explicitArtifactIdsByBinding: Record<string, string> = {}): ArtifactRefInput[] {
    const { selected } = selectCapabilityInputs(skill, artifacts, { explicitArtifactIdsByBinding });
    return skill.inputBindings.flatMap((binding) => {
        const envelope = selected.get(binding.bindingName);
        return envelope ? [{ bindingName: binding.bindingName, artifactId: envelope.artifact.id, contentHash: envelope.artifact.contentHash }] : [];
    });
}

const nonEmptyText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "";

export function preferredCapabilityOutputText(envelope: ArtifactEnvelope): string {
    const { artifactType } = envelope.artifact;
    if (artifactType === "asset_brief") {
        const brief = nonEmptyText(envelope.payload.brief);
        if (brief) return brief;
    }
    if (artifactType === "production_script") {
        const productionScript = nonEmptyText(envelope.payload.productionScript);
        if (productionScript) return productionScript;
    }
    if (artifactType === "video_prompt_package") {
        const firstItem = Array.isArray(envelope.payload.items) ? envelope.payload.items[0] : undefined;
        const prompt = firstItem && typeof firstItem === "object" ? nonEmptyText((firstItem as Record<string, unknown>).prompt) : "";
        if (prompt) return prompt;
    }
    return JSON.stringify(envelope.payload, null, 2);
}

const routeIssueLabels: Record<string, string> = {
    capability_mismatch: "能力不匹配",
    disabled_skill: "Skill 已停用",
    execution_target_unavailable: "执行通道不可用",
    incompatible_schema_version: "Artifact Schema 版本不兼容",
    input_artifact_type_mismatch: "输入 Artifact 类型不匹配",
    missing_required_binding: "缺少必需输入",
    output_artifact_type_mismatch: "输出 Artifact 类型不匹配",
    project_scope_mismatch: "项目作用域不匹配",
    project_tag_mismatch: "项目标签不匹配",
    version_constraint_mismatch: "Skill 版本不匹配",
};

export function capabilityRouteIssueLabel(code: string): string {
    const stableCode = code.trim() || "unknown";
    return `${routeIssueLabels[stableCode] ?? "未知路由原因"}（${stableCode}）`;
}
