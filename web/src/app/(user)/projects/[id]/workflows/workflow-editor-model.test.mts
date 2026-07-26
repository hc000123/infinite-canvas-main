import assert from "node:assert/strict";
import test from "node:test";

import type { WorkflowPackage, WorkflowNodeSpec } from "../../../../../../../services/api/workflow-registry.ts";
import { addWorkflowNode, createWorkflowNode, removeWorkflowNode, setWorkflowSkillBindingMode, topologicalWorkflowLanes, workflowRouteIssueLabel, workflowSourceInputNames } from "./workflow-editor-model.ts";

const skillNode = (nodeKey: string, outputArtifactType: string, dependsOn: string[] = []): WorkflowNodeSpec => ({
    nodeKey,
    name: nodeKey,
    executorType: "skill",
    skillBinding: { mode: "fixed", skillId: `${nodeKey}-skill`, skillVersionId: `${nodeKey}-v1`, skillVersionConstraint: "", capability: "", expectedOutputArtifactType: "", projectTags: [], candidateSkillIds: [] },
    inputBindings: dependsOn.map((fromNodeKey) => ({ bindingName: fromNodeKey, artifactType: "source_text", source: "node_output", fromNodeKey, fromOutputBinding: "output", required: true })),
    outputArtifactType,
    dependsOn,
    confirmationPolicy: { requireBeforeRun: false, requireReview: true },
    retryPolicy: { maxAttempts: 2 },
});

test("topological lanes keep parallel roots together and join after both", () => {
    const pkg: WorkflowPackage = { inputArtifactTypes: ["source_text"], contentHash: "", nodes: [skillNode("assets", "asset_catalog"), skillNode("classify", "content_profile"), skillNode("storyboard", "storyboard_package", ["assets", "classify"])] };
    assert.deepEqual(topologicalWorkflowLanes(pkg).map((lane) => lane.map((node) => node.nodeKey)), [["assets", "classify"], ["storyboard"]]);
});

test("removing a node cleans dependency and node-output bindings", () => {
    const pkg: WorkflowPackage = { inputArtifactTypes: ["source_text"], contentHash: "hash", nodes: [skillNode("script", "production_script"), skillNode("storyboard", "storyboard_package", ["script"])] };
    const removed = removeWorkflowNode(pkg, "script");
    assert.equal(removed.contentHash, "");
    assert.deepEqual(removed.nodes[0]?.dependsOn, []);
    assert.deepEqual(removed.nodes[0]?.inputBindings, []);
});

test("new nodes get stable unique keys and binding modes serialize explicitly", () => {
    const pkg: WorkflowPackage = { inputArtifactTypes: ["source_text"], contentHash: "", nodes: [skillNode("skill_1", "production_script")] };
    const node = createWorkflowNode(pkg, "skill");
    assert.equal(node.nodeKey, "skill_2");
    const added = addWorkflowNode(pkg, node);
    const routed = setWorkflowSkillBindingMode(added.nodes[1]!, "manual_before_run");
    assert.equal(routed.skillBinding?.mode, "manual_before_run");
    assert.equal(routed.skillBinding?.skillVersionId, "");
    assert.equal(routed.skillBinding?.expectedOutputArtifactType, routed.outputArtifactType);
});

test("stable route block codes keep raw code visible beside Chinese guidance", () => {
    assert.equal(workflowRouteIssueLabel("manual_selection_required"), "运行前必须选择一个兼容的 Skill 版本（manual_selection_required）");
    assert.equal(workflowRouteIssueLabel("future_code"), "工作流节点被阻断（future_code）");
});

test("source text artifact is bound once to every distinct workflow input name", () => {
    const first = skillNode("assets", "asset_catalog");
    first.inputBindings = [
        { bindingName: "source", artifactType: "source_text", source: "workflow_input", workflowInputName: "script", required: true },
        { bindingName: "optional", artifactType: "source_text", source: "workflow_input", workflowInputName: "script", required: false },
    ];
    const second = skillNode("classify", "content_profile");
    second.inputBindings = [{ bindingName: "source", artifactType: "source_text", source: "workflow_input", workflowInputName: "classification_source", required: true }];
    assert.deepEqual(workflowSourceInputNames({ inputArtifactTypes: ["source_text"], contentHash: "", nodes: [first, second] }), ["script", "classification_source"]);
});
