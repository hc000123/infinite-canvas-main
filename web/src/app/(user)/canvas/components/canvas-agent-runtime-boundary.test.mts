import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("the unique canvas orchestrator replaces selectable production Agents", async () => {
    const [composer, panel, types] = await Promise.all([read("./canvas-assistant-composer.tsx"), read("./canvas-assistant-panel.tsx"), read("../types.ts")]);

    assert.match(composer, /画布总控/);
    assert.doesNotMatch(composer, /PublishedAgentSelect|agentOptions|onAgentChange/);
    assert.doesNotMatch(composer, /PromptAgentSkillPackSelect|promptAgentSkillPacks/);
    assert.doesNotMatch(panel, /sendPromptAgentMessage|buildPromptAgentSystemContext|parsePromptAgentPlan|CanvasAssistantToolboxCard/);
    assert.match(panel, /sendCanvasOrchestratorMessage/);
    assert.match(panel, /if \(nextMode === "image"\)/);
    assert.doesNotMatch(types, /promptAgentPlan|promptAgentSkillPackId|promptAgentExecutionState/);
});

test("hardcoded Prompt Agent Skill Pack and tool registry files are removed", async () => {
    await assert.rejects(read("../utils/canvas-prompt-agent-skills.ts"));
    await assert.rejects(read("../utils/canvas-prompt-agent-tools.ts"));
});
