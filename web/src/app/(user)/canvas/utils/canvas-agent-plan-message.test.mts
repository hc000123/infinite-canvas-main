import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("canvas assistant messages persist only Agent Plan and Artifact coordinates", async () => {
    const source = await readFile(new URL("../types.ts", import.meta.url), "utf8");

    assert.match(source, /export type CanvasAgentPlanRun\s*=\s*\{/);
    for (const field of ["planId", "agentId", "agentVersionId", "agentName", "sourceArtifactRef", "sourceNodeIds", "skillRefs"]) {
        assert.match(source, new RegExp(`${field}:`));
    }
    assert.match(source, /confirmationRequirementCodes\?: string\[\]/);
    assert.match(source, /appliedAt\?: string/);
    assert.match(source, /agentPlanRun\?: CanvasAgentPlanRun/);
    assert.doesNotMatch(source.match(/export type CanvasAgentPlanRun\s*=\s*\{[\s\S]*?\n\};/)?.[0] || "", /payload|sourceText|outputArtifacts/);
});
