import assert from "node:assert/strict";
import test from "node:test";

import { aiTaskLedgerFromGeneration, aiTaskRequestHeaders, aiTaskTraceHeaders, buildGenerationTaskLedger, generationTaskSummary, preserveVideoTaskLedger, readAiTaskLedgerFromHeaders } from "./ai-task-trace-utils.ts";

test("preserves missing video ledger fields while preferring fields from the latest task", () => {
    const previous = {
        id: "upstream-old",
        status: "queued",
        aiTaskId: "aitask-old",
        upstreamTaskId: "upstream-old",
        aiTaskStatus: "queued",
        aiTaskCredits: 8,
        creditLogId: "credit-old",
        creditsRefunded: 3,
        refundedAt: "refund-old",
        finishedAt: "finish-old",
    };
    const partial = preserveVideoTaskLedger({ id: "upstream-old", status: "running", aiTaskId: "aitask-old" }, previous);
    assert.deepEqual(partial, { ...previous, status: "running", aiTaskStatus: "running" });

    const latest = {
        id: "upstream-new",
        status: "succeeded",
        aiTaskId: "aitask-new",
        upstreamTaskId: "upstream-new",
        aiTaskStatus: "succeeded",
        aiTaskCredits: 0,
        creditLogId: "credit-new",
        creditsRefunded: 0,
        refundedAt: "refund-new",
        finishedAt: "finish-new",
    };
    assert.deepEqual(preserveVideoTaskLedger(latest, previous), latest);
});

test("attaches owned ai task id to video lifecycle requests", () => {
    assert.deepEqual(aiTaskRequestHeaders("  aitask-video-1  "), { "X-AI-Task-ID": "aitask-video-1" });
    assert.deepEqual(aiTaskRequestHeaders("  "), {});
    assert.deepEqual(aiTaskRequestHeaders(undefined), {});
});

test("attaches ai task trace header through the unified backend channel", () => {
    const trace = { projectId: "project-1", canvasId: "canvas-1", nodeId: "node-1", shotIds: ["shot-1"] };
    const headers = aiTaskTraceHeaders({ channelMode: "local" } as any, trace);
    assert.ok(headers["X-Infinite-Canvas-Trace"]);
    assert.deepEqual(JSON.parse(headers["X-Infinite-Canvas-Trace"]), {
        projectId: "project-1",
        canvasId: "canvas-1",
        nodeId: "node-1",
        shotIds: ["shot-1"],
    });
});

test("reads ai task ledger from response headers and generation metadata", () => {
    assert.deepEqual(readAiTaskLedgerFromHeaders({ "x-ai-task-id": "aitask-1", "x-ai-upstream-task-id": "upstream-1", "x-ai-task-status": "queued", "x-ai-task-credits": "8", "x-ai-credit-log-id": "credit-1" }), {
        aiTaskId: "aitask-1",
        upstreamTaskId: "upstream-1",
        aiTaskStatus: "queued",
        aiTaskCredits: 8,
        creditLogId: "credit-1",
    });

    assert.deepEqual(
        aiTaskLedgerFromGeneration({
            aiTaskId: "aitask-2",
            taskId: "task-2",
            aiTaskStatus: "succeeded",
            aiTaskCredits: "3",
            creditsRefunded: 1,
            refundedAt: "refund-at",
            finishedAt: "finish-at",
        }),
        {
            aiTaskId: "aitask-2",
            upstreamTaskId: "task-2",
            aiTaskStatus: "succeeded",
            aiTaskCredits: 3,
            creditLogId: "",
            creditsRefunded: 1,
            refundedAt: "refund-at",
            finishedAt: "finish-at",
        },
    );
});

test("merges task detail over generation ledger for display summary", () => {
    const detail = {
        task: {
            id: "aitask-detail",
            upstreamTaskId: "upstream-detail",
            status: "failed",
            credits: 6,
            creditsRefunded: 6,
            refundedAt: "refund-at",
            finishedAt: "finish-at",
            errorMessage: "failed reason",
        },
        creditLogs: [{ id: "credit-consume", type: "ai_consume", amount: -6 }],
    } as any;

    assert.deepEqual(buildGenerationTaskLedger({ aiTaskId: "aitask-generation", upstreamTaskId: "upstream-generation", aiTaskStatus: "queued", aiTaskCredits: 2 }, detail), {
        aiTaskId: "aitask-generation",
        upstreamTaskId: "upstream-generation",
        aiTaskStatus: "failed",
        aiTaskCredits: 6,
        creditLogId: "credit-consume",
        creditsRefunded: 6,
        refundedAt: "refund-at",
        finishedAt: "finish-at",
        errorMessage: "failed reason",
    });

    assert.deepEqual(generationTaskSummary({ aiTaskId: "aitask-1", upstreamTaskId: "upstream-1", aiTaskStatus: "succeeded", aiTaskCredits: 4 }, [{ id: "credit-1", type: "ai_consume", amount: -4 } as any]), {
        aiTaskId: "aitask-1",
        upstreamTaskId: "upstream-1",
        status: "succeeded",
        credits: 4,
        refunded: 0,
        refundedAt: "",
        creditLogId: "credit-1",
    });
});
