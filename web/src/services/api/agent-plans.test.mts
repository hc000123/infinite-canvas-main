import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./agent-plans.ts", import.meta.url), "utf8");

test("uses authenticated /api/v1 Agent Plan routes", () => {
    for (const route of [
        'apiPost<AgentPlanDetail>("/api/v1/agent-plans"',
        '`/api/v1/agent-plans/${encodeURIComponent(id)}`',
        '`/api/v1/agent-plans/${encodeURIComponent(id)}/revisions`',
        '`/api/v1/agent-plans/${encodeURIComponent(id)}/preflight`',
        '`/api/v1/agent-plans/${encodeURIComponent(id)}/confirm`',
        '`/api/v1/agent-plans/${encodeURIComponent(id)}/continue`',
        '`/api/v1/agent-plans/${encodeURIComponent(id)}/cancel`',
    ]) {
        assert.ok(source.includes(route), `missing route ${route}`);
    }
    assert.match(source, /useUserStore\.getState\(\)\.token/);
    assert.match(source, /apiPostEmpty<AgentPlanPreflightResult>/);
    assert.match(source, /apiPostEmpty<AgentPlanContinueResult>/);
    assert.match(source, /apiPostEmpty<AgentPlanDetail>/);
});

test("frontend Agent Plan DTOs expose resolved contracts without persistence fields", () => {
    for (const typeName of [
        "AgentPlanStatus", "AgentPlanStepStatus", "AgentPlanCreateInput", "AgentPlanRevisionInput", "AgentPlanConfirmInput",
        "AgentPlanStepDetail", "AgentPlanDetail", "AgentPlanPreflightResult", "AgentPlanContinueResult",
    ]) {
        assert.match(source, new RegExp(`export type ${typeName}\\b`));
    }
    assert.match(source, /idempotencyKey: string/);
    for (const field of ["userId", "requestHash", "sourceArtifactRefsJson", "planSnapshotJson", "inputBindingsJson", "parametersJson", "outputArtifactRefsJson", "requirementCodesJson"]) {
        assert.doesNotMatch(source, new RegExp(`\\b${field}\\??:`));
    }
});
