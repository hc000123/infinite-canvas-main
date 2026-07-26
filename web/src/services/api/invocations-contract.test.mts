import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import axios, { type AxiosRequestConfig } from "axios";

import { createInvocationClient, invocationRequest, type InvocationApiGet, type InvocationApiParams, type InvocationApiPost, type InvocationApiPostEmpty } from "./invocations-contract.ts";
import { apiPostEmpty } from "./request.ts";

test("describes all shared Artifact and Invocation routes", () => {
    assert.deepEqual(invocationRequest.artifacts(), { method: "GET", path: "/api/v1/artifacts" });
    assert.deepEqual(invocationRequest.createArtifact(), { method: "POST", path: "/api/v1/artifacts" });
    assert.deepEqual(invocationRequest.artifactDetail("artifact/1 中"), { method: "GET", path: "/api/v1/artifacts/artifact%2F1%20%E4%B8%AD" });
    assert.deepEqual(invocationRequest.invocations(), { method: "GET", path: "/api/v1/invocations" });
    assert.deepEqual(invocationRequest.create(), { method: "POST", path: "/api/v1/invocations" });
    assert.deepEqual(invocationRequest.detail("inv/1 中"), { method: "GET", path: "/api/v1/invocations/inv%2F1%20%E4%B8%AD" });
    assert.deepEqual(invocationRequest.repreflight("inv/1"), { method: "POST", path: "/api/v1/invocations/inv%2F1/repreflight" });
    assert.deepEqual(invocationRequest.confirm("inv/1"), { method: "POST", path: "/api/v1/invocations/inv%2F1/confirm" });
    assert.deepEqual(invocationRequest.cancel("inv/1"), { method: "POST", path: "/api/v1/invocations/inv%2F1/cancel" });
    assert.deepEqual(invocationRequest.retry("inv/1"), { method: "POST", path: "/api/v1/invocations/inv%2F1/retry" });
    assert.deepEqual(invocationRequest.revalidate("inv/1"), { method: "POST", path: "/api/v1/invocations/inv%2F1/revalidate" });
    assert.deepEqual(invocationRequest.review("inv/1"), { method: "POST", path: "/api/v1/invocations/inv%2F1/review" });
    assert.deepEqual(invocationRequest.apply("inv/1"), { method: "POST", path: "/api/v1/invocations/inv%2F1/apply" });
    assert.deepEqual(invocationRequest.events("inv/1"), { method: "GET", path: "/api/v1/invocations/inv%2F1/events" });
});

