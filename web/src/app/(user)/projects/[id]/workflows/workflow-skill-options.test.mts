import assert from "node:assert/strict";
import test from "node:test";

import type { SkillOption } from "../../../../../../../services/api/admin-skills.ts";
import type { WorkflowNodeSpec } from "../../../../../../../services/api/workflow-registry.ts";
import { compatibleWorkflowSkillOptions, defaultWorkflowSkillVersionId } from "./workflow-skill-options.ts";

const node: WorkflowNodeSpec = {
    nodeKey: "script",
    name: "剧本整理",
    executorType: "skill",
    skillBinding: { mode: "manual_before_run", skillId: "skill-system-workflow-script", skillVersionId: "", skillVersionConstraint: "", capability: "workflow.stage.script", expectedOutputArtifactType: "production_script", projectTags: [], candidateSkillIds: ["skill-system-workflow-script"] },
    inputBindings: [{ bindingName: "source_text", artifactType: "source_text", source: "workflow_input", workflowInputName: "source_text", required: true }],
    outputArtifactType: "production_script",
    dependsOn: [],
    confirmationPolicy: { requireBeforeRun: true, requireReview: true },
    retryPolicy: { maxAttempts: 2 },
};

const option = (skillId: string, skillVersionId: string, capability: string, input: string, output: string, isRecommended = false): SkillOption => ({
    skillId,
    skillName: skillId,
    summary: "摘要",
    ownerType: "system",
    ownerProjectId: "",
    skillVersionId,
    version: skillVersionId.split("-").at(-1) || "1.0.0",
    contentHash: `sha256:${skillVersionId}`,
    isRecommended,
    manifest: { capabilities: [capability], inputArtifactTypes: [input], outputArtifactTypes: [output], projectTags: [], schemaCompatibility: { [input]: ">=1.0 <2.0" }, sideEffects: ["none"], estimatedCostClass: "text_high" },
    inputBindings: [{ bindingName: input, artifactType: input, required: true, min: 1, max: 1, schemaConstraint: ">=1.0 <2.0", requiresApproval: false }],
    outputBindings: [{ bindingName: output, artifactType: output, min: 1, max: 1, schemaVersion: "1.0.0" }],
});

test("manual workflow options keep only node-contract-compatible versions", () => {
    const options = [
        option("skill-system-workflow-script", "script-3.1", "workflow.stage.script", "source_text", "production_script", true),
        option("skill-system-workflow-script", "script-3.2", "workflow.stage.script", "source_text", "production_script"),
        option("other-script", "other-1.0", "workflow.stage.script", "source_text", "production_script"),
        option("skill-system-workflow-script", "bad-input", "workflow.stage.script", "asset_catalog", "production_script"),
        option("skill-system-workflow-script", "bad-output", "workflow.stage.script", "source_text", "asset_catalog"),
    ];
    assert.deepEqual(compatibleWorkflowSkillOptions(node, options).map((item) => item.skillVersionId), ["script-3.1", "script-3.2"]);
    assert.equal(defaultWorkflowSkillVersionId(node, options, {}), "script-3.1");
    assert.equal(defaultWorkflowSkillVersionId(node, options, { script: "script-3.2" }), "script-3.2");
});
