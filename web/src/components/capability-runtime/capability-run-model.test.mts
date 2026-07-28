import assert from "node:assert/strict";
import test from "node:test";

import { buildCapabilityInputRefs, capabilityRouteIssueLabel, capabilityRunActions, capabilitySkillCompatibility, preferredCapabilityOutputText } from "./capability-run-model.ts";
import type { ArtifactEnvelope } from "../../services/api/invocations-contract.ts";
import type { SkillOption } from "../../services/api/admin-skills.ts";

const artifact = (id: string, artifactType: string, payload: Record<string, unknown> = {}): ArtifactEnvelope => ({
    artifact: {
        id,
        userId: "user-1",
        artifactType,
        schemaId: `schema-${artifactType}`,
        schemaVersion: "1.0.0",
        schemaContentHash: `schema-hash-${artifactType}`,
        projectId: "project-1",
        episodeId: "episode-1",
        contentHash: `hash-${id}`,
        createdAt: "2026-07-26T00:00:00Z",
    },
    parentArtifactIds: [],
    payload,
    extensions: {},
});

const skill = (bindings: SkillOption["inputBindings"]): SkillOption => ({
    ownerType: "system",
    ownerProjectId: "",
    summary: "test",
    skillId: "skill-1",
    skillName: "能力测试",
    skillVersionId: "skill-version-1",
    version: "1.0.0",
    contentHash: "sha256:skill-version-1",
    isRecommended: true,
    manifest: {
        capabilities: ["asset.prepare"],
        inputArtifactTypes: bindings.map((item) => item.artifactType),
        outputArtifactTypes: ["asset_brief"],
        projectTags: [],
        schemaCompatibility: {},
        sideEffects: ["none"],
        estimatedCostClass: "text_low",
    },
    inputBindings: bindings,
    outputBindings: [{ bindingName: "brief", artifactType: "asset_brief", min: 1, max: 1, schemaVersion: "1.0.0" }],
});

const binding = (bindingName: string, artifactType: string, required = true): SkillOption["inputBindings"][number] => ({
    bindingName,
    artifactType,
    required,
    min: required ? 1 : 0,
    max: 1,
    schemaConstraint: ">=1.0 <2.0",
    requiresApproval: true,
});

test("capability compatibility fills exact required bindings without blocking on optional inputs", () => {
    const option = skill([binding("source", "source_text"), binding("profile", "content_profile"), binding("reference", "asset_record", false)]);
    const profile = artifact("profile-1", "content_profile");
    assert.deepEqual(capabilitySkillCompatibility(option, [profile], { pendingSourceText: true }), {
        compatible: true,
        missingBindings: [],
        selectedArtifactIdsByBinding: { profile: "profile-1" },
        pendingSourceTextBindings: ["source"],
    });
    assert.deepEqual(capabilitySkillCompatibility(option, [artifact("wrong-1", "asset_record")], { pendingSourceText: true }).missingBindings, ["profile"]);
});

test("implicit allocation never reuses one Artifact across two bindings", () => {
    const option = skill([binding("first", "source_text"), binding("second", "source_text")]);
    const source = artifact("source-1", "source_text");
    assert.deepEqual(capabilitySkillCompatibility(option, [source]).missingBindings, ["second"]);
    assert.equal(capabilitySkillCompatibility(option, [source], { explicitArtifactIdsByBinding: { first: "source-1", second: "source-1" } }).compatible, true);
    assert.deepEqual(buildCapabilityInputRefs(option, [source]), [{ bindingName: "first", artifactId: "source-1", contentHash: "hash-source-1" }]);
    assert.deepEqual(buildCapabilityInputRefs(option, [source], { first: "source-1", second: "source-1" }), [
        { bindingName: "first", artifactId: "source-1", contentHash: "hash-source-1" },
        { bindingName: "second", artifactId: "source-1", contentHash: "hash-source-1" },
    ]);
});

test("output projection prefers known Artifact payload fields then stable JSON", () => {
    assert.equal(preferredCapabilityOutputText(artifact("brief-1", "asset_brief", { brief: "角色设定" })), "角色设定");
    assert.equal(preferredCapabilityOutputText(artifact("script-1", "production_script", { productionScript: "制作稿" })), "制作稿");
    assert.equal(preferredCapabilityOutputText(artifact("prompt-1", "video_prompt_package", { items: [{ prompt: "第一镜" }, { prompt: "第二镜" }] })), "第一镜");
    assert.equal(preferredCapabilityOutputText(artifact("other-1", "content_profile", { b: 2, a: 1 })), '{\n  "b": 2,\n  "a": 1\n}');
});

test("route issue labels retain the stable raw code", () => {
    assert.equal(capabilityRouteIssueLabel("execution_target_unavailable"), "执行通道不可用（execution_target_unavailable）");
    assert.equal(capabilityRouteIssueLabel("future_reason"), "未知路由原因（future_reason）");
});

test("capability run actions expose only valid explicit lifecycle transitions", () => {
    assert.deepEqual(capabilityRunActions("draft"), { canPreflight: true, canConfirm: false, canRefresh: false, canCancel: false, canApprove: false, canReject: false, canRetry: false, canApply: false });
    assert.equal(capabilityRunActions("awaiting_confirmation", { fingerprintMatches: false }).canConfirm, false);
    assert.equal(capabilityRunActions("awaiting_confirmation", { fingerprintMatches: true }).canConfirm, true);
    for (const status of ["queued", "running"] as const) {
        assert.equal(capabilityRunActions(status).canRefresh, true);
        assert.equal(capabilityRunActions(status).canCancel, true);
    }
    assert.equal(capabilityRunActions("cancel_requested").canRefresh, true);
    assert.equal(capabilityRunActions("needs_review").canApprove, true);
    assert.equal(capabilityRunActions("needs_review").canReject, true);
    assert.equal(capabilityRunActions("approved").canApply, true);
    assert.equal(capabilityRunActions("applied").canApply, false);
    for (const status of ["failed", "rejected", "cancelled", "partial"] as const) {
        assert.equal(capabilityRunActions(status).canRetry, true);
    }
});
