import assert from "node:assert/strict";
import test from "node:test";

import { buildOriginalWorkflowChainHealth, type OriginalWorkflowChainFile } from "./original-workflow-chain-health.ts";

test("chain health reports a complete workflow before real video submission", () => {
    const health = buildOriginalWorkflowChainHealth({
        files: completeFiles(),
        validations: {
            stage2: { state: "passed" },
            stage3: { state: "passed" },
        },
        videoPackageCount: 9,
        videoProtocol: "volcengine-ark",
    });

    assert.deepEqual(
        health.map((item) => item.status),
        ["ready", "ready", "ready", "ready", "ready"],
    );
    assert.match(health.find((item) => item.key === "videoPackages")?.detail || "", /9 条/);
});

test("chain health blocks stale Copy-only before video sync", () => {
    const health = buildOriginalWorkflowChainHealth({
        files: completeFiles(),
        validations: {
            stage2: { state: "passed" },
            stage3: { state: "stale" },
        },
        videoPackageCount: 0,
        videoProtocol: "volcengine-ark",
    });

    assert.equal(health.find((item) => item.key === "stage3")?.status, "blocked");
    assert.match(health.find((item) => item.key === "stage3")?.detail || "", /重新校验/);
});

test("chain health blocks non enterprise video protocol", () => {
    const health = buildOriginalWorkflowChainHealth({
        files: completeFiles(),
        validations: {
            stage2: { state: "passed" },
            stage3: { state: "passed" },
        },
        videoPackageCount: 2,
        videoProtocol: "openai",
    });

    assert.equal(health.find((item) => item.key === "enterpriseVideo")?.status, "blocked");
    assert.match(health.find((item) => item.key === "enterpriseVideo")?.detail || "", /企业 Ark/);
});

test("chain health waits while enterprise video settings are loading", () => {
    const health = buildOriginalWorkflowChainHealth({
        files: completeFiles(),
        isPublicSettingsLoading: true,
        validations: {
            stage2: { state: "passed" },
            stage3: { state: "passed" },
        },
        videoPackageCount: 2,
        videoProtocol: "openai",
    });

    assert.equal(health.find((item) => item.key === "enterpriseVideo")?.status, "checking");
});

test("chain health blocks failed enterprise video preflight", () => {
    const health = buildOriginalWorkflowChainHealth({
        enterprisePreflight: {
            checkedAt: "2026-06-14T00:00:00.000Z",
            message: "AuthenticationError: The API key doesn't exist",
            status: "failed",
        },
        files: completeFiles(),
        validations: {
            stage2: { state: "passed" },
            stage3: { state: "passed" },
        },
        videoPackageCount: 2,
        videoProtocol: "volcengine-ark",
    });

    assert.equal(health.find((item) => item.key === "enterpriseVideo")?.status, "blocked");
    assert.match(health.find((item) => item.key === "enterpriseVideo")?.detail || "", /API key/);
});

test("chain health accepts passed enterprise video preflight", () => {
    const health = buildOriginalWorkflowChainHealth({
        enterprisePreflight: {
            checkedAt: "2026-06-14T00:00:00.000Z",
            message: "企业 Ark / Seedance 已通过预检。",
            status: "passed",
        },
        files: completeFiles(),
        validations: {
            stage2: { state: "passed" },
            stage3: { state: "passed" },
        },
        videoPackageCount: 2,
        videoProtocol: "volcengine-ark",
    });

    assert.equal(health.find((item) => item.key === "enterpriseVideo")?.status, "ready");
    assert.match(health.find((item) => item.key === "enterpriseVideo")?.detail || "", /通过预检/);
});

function completeFiles(): OriginalWorkflowChainFile[] {
    return ["script", "stage1A", "stage1B", "stage1C", "stage1D", "characters", "scenes", "props", "stage3", "copyOnly"].map((key) => ({ exists: true, key }));
}
