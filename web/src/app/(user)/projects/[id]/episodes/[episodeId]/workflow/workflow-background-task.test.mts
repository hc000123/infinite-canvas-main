import assert from "node:assert/strict";
import test from "node:test";

import { mapWithConcurrency, startBackgroundTask } from "./workflow-background-task.ts";

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

test("runs batch tasks with bounded concurrency and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const running = mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return value * 10;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(active, 2);
    releases.shift()?.();
    releases.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(active, 2);
    releases.splice(0).forEach((release) => release());

    assert.deepEqual(await running, [10, 20, 30, 40]);
    assert.equal(peak, 2);
});
