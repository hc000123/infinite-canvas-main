import assert from "node:assert/strict";
import test from "node:test";

import { invocationPollActive, invocationPollNeedsDetail } from "./invocation-poll-state.ts";

const run = (status = "running", latestAttempt = 1) => ({ id: "invocation-1", status, latestRevision: 1, latestAttempt, reviewedAttempt: 0, reviewedArtifactSetHash: "", updatedAt: "first" });
const attempt = (status = "running", number = 1) => ({ attempt: number, status, errorClass: "", finishedAt: "" });

test("polls only execution-active invocation states", () => {
    for (const status of ["queued", "running", "cancel_requested"]) assert.equal(invocationPollActive(status), true);
    for (const status of ["awaiting_confirmation", "needs_review", "approved", "failed", "cancelled", "applied"]) assert.equal(invocationPollActive(status), false);
});

test("requests detail only for meaningful invocation state changes", () => {
    const detail = { run: run(), attempts: [attempt()] };
    assert.equal(invocationPollNeedsDetail(detail, { run: { ...run(), updatedAt: "later" }, attempt: { ...attempt(), updatedAt: "later" } }), false);
    assert.equal(invocationPollNeedsDetail(detail, { run: run("needs_review"), attempt: attempt("succeeded") }), true);
    assert.equal(invocationPollNeedsDetail(detail, { run: run("running", 2), attempt: attempt("running", 2) }), true);
});
