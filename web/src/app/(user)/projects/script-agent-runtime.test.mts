import assert from "node:assert/strict";
import test from "node:test";

import { approveScriptAgentResult, assertScriptReviewMatches, executeScriptAgentToReview, preflightScriptAgent, resolveSystemScriptAgent } from "./script-agent-runtime.ts";

const artifact = {
    artifact: { id: "source-1", contentHash: "sha256:source" },
    parentArtifactIds: [],
    payload: { text: "原始剧本" },
    extensions: {},
};

const preflight = {
    plan: { id: "plan-1", currentRevision: 1, confirmationFingerprint: "fingerprint-1", status: "awaiting_confirmation", estimatedCredits: 2 },
    revision: { id: "revision-1" },
    steps: [],
    confirmationRequirements: [{ code: "api_cost", message: "将消耗 2 Credits" }],
};

test("resolveSystemScriptAgent uses the registry recommended version", () => {
    assert.deepEqual(resolveSystemScriptAgent([{ agent: { id: "agent-system-art", recommendedVersionId: "agent-version-system-art-1.0.0" } }, { agent: { id: "agent-system-script", recommendedVersionId: "agent-version-system-script-1.1.0" } }]), {
        agentId: "agent-system-script",
        agentVersionId: "agent-version-system-script-1.1.0",
    });
    assert.throws(() => resolveSystemScriptAgent([]), /剧本制作 Agent/);
});

test("assertScriptReviewMatches blocks edited text from being approved under another Artifact hash", () => {
    assert.doesNotThrow(() => assertScriptReviewMatches("生产剧本\n", { productionScript: "生产剧本" }));
    assert.throws(() => assertScriptReviewMatches("手动改写", { productionScript: "生产剧本" }), /已变更/);
});

test("preflightScriptAgent freezes the registry recommended Agent version and source Artifact", async () => {
    const calls: Array<[string, unknown]> = [];
    const result = await preflightScriptAgent(
        {
            createArtifact: async (input) => {
                calls.push(["artifact", input]);
                return artifact as never;
            },
            createAgentPlan: async (input) => {
                calls.push(["plan", input]);
                return { plan: { id: "plan-1" } } as never;
            },
            preflightAgentPlan: async (id) => {
                calls.push(["preflight", id]);
                return preflight as never;
            },
        },
        {
            projectId: "project-1",
            episodeId: "episode-1",
            episodeTitle: "第 1 集",
            sourceText: "原始剧本",
            agent: { agentId: "agent-system-script", agentVersionId: "agent-version-system-script-1.0.0" },
            idempotencyKey: "script-plan-1",
        },
    );

    assert.equal(result.sourceArtifact.artifact.id, "source-1");
    assert.equal(result.preflight.plan.id, "plan-1");
    assert.deepEqual(calls, [
        ["artifact", { artifactType: "source_text", schemaVersion: "1.0.0", projectId: "project-1", episodeId: "episode-1", payload: { text: "原始剧本" } }],
        [
            "plan",
            {
                projectId: "project-1",
                episodeId: "episode-1",
                agentId: "agent-system-script",
                agentVersionId: "agent-version-system-script-1.0.0",
                goal: "将《第 1 集》整理为下游可直接使用的生产剧本",
                sourceArtifactRefs: [{ bindingName: "source_text", artifactId: "source-1", contentHash: "sha256:source" }],
                idempotencyKey: "script-plan-1",
            },
        ],
        ["preflight", "plan-1"],
    ]);
});

test("executeScriptAgentToReview confirms frozen requirements and returns an unapproved production Artifact", async () => {
    let continues = 0;
    const calls: Array<[string, unknown]> = [];
    const result = await executeScriptAgentToReview(
        {
            confirmAgentPlan: async (id, input) => {
                calls.push(["confirm", { id, input }]);
                return { plan: { id, status: "running" } } as never;
            },
            continueAgentPlan: async (id) => {
                calls.push(["continue", id]);
                continues += 1;
                return continues === 1
                    ? ({ plan: { id, status: "running" }, steps: [{ step: { invocationId: "invocation-1", status: "queued" } }] } as never)
                    : ({ plan: { id, status: "needs_review" }, steps: [{ step: { invocationId: "invocation-1", status: "needs_review" } }] } as never);
            },
            getInvocation: async (id) => {
                calls.push(["invocation", id]);
                return {
                    run: { id, status: "needs_review", latestAttempt: 1 },
                    artifactSetHash: "sha256:set",
                    outputArtifacts: [{ artifact: { id: "production-1", artifactType: "production_script" }, payload: { productionScript: "生产剧本" } }],
                } as never;
            },
            wait: async () => undefined,
        },
        preflight as never,
        { pollIntervalMs: 1, maxPolls: 2 },
    );

    assert.equal(result.productionScript, "生产剧本");
    assert.equal(result.invocationId, "invocation-1");
    assert.equal(result.artifactId, "production-1");
    assert.equal(result.artifactSetHash, "sha256:set");
    assert.equal(calls[0]?.[0], "confirm");
    assert.deepEqual((calls[0]?.[1] as { input: unknown }).input, { revision: 1, fingerprint: "fingerprint-1", requirementCodes: ["api_cost"] });
    assert.equal(calls.filter(([name]) => name === "continue").length, 2);
});

test("approveScriptAgentResult records the human review before completing the Plan", async () => {
    const calls: Array<[string, unknown]> = [];
    await approveScriptAgentResult(
        {
            reviewInvocation: async (id, input) => {
                calls.push(["review", { id, input }]);
                return {} as never;
            },
            continueAgentPlan: async (id) => {
                calls.push(["continue", id]);
                return { plan: { id, status: "completed" } } as never;
            },
        },
        { planId: "plan-1", invocationId: "invocation-1", attempt: 1, artifactSetHash: "sha256:set" },
    );
    assert.deepEqual(calls, [
        ["review", { id: "invocation-1", input: { decision: "approved", attempt: 1, artifactSetHash: "sha256:set", comment: "项目分集剧本人工批准" } }],
        ["continue", "plan-1"],
    ]);
});
