import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("canvas assistant messages persist only Agent Plan and Artifact coordinates", async () => {
    const source = await readFile(new URL("../types.ts", import.meta.url), "utf8");
    const planRunType = source.match(/export type CanvasAgentPlanRun\s*=\s*\{[\s\S]*?\n\};/)?.[0] || "";

    assert.match(source, /export type CanvasAgentPlanRun\s*=\s*\{/);
    for (const field of ["planId", "agentVersionId", "sourceArtifactRef", "sourceNodeIds", "skillRefs"]) {
        assert.match(planRunType, new RegExp(`${field}:`));
    }
    assert.match(planRunType, /confirmationRequirementCodes\?: string\[\]/);
    assert.match(planRunType, /appliedAt\?: string/);
    assert.match(source, /agentPlanRun\?: CanvasAgentPlanRun/);
    assert.doesNotMatch(planRunType, /agentId|agentName|payload|sourceText|outputArtifacts/);
});
