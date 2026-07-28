import assert from "node:assert/strict";
import test from "node:test";

import type { SkillOption } from "@/services/api/admin-skills.ts";
import type { AgentPackage } from "@/services/api/agent-registry.ts";
import { buildScriptSkillOverride, compatibleScriptSkillOptions, resolveScriptSkillVersionId } from "./script-skill-selection.ts";

const pkg: AgentPackage = {
    rolePrompt: "统筹剧本生产。",
    plannerMode: "configured_chain",
    defaultSkillRefs: [{ stepKey: "script", label: "默认剧本整理", capability: "workflow.stage.script", skillId: "skill-script", skillVersionId: "skill-script-v1", skillVersionConstraint: "", required: true, inputBindings: [], parameters: { tone: "short" }, expectedOutputType: "production_script" }],
    skillAccessPolicy: { allowedSkillIds: ["skill-script", "skill-script-alt"], allowedCapabilities: ["workflow.stage.script"], allowedOwnerTypes: ["system"] },
    modelPolicy: { preferredModel: "", allowedModels: [], reasoningLevel: "", temperature: 0, maxOutputTokens: 0 },
    toolPolicy: { allowedTools: ["script.lookup"] },
    executionPolicy: { maxSteps: 1, allowRuntimeSkillOverride: true, allowBatch: false },
    contentHash: "agent-hash",
};

function option(overrides: Partial<SkillOption> & { skillVersionId: string }): SkillOption {
    return {
        skillId: "skill-script",
        skillName: "剧本整理",
        skillVersionId: overrides.skillVersionId,
        version: "1.0.0",
        summary: "",
        ownerType: "system",
        ownerProjectId: "",
        isRecommended: false,
        manifest: { capabilities: ["workflow.stage.script"], inputArtifactTypes: ["source_text"], outputArtifactTypes: ["production_script"], projectTags: [], schemaCompatibility: { source_text: ">=1.0 <2.0" }, sideEffects: ["none"], estimatedCostClass: "text_low", requiredTools: [] },
        inputBindings: [{ bindingName: "source_text", artifactType: "source_text", required: true, min: 1, max: 1, schemaConstraint: ">=1.0 <2.0", requiresApproval: false }],
        outputBindings: [{ bindingName: "production_script", artifactType: "production_script", min: 1, max: 1, schemaVersion: "1.0.0" }],
        ...overrides,
    };
}

test("only exposes script Skills allowed by the fixed Agent package", () => {
    const valid = option({ skillVersionId: "skill-script-v1" });
    const alternate = option({ skillId: "skill-script-alt", skillVersionId: "skill-script-alt-v2", version: "2.0.0", manifest: { ...valid.manifest, requiredTools: ["script.lookup"] } });
    const wrongOwner = option({ skillVersionId: "wrong-owner", ownerType: "project", ownerProjectId: "p1" });
    const wrongSkill = option({ skillId: "unapproved", skillVersionId: "wrong-skill" });
    const wrongCapability = option({ skillVersionId: "wrong-capability", manifest: { ...valid.manifest, capabilities: ["workflow.stage.art"] } });
    const wrongInput = option({ skillVersionId: "wrong-input", manifest: { ...valid.manifest, inputArtifactTypes: ["production_script"] } });
    const wrongOutput = option({ skillVersionId: "wrong-output", manifest: { ...valid.manifest, outputArtifactTypes: ["content_profile"] } });
    const wrongTool = option({ skillVersionId: "wrong-tool", manifest: { ...valid.manifest, requiredTools: ["web.search"] } });

    assert.deepEqual(compatibleScriptSkillOptions(pkg, [valid, alternate, wrongOwner, wrongSkill, wrongCapability, wrongInput, wrongOutput, wrongTool]).map((item) => item.skillVersionId), ["skill-script-v1", "skill-script-alt-v2"]);
});

test("uses a stored compatible version and safely falls back to the Agent default", () => {
    const options = [option({ skillVersionId: "skill-script-v1" }), option({ skillId: "skill-script-alt", skillVersionId: "skill-script-alt-v2" })];
    assert.equal(resolveScriptSkillVersionId(pkg, options, "skill-script-alt-v2"), "skill-script-alt-v2");
    assert.equal(resolveScriptSkillVersionId(pkg, options, "retired-version"), "skill-script-v1");
    assert.equal(resolveScriptSkillVersionId(pkg, [options[1]], "retired-version"), "skill-script-alt-v2");
});

test("builds a full exact Skill override without changing the Agent step semantics", () => {
    const selected = option({ skillId: "skill-script-alt", skillName: "竖屏短剧整理", skillVersionId: "skill-script-alt-v2", version: "2.0.0" });
    const overrides = buildScriptSkillOverride(pkg, [selected], selected.skillVersionId);
    assert.deepEqual(overrides, [{ stepKey: "script", label: "竖屏短剧整理", capability: "workflow.stage.script", skillId: "skill-script-alt", skillVersionId: "skill-script-alt-v2", skillVersionConstraint: "", required: true, inputBindings: [], parameters: { tone: "short" }, expectedOutputType: "production_script" }]);
});
