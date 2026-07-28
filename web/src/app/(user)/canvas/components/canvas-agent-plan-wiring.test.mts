import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("canvas chat uses the unique orchestrator and creates only validated Temporary Plans", async () => {
    const [composer, panel] = await Promise.all([read("./canvas-assistant-composer.tsx"), read("./canvas-assistant-panel.tsx")]);

    assert.match(composer, /画布总控/);
    assert.doesNotMatch(composer, /PublishedAgentSelect|agentOptions|onAgentChange/);

    assert.match(panel, /fetchAgent\(CANVAS_ORCHESTRATOR_AGENT_ID/);
    assert.match(panel, /fetchSkillOptions/);
    assert.match(panel, /resolveCanvasOrchestratorDecision/);
    assert.match(panel, /createArtifact/);
    assert.match(panel, /createAgentPlan/);
    assert.match(panel, /buildCanvasAgentSourceText/);
    assert.match(panel, /buildCanvasAgentPlanRequest/);
    assert.match(panel, /agentPlanRun:/);
    assert.match(panel, /decision.kind === "answer"/);
    assert.match(panel, /await sendCanvasOrchestratorMessage\(text/);
});

test("ordinary chat and direct image generation remain available without an Agent", async () => {
    const panel = await read("./canvas-assistant-panel.tsx");
    assert.match(panel, /await sendMessage\(text, mode, messages\)/);
    assert.match(panel, /if \(nextMode === "image"\)/);
    assert.match(panel, /requestGeneration/);
});
