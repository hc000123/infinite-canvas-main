import assert from "node:assert/strict";
import test from "node:test";

import type { SkillOption } from "@/services/api/admin-skills.ts";
import { compatibleScriptSkillOptions, resolveScriptSkillVersionId } from "./script-skill-selection.ts";

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

test("exposes every published Skill with the script capability and Artifact contract", () => {
    const valid = option({ skillVersionId: "skill-script-v1" });
    const secondSystemSkill = option({ skillId: "alternate-script", skillVersionId: "alternate-script-v2" });
    const wrongCapability = option({ skillVersionId: "wrong-capability", manifest: { ...valid.manifest, capabilities: ["workflow.stage.art"] } });
    const wrongInput = option({ skillVersionId: "wrong-input", manifest: { ...valid.manifest, inputArtifactTypes: ["production_script"] } });
    const wrongOutput = option({ skillVersionId: "wrong-output", manifest: { ...valid.manifest, outputArtifactTypes: ["content_profile"] } });

    assert.deepEqual(compatibleScriptSkillOptions([valid, secondSystemSkill, wrongCapability, wrongInput, wrongOutput]).map((item) => item.skillVersionId), ["skill-script-v1", "alternate-script-v2"]);
});

test("uses stored, recommended, then first compatible Skill version", () => {
    const first = option({ skillVersionId: "skill-script-v1" });
    const recommended = option({ skillId: "skill-script-v2", skillVersionId: "skill-script-v2", isRecommended: true });
    const options = [first, recommended];
    assert.equal(resolveScriptSkillVersionId(options, "skill-script-v1"), "skill-script-v1");
    assert.equal(resolveScriptSkillVersionId(options, "retired-version"), "skill-script-v2");
    assert.equal(resolveScriptSkillVersionId([first], "retired-version"), "skill-script-v1");
});
