import assert from "node:assert/strict";
import test from "node:test";

import { applyScriptInvocationResult, approveScriptInvocationResult, executeScriptInvocationToReview, preflightScriptInvocation, resumeScriptInvocationToReview } from "./script-invocation-runtime.ts";

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
            consumerSurface: "project_episode",
            targetKind: "episode",
            targetId: "episode-1",
            parameters: {},
            idempotencyKey: "script-invocation-1",
        }],
    ]);
    assert.equal(JSON.stringify(calls).includes("agent"), false);
});

test("resumeScriptInvocationToReview continues an existing run and accepts an already approved result", async () => {
    const calls: string[] = [];
    const result = await resumeScriptInvocationToReview({
        getInvocation: async (id) => {
            calls.push(id);
            return {
                run: { id, status: "approved", latestAttempt: 2 },
                artifactSetHash: "sha256:set-2",
                outputArtifacts: [{ artifact: { id: "production-2", artifactType: "production_script" }, payload: { productionScript: "恢复后的剧本" } }],
            } as never;
        },
        reviewInvocation: async () => {
            throw new Error("已批准的 Invocation 不应重复审核");
        },
        wait: async () => undefined,
    }, "invocation-2", { maxPolls: 1 });

    assert.deepEqual(calls, ["invocation-2"]);
    assert.equal(result.productionScript, "恢复后的剧本");
});

test("executeScriptInvocationToReview confirms and immediately approves the production Artifact", async () => {
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
            reviewInvocation: async (id, input) => {
                calls.push(["review", { id, input }]);
                return {} as never;
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
    assert.deepEqual(calls.at(-1), ["review", { id: "invocation-1", input: { decision: "approved", attempt: 1, artifactSetHash: "sha256:set", comment: "项目分集剧本自动批准" } }]);
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

test("applyScriptInvocationResult records an idempotent local receipt", async () => {
    const calls: unknown[] = [];
    await applyScriptInvocationResult({ applyInvocation: async (id, input) => { calls.push({ id, input }); return {} as never; } }, { invocationId: "invocation-1", attempt: 2, artifactSetHash: "sha256:set", artifactId: "production-1", productionScript: "生产剧本" }, "episode-1");
    assert.deepEqual(calls, [{ id: "invocation-1", input: { idempotencyKey: "project-episode-invocation-1-2", attempt: 2, artifactSetHash: "sha256:set", target: "client_local_receipt", targetId: "episode-1", payload: { surface: "project_episode", targetKind: "episode", targetId: "episode-1", artifactIds: ["production-1"] } } }]);
});
