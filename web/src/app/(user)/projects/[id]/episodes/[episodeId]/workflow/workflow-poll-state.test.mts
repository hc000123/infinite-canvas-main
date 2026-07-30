import assert from "node:assert/strict";
import test from "node:test";

import { appendWorkflowEvents, workflowPollFingerprint, workflowPollNeedsDetail } from "./workflow-poll-state.ts";

const event = (cursor: number) => ({ cursor, userId: "user-1", workflowRunId: "run-1", stageRunId: "stage-1", agentRunId: "", type: `event-${cursor}`, level: "info", dataJson: "{}", createdAt: "2026-07-30T00:00:00Z" });
const stage = (status = "running", attempt = 1, errorMessage = "") => ({ id: "stage-1", stageId: "asset-extraction", invocationId: "invocation-1", status, attempt, errorMessage, updatedAt: "2026-07-30T00:00:00Z" });

test("appends workflow events once by cursor", () => {
    assert.deepEqual(appendWorkflowEvents([event(1), event(2)], [event(2), event(3)]).map((item) => item.cursor), [1, 2, 3]);
});

test("workflow poll fingerprint ignores timestamps", () => {
    const first = { status: "active", updatedAt: "first", stages: [stage()] };
    const second = { ...first, updatedAt: "second", stages: [{ ...stage(), updatedAt: "second" }] };
    assert.equal(workflowPollFingerprint(first), workflowPollFingerprint(second));
});

test("requests detail only when run or stage state changes", () => {
    const detail = { run: { status: "active" }, stages: [stage()] };
    assert.equal(workflowPollNeedsDetail(detail, { status: "active", stages: [{ ...stage(), updatedAt: "later" }] }), false);
    assert.equal(workflowPollNeedsDetail(detail, { status: "active", stages: [stage("running", 2)] }), true);
    assert.equal(workflowPollNeedsDetail(detail, { status: "active", stages: [stage("failed", 1, "上游失败")] }), true);
    assert.equal(workflowPollNeedsDetail(detail, { status: "completed", stages: [stage()] }), true);
});
