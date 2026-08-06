import assert from "node:assert/strict";
import test from "node:test";

import { findRecoverableInvocation } from "./capability-run-recovery.ts";

test("findRecoverableInvocation only restores the current consumer target", () => {
    const runs = [
        { id: "other-node", status: "running", consumerSurface: "canvas", targetKind: "node", targetId: "node-2" },
        { id: "current-node", status: "needs_review", consumerSurface: "canvas", targetKind: "node", targetId: "node-1" },
        { id: "failed-current", status: "failed", consumerSurface: "canvas", targetKind: "node", targetId: "node-1" },
    ];

    assert.equal(findRecoverableInvocation(runs as never, { consumerSurface: "canvas", targetKind: "node", targetId: "node-1" })?.id, "current-node");
});

test("findRecoverableInvocation restores approved work until it is applied", () => {
    const run = { id: "approved", status: "approved", consumerSurface: "image", targetKind: "prompt", targetId: "prompt-main" };
    assert.equal(findRecoverableInvocation([run] as never, { consumerSurface: "image", targetKind: "prompt", targetId: "prompt-main" })?.id, "approved");
});

test("findRecoverableInvocation does not revive older work after a newer terminal run", () => {
    const runs = [
        { id: "newer-applied", status: "applied", consumerSurface: "canvas", targetKind: "node", targetId: "node-1" },
        { id: "older-approved", status: "approved", consumerSurface: "canvas", targetKind: "node", targetId: "node-1" },
    ];
    assert.equal(findRecoverableInvocation(runs as never, { consumerSurface: "canvas", targetKind: "node", targetId: "node-1" }), undefined);
});
