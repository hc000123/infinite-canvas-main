import assert from "node:assert/strict";
import test from "node:test";

import { agentPlanStatusLabel, buildAgentPlanRequest, buildSourceArtifactInput, canConfirmAgentPlan, canContinueAgentPlan, canPreflightAgentPlan, rebindAgentSkillRefs, reorderAgentSkillRefs } from "./agent-center-utils.ts";

const first = {
    stepKey: "optimize", label: "剧本优化", capability: "script.create", skillId: "skill-1", skillVersionId: "skill-v1", skillVersionConstraint: "", required: true,
    inputBindings: [], parameters: {}, expectedOutputType: "production_script",
};
const second = {
    stepKey: "classify", label: "内容分类", capability: "content.classify", skillId: "skill-2", skillVersionId: "skill-v2", skillVersionConstraint: "", required: true,
    inputBindings: [{ bindingName: "script", fromStepKey: "optimize", fromOutputBinding: "script" }], parameters: {}, expectedOutputType: "content_profile",
};

test("builds a source_text Artifact and ordered Agent Plan request", () => {
    assert.deepEqual(buildSourceArtifactInput({ projectId: "p1", episodeId: "e1", text: " 原始剧本 " }), {
        artifactType: "source_text", schemaVersion: "1.0.0", projectId: "p1", episodeId: "e1", payload: { text: "原始剧本" },
    });
    const request = buildAgentPlanRequest({
        projectId: "p1", episodeId: "e1", agentId: "agent-1", agentVersionId: "agent-v1", sourceArtifact: { id: "a1", contentHash: "h1" },
        sourceBindingName: "source", goal: "优化并分类", skillRefs: [first, second], idempotencyKey: "plan-1",
    });
    assert.deepEqual(request.skillOverrides?.map((item) => item.stepKey), ["optimize", "classify"]);
    assert.equal(request.sourceArtifactRefs[0].bindingName, "source");
    assert.equal(request.sourceArtifactRefs[0].artifactId, "a1");
});

test("reorders Skill refs immutably and guards lifecycle actions", () => {
    const reordered = reorderAgentSkillRefs([first, second], 1, 0);
    assert.deepEqual(reordered.map((item) => item.stepKey), ["classify", "optimize"]);
    assert.deepEqual([first, second].map((item) => item.stepKey), ["optimize", "classify"]);
    assert.equal(canPreflightAgentPlan("draft"), true);
    assert.equal(canPreflightAgentPlan("running"), false);
    assert.equal(canConfirmAgentPlan({ preflightFingerprint: "f1", currentFingerprint: "f2", status: "awaiting_confirmation" }), false);
    assert.equal(canConfirmAgentPlan({ preflightFingerprint: "f1", currentFingerprint: "f1", status: "awaiting_confirmation" }), true);
    assert.equal(canContinueAgentPlan("running"), true);
    assert.equal(canContinueAgentPlan("needs_review"), true);
    assert.equal(canContinueAgentPlan("cancelled"), false);
    assert.equal(agentPlanStatusLabel("needs_review"), "等待审核");
});

test("rebuilds symbolic handoff bindings from selected Skill contracts", () => {
    const options = [
        { skillId: "skill-1", skillVersionId: "skill-v1", skillName: "剧本优化", version: "1.0.0", summary: "", ownerType: "system", ownerProjectId: "", isRecommended: true, manifest: { capabilities: ["script.create"], inputArtifactTypes: ["source_text"], outputArtifactTypes: ["production_script"], projectTags: [], schemaCompatibility: {}, sideEffects: [], estimatedCostClass: "text_low" }, inputBindings: [{ bindingName: "source", artifactType: "source_text", required: true, min: 1, max: 1, schemaConstraint: ">=1.0 <2.0", requiresApproval: false }], outputBindings: [{ bindingName: "script", artifactType: "production_script", min: 1, max: 1, schemaVersion: "1.0.0" }] },
        { skillId: "skill-2", skillVersionId: "skill-v2", skillName: "内容分类", version: "1.0.0", summary: "", ownerType: "system", ownerProjectId: "", isRecommended: true, manifest: { capabilities: ["content.classify"], inputArtifactTypes: ["production_script"], outputArtifactTypes: ["content_profile"], projectTags: [], schemaCompatibility: {}, sideEffects: [], estimatedCostClass: "text_low" }, inputBindings: [{ bindingName: "script", artifactType: "production_script", required: true, min: 1, max: 1, schemaConstraint: ">=1.0 <2.0", requiresApproval: true }], outputBindings: [{ bindingName: "profile", artifactType: "content_profile", min: 1, max: 1, schemaVersion: "1.0.0" }] },
    ] as const;
    const rebound = rebindAgentSkillRefs([first, second], options);
    assert.deepEqual(rebound[0].inputBindings, []);
    assert.deepEqual(rebound[1].inputBindings, [{ bindingName: "script", fromStepKey: "optimize", fromOutputBinding: "script" }]);
    assert.equal(rebound[1].expectedOutputType, "content_profile");
});
