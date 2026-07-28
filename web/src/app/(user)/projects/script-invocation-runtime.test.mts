import assert from "node:assert/strict";
import test from "node:test";

import { approveScriptInvocationResult, assertScriptReviewMatches, executeScriptInvocationToReview, preflightScriptInvocation } from "./script-invocation-runtime.ts";

const sourceArtifact = {
    artifact: { id: "source-1", contentHash: "sha256:source" },
    parentArtifactIds: [],
    payload: { text: "原始剧本" },
    extensions: {},
};

const preflight = {
    run: { id: "invocation-1", status: "awaiting_confirmation" },
    revision: { skillVersionId: "skill-version-system-workflow-script-3.2.0" },
    executionPolicy: { estimatedCredits: 2 },
    confirmationRequirements: ["api_cost"],
    blockReasons: [],
};

test("preflightScriptInvocation freezes only the selected Skill and source Artifact", async () => {
    const calls: Array<[string, unknown]> = [];
    const prepared = await preflightScriptInvocation(
        {
            createArtifact: async (input) => {
                calls.push(["artifact", input]);
                return sourceArtifact as never;
            },
            createInvocation: async (input) => {
                calls.push(["invocation", input]);
                return preflight as never;
            },
        },
        {
            projectId: "project-1",
            episodeId: "episode-1",
            sourceText: "原始剧本",
            skillVersionId: "skill-version-system-workflow-script-3.2.0",
            idempotencyKey: "script-invocation-1",
        },
    );

    assert.equal(prepared.preflight.run.id, "invocation-1");
    assert.deepEqual(calls, [
        ["artifact", { artifactType: "source_text", schemaVersion: "1.0.0", projectId: "project-1", episodeId: "episode-1", payload: { text: "原始剧本" } }],
        ["invocation", {
            source: "direct",
            projectId: "project-1",
            episodeId: "episode-1",
            skillVersionId: "skill-version-system-workflow-script-3.2.0",
            expectedOutputArtifactType: "production_script",
            inputArtifactRefs: [{ bindingName: "source_text", artifactId: "source-1", contentHash: "sha256:source" }],
            parameters: {},
            idempotencyKey: "script-invocation-1",
        }],
    ]);
    assert.equal(JSON.stringify(calls).includes("agent"), false);
});

test("executeScriptInvocationToReview confirms requirements and returns an unapproved production Artifact", async () => {
    let polls = 0;
    const calls: Array<[string, unknown]> = [];
    const result = await executeScriptInvocationToReview(
        {
            confirmInvocation: async (id, input) => {
                calls.push(["confirm", { id, input }]);
                return {} as never;
            },
            getInvocation: async (id) => {
                calls.push(["detail", id]);
                polls += 1;
                return polls === 1
                    ? ({ run: { id, status: "running", latestAttempt: 1 }, artifactSetHash: "", outputArtifacts: [] } as never)
                    : ({ run: { id, status: "needs_review", latestAttempt: 1 }, artifactSetHash: "sha256:set", outputArtifacts: [{ artifact: { id: "production-1", artifactType: "production_script" }, payload: { productionScript: "生产剧本" } }] } as never);
            },
            wait: async () => undefined,
        },
        preflight as never,
        { pollIntervalMs: 1, maxPolls: 2 },
    );

    assert.deepEqual(calls[0], ["confirm", { id: "invocation-1", input: { requirementCodes: ["api_cost"] } }]);
    assert.equal(result.invocationId, "invocation-1");
    assert.equal(result.artifactId, "production-1");
    assert.equal(result.artifactSetHash, "sha256:set");
    assert.equal(result.productionScript, "生产剧本");
});

test("approveScriptInvocationResult records review without continuing an Agent Plan", async () => {
    const calls: Array<[string, unknown]> = [];
    await approveScriptInvocationResult(
        {
            reviewInvocation: async (id, input) => {
                calls.push(["review", { id, input }]);
                return {} as never;
            },
        },
        { invocationId: "invocation-1", attempt: 1, artifactSetHash: "sha256:set", artifactId: "production-1", productionScript: "生产剧本" },
    );
    assert.deepEqual(calls, [["review", { id: "invocation-1", input: { decision: "approved", attempt: 1, artifactSetHash: "sha256:set", comment: "项目分集剧本人工批准" } }]]);
});

test("assertScriptReviewMatches rejects text changed after Artifact generation", () => {
    assert.doesNotThrow(() => assertScriptReviewMatches("生产剧本\n", { productionScript: "生产剧本" }));
    assert.throws(() => assertScriptReviewMatches("手动改写", { productionScript: "生产剧本" }), /已变更/);
});
