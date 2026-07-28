import assert from "node:assert/strict";
import test from "node:test";

import type { SkillOption } from "../../../../services/api/admin-skills.ts";
import { buildCanvasOrchestratorSystemPrompt, resolveCanvasOrchestratorDecision } from "./canvas-orchestrator-plan.ts";

const option = (skillVersionId: string, input: string, output: string): SkillOption => ({
    skillId: skillVersionId.replace("version", "skill"), skillName: skillVersionId, skillVersionId, version: "1.0.0", summary: "", ownerType: "system", ownerProjectId: "", isRecommended: true,
    manifest: { capabilities: [`capability.${skillVersionId}`], inputArtifactTypes: [input], outputArtifactTypes: [output], projectTags: [], schemaCompatibility: {}, sideEffects: [], estimatedCostClass: "text_low" },
    inputBindings: [{ bindingName: input, artifactType: input, required: true, min: 1, max: 1, schemaConstraint: ">=1.0 <2.0", requiresApproval: false }],
    outputBindings: [{ bindingName: output, artifactType: output, min: 1, max: 1, schemaVersion: "1.0.0" }],
});

const catalog = [option("version-script", "source_text", "production_script"), option("version-assets", "production_script", "asset_catalog")];

test("accepts an ordinary answer without creating Skill refs", () => {
    assert.deepEqual(resolveCanvasOrchestratorDecision(JSON.stringify({ kind: "answer", answer: "可以，先选中剧本节点。" }), catalog, 12), { kind: "answer", answer: "可以，先选中剧本节点。" });
});

test("reconstructs trusted Skill refs and adjacent bindings from the catalog", () => {
    const result = resolveCanvasOrchestratorDecision(JSON.stringify({
        kind: "plan", summary: "先整理剧本，再提取资产", steps: [
            { stepKey: "script", skillVersionId: "version-script", parameters: { tone: "紧凑" }, reason: "先形成生产稿" },
            { stepKey: "assets", skillVersionId: "version-assets", reason: "再提取资产" },
        ],
    }), catalog, 12);
    assert.equal(result.kind, "plan");
    if (result.kind !== "plan") return;
    assert.equal(result.sourceBindingName, "source_text");
    assert.deepEqual(result.skillRefs[0], {
        stepKey: "script", label: "version-script", capability: "capability.version-script", skillId: "skill-script", skillVersionId: "version-script", skillVersionConstraint: "", required: true,
        inputBindings: [{ bindingName: "source_text" }], parameters: { tone: "紧凑" }, expectedOutputType: "production_script",
    });
    assert.deepEqual(result.skillRefs[1].inputBindings, [{ bindingName: "production_script", fromStepKey: "script", fromOutputBinding: "production_script" }]);
});

test("rejects invented versions, duplicate keys, oversized plans, invalid source input, and incompatible handoffs", () => {
    const decision = (steps: unknown[]) => JSON.stringify({ kind: "plan", summary: "test", steps });
    const step = (stepKey: string, skillVersionId: string) => ({ stepKey, skillVersionId, reason: "test" });
    assert.throws(() => resolveCanvasOrchestratorDecision(decision([step("x", "missing")]), catalog, 12), /Skill 版本/);
    assert.throws(() => resolveCanvasOrchestratorDecision(decision([step("same", "version-script"), step("same", "version-assets")]), catalog, 12), /重复/);
    assert.throws(() => resolveCanvasOrchestratorDecision(decision([step("a", "version-script"), step("b", "version-assets")]), catalog, 1), /步骤/);
    assert.throws(() => resolveCanvasOrchestratorDecision(decision([step("assets", "version-assets")]), catalog, 12), /source_text/);
    assert.throws(() => resolveCanvasOrchestratorDecision(decision([step("script", "version-script"), step("broken", "version-script")]), catalog, 12), /契约/);
});

test("planner prompt exposes only catalog facts and strict decision fields", () => {
    const prompt = buildCanvasOrchestratorSystemPrompt("只做可信规划", catalog, 12);
    assert.match(prompt, /只做可信规划/);
    assert.match(prompt, /version-script/);
    assert.match(prompt, /kind/);
    assert.match(prompt, /skillVersionId/);
    assert.doesNotMatch(prompt, /files|qualityGateProfile/);
});
