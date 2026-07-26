import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./agent-registry.ts", import.meta.url), "utf8");

test("uses authenticated /api/v1 Agent Registry routes", () => {
    for (const route of [
        'apiGet<AgentRegistryItem[]>("/api/v1/agents"',
        'apiPost<AgentVersionDetail>("/api/v1/agents"',
        '`/api/v1/agents/${encodeURIComponent(id)}`',
        '`/api/v1/agents/${encodeURIComponent(agentId)}/versions`',
        'apiGet<AgentVersionDetail>(`/api/v1/agent-versions/${encodeURIComponent(id)}`',
        '`/api/v1/agent-versions/${encodeURIComponent(id)}`',
        '`/api/v1/agent-versions/${encodeURIComponent(id)}/validate`',
        '`/api/v1/agent-versions/${encodeURIComponent(id)}/publish`',
        '`/api/v1/agents/${encodeURIComponent(agentId)}/recommended-version`',
    ]) {
        assert.ok(source.includes(route), `missing route ${route}`);
    }
    assert.match(source, /useUserStore\.getState\(\)\.token/);
});

test("frontend Agent DTOs expose packages instead of persistence JSON columns", () => {
    for (const field of ["defaultSkillRefsJSON", "skillAccessPolicyJSON", "modelPolicyJSON", "toolPolicyJSON", "executionPolicyJSON", "tagsJSON"]) {
        assert.doesNotMatch(source, new RegExp(`\\b${field}\\??:`));
    }
    for (const typeName of ["AgentPackage", "AgentCreateInput", "AgentDraftInput", "AgentVersionDetail", "AgentRegistryItem", "AgentValidationResult"]) {
        assert.match(source, new RegExp(`export type ${typeName}\\b`));
    }
});