test("factory wires all routes to the correct authenticated adapters", async () => {
    type Call = { helper: "GET" | "POST" | "POST_EMPTY"; path: string; params?: InvocationApiParams; body?: unknown; token?: string };
    const calls: Call[] = [];
    let tokenReads = 0;
    const apiGet: InvocationApiGet = async <T>(path: string, params?: InvocationApiParams, token?: string) => {
        calls.push({ helper: "GET", path, params, token });
        return undefined as T;
    };
    const apiPost: InvocationApiPost = async <T>(path: string, body?: unknown, token?: string) => {
        calls.push({ helper: "POST", path, body, token });
        return undefined as T;
    };
    const apiPostEmpty: InvocationApiPostEmpty = async <T>(path: string, token?: string) => {
        calls.push({ helper: "POST_EMPTY", path, token });
        return undefined as T;
    };
    const client = createInvocationClient({ apiGet, apiPost, apiPostEmpty, token: () => `token-${++tokenReads}` });
    const artifact = { artifactType: "source_text", schemaVersion: "1.0.0", payload: { text: "原文" } };
    const invocation = { source: "direct" as const, projectId: "project-1", parameters: { language: "zh-CN" } };
    const confirmation = { requirementCodes: ["credits"] };
    const correction = { attempt: 1, expectedRawOutputHash: "hash-1", output: { text: "修正" } };
    const review = { decision: "approved" as const, attempt: 1, artifactSetHash: "set-1", comment: "ok" };
    const apply = { idempotencyKey: "apply-1", attempt: 1, artifactSetHash: "set-1", target: "test_sink", targetId: "target-1" };

    await client.createArtifact(artifact);
    await client.listArtifacts({ project: "project-1", episode: "", type: "source_text", page: 2, pageSize: 10 });
    await client.getArtifact("artifact/1 中");
    await client.createInvocation(invocation);
    await client.listInvocations({ project: "project-1", source: "direct", status: undefined, skillId: "", page: 3, pageSize: 20 });
    await client.getInvocation("inv/1 中");
    await client.repreflightInvocation("inv/1", invocation);
    await client.confirmInvocation("inv/1", confirmation);
    await client.cancelInvocation("inv/1");
    await client.retryInvocation("inv/1");
    await client.revalidateInvocation("inv/1", correction);
    await client.reviewInvocation("inv/1", review);
    await client.applyInvocation("inv/1", apply);
    await client.listInvocationEvents("inv/1", 17, 25);

    assert.deepEqual(calls, [
        { helper: "POST", path: "/api/v1/artifacts", body: artifact, token: "token-1" },
        { helper: "GET", path: "/api/v1/artifacts", params: { project: "project-1", type: "source_text", page: 2, pageSize: 10 }, token: "token-2" },
        { helper: "GET", path: "/api/v1/artifacts/artifact%2F1%20%E4%B8%AD", params: undefined, token: "token-3" },
        { helper: "POST", path: "/api/v1/invocations", body: invocation, token: "token-4" },
        { helper: "GET", path: "/api/v1/invocations", params: { project: "project-1", source: "direct", page: 3, pageSize: 20 }, token: "token-5" },
        { helper: "GET", path: "/api/v1/invocations/inv%2F1%20%E4%B8%AD", params: undefined, token: "token-6" },
        { helper: "POST", path: "/api/v1/invocations/inv%2F1/repreflight", body: invocation, token: "token-7" },
        { helper: "POST", path: "/api/v1/invocations/inv%2F1/confirm", body: confirmation, token: "token-8" },
        { helper: "POST_EMPTY", path: "/api/v1/invocations/inv%2F1/cancel", token: "token-9" },
        { helper: "POST_EMPTY", path: "/api/v1/invocations/inv%2F1/retry", token: "token-10" },
        { helper: "POST", path: "/api/v1/invocations/inv%2F1/revalidate", body: correction, token: "token-11" },
        { helper: "POST", path: "/api/v1/invocations/inv%2F1/review", body: review, token: "token-12" },
        { helper: "POST", path: "/api/v1/invocations/inv%2F1/apply", body: apply, token: "token-13" },
        { helper: "GET", path: "/api/v1/invocations/inv%2F1/events", params: { after: 17, limit: 25 }, token: "token-14" },
    ]);
    assert.strictEqual(calls[0].body, artifact);
    assert.strictEqual(calls[3].body, invocation);
    assert.strictEqual(calls[6].body, invocation);
    assert.strictEqual(calls[7].body, confirmation);
    assert.strictEqual(calls[10].body, correction);
    assert.strictEqual(calls[11].body, review);
    assert.strictEqual(calls[12].body, apply);
});

test("authenticated empty POST sends a zero-byte body", async () => {
    let captured: AxiosRequestConfig | undefined;
    const previousAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config) => {
        captured = config;
        return { data: { code: 0, data: true, msg: "" }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        assert.equal(await apiPostEmpty<boolean>("/api/v1/invocations/inv-1/cancel", "token-1"), true);
        assert.equal(captured?.method, "post");
        assert.equal(captured?.data, undefined);
        assert.equal(captured?.headers?.Authorization, "Bearer token-1");
    } finally {
        axios.defaults.adapter = previousAdapter;
    }
});

test("frontend response DTOs do not expose backend raw trace fields", async () => {
    const source = await readFile(new URL("./invocations-contract.ts", import.meta.url), "utf8");
    for (const field of ["rawOutput", "structuredOutputJson", "toolTraceJson", "correctionTraceJson", "retryPlanJson", "receiptJson", "dataJson", "skillSnapshotJson"]) {
        assert.doesNotMatch(source, new RegExp(`\\b${field}\\??:`));
    }
});
