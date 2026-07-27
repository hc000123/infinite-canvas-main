import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("canvas chat selects a published Agent and creates a backend Temporary Plan", async () => {
    const [composer, panel] = await Promise.all([read("./canvas-assistant-composer.tsx"), read("./canvas-assistant-panel.tsx")]);

    assert.match(composer, /export type CanvasAssistantAgentOption/);
    assert.match(composer, /agentId: string/);
    assert.match(composer, /agentOptions: CanvasAssistantAgentOption\[\]/);
    assert.match(composer, /label: "普通对话"/);
    assert.match(composer, /onAgentChange/);

    assert.match(panel, /fetchAgents/);
    assert.match(panel, /canvasAgentCandidates/);
    assert.match(panel, /createArtifact/);
    assert.match(panel, /createAgentPlan/);
    assert.match(panel, /buildCanvasAgentSourceText/);
    assert.match(panel, /buildCanvasAgentPlanRequest/);
    assert.match(panel, /agentPlanRun:/);
    assert.match(panel, /if \(mode === "ask" && selectedAgent\)/);
    assert.match(panel, /await sendCanvasAgentPlanMessage\(text/);
});

test("ordinary chat and direct image generation remain available without an Agent", async () => {
    const panel = await read("./canvas-assistant-panel.tsx");
    assert.match(panel, /await sendMessage\(text, mode, messages\)/);
    assert.match(panel, /if \(nextMode === "image"\)/);
    assert.match(panel, /requestGeneration/);
});
