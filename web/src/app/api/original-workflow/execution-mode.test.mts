import assert from "node:assert/strict";
import test from "node:test";

import { CLOUD_EXECUTOR_UNAVAILABLE, requireCloudExecutionMode } from "./execution-mode.ts";
import { POST as workflowPost } from "./route.ts";
import { POST as scriptOptimizerPost } from "./script-optimizer/route.ts";

test("workflow execution defaults to cloud and rejects local Codex CLI", () => {
    assert.equal(requireCloudExecutionMode(), "cloud-worker");
    assert.equal(requireCloudExecutionMode("cloud-worker"), "cloud-worker");
    assert.throws(() => requireCloudExecutionMode("local-runner"), /生产环境已禁用本地 Codex CLI/);
});

test("original workflow route rejects local runner before any local file access", async () => {
    const response = await workflowPost(
        new Request("http://localhost/api/original-workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start-stage", executionMode: "local-runner", stage: "stage1" }),
        }) as never,
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.data.error, /生产环境已禁用本地 Codex CLI/);
});

test("cloud workflow actions use one unavailable message", async () => {
    const workflowResponse = await workflowPost(
        new Request("http://localhost/api/original-workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start-stage", executionMode: "cloud-worker", stage: "stage1" }),
        }) as never,
    );
    const optimizerResponse = await scriptOptimizerPost(
        new Request("http://localhost/api/original-workflow/script-optimizer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ executionMode: "cloud-worker", messages: [{ role: "user", content: "test" }] }),
        }) as never,
    );
    const workflowBody = await workflowResponse.json();
    const optimizerBody = await optimizerResponse.json();

    assert.match(workflowBody.data.error, new RegExp(CLOUD_EXECUTOR_UNAVAILABLE));
    assert.match(optimizerBody.data.error, new RegExp(CLOUD_EXECUTOR_UNAVAILABLE));
});

test("script optimizer route rejects local runner", async () => {
    const response = await scriptOptimizerPost(
        new Request("http://localhost/api/original-workflow/script-optimizer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ executionMode: "local-runner", messages: [{ role: "user", content: "test" }] }),
        }) as never,
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.data.error, /生产环境已禁用本地 Codex CLI/);
});
