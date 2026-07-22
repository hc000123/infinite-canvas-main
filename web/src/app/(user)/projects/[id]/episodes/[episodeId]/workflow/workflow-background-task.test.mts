import assert from "node:assert/strict";
import test from "node:test";

import { startBackgroundTask } from "./workflow-background-task.ts";

test("starts generation without returning its pending promise", () => {
    let started = false;
    const pending = new Promise<void>(() => undefined);

    const result = startBackgroundTask(() => {
        started = true;
        return pending;
    });

    assert.equal(started, true);
    assert.equal(result, undefined);
});

test("forwards an unexpected background failure", async () => {
    const failure = new Error("generation failed");
    let received: unknown;

    startBackgroundTask(() => Promise.reject(failure), (error) => {
        received = error;
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(received, failure);
});
