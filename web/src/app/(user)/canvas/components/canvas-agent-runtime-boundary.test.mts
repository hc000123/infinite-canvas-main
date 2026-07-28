import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("the unique canvas orchestrator replaces selectable production Agents", async () => {
    const [composer, panel, types, planHook, planCard] = await Promise.all([
        read("./canvas-assistant-composer.tsx"),
        read("./canvas-assistant-panel.tsx"),
        read("../types.ts"),
        read("../hooks/use-canvas-agent-plan.ts"),
        read("./canvas-agent-plan-card.tsx"),
    ]);
    const planRunType = types.match(/export type CanvasAgentPlanRun = \{[\s\S]*?\n\};/)?.[0] || "";

    assert.match(composer, /画布总控/);
    assert.doesNotMatch(composer, /PublishedAgentSelect|agentOptions|onAgentChange/);
    assert.doesNotMatch(composer, /PromptAgentSkillPackSelect|promptAgentSkillPacks/);
    assert.doesNotMatch(panel, /sendPromptAgentMessage|buildPromptAgentSystemContext|parsePromptAgentPlan|CanvasAssistantToolboxCard/);
    assert.match(panel, /sendCanvasOrchestratorMessage/);
    assert.match(panel, /if \(nextMode === "image"\)/);
    assert.doesNotMatch(types, /promptAgentPlan|promptAgentSkillPackId|promptAgentExecutionState/);
    assert.doesNotMatch(planRunType, /agentId|agentName/);
    assert.match(planHook, /fetchAgent\(CANVAS_ORCHESTRATOR_AGENT_ID/);
    assert.doesNotMatch(planHook, /fetchAgent\(run\.agentId/);
    assert.match(planCard, />画布总控</);
    assert.doesNotMatch(planCard, /run\.agentName/);
});

test("hardcoded Prompt Agent Skill Pack and tool registry files are removed", async () => {
    await assert.rejects(read("../utils/canvas-prompt-agent-skills.ts"));
    await assert.rejects(read("../utils/canvas-prompt-agent-tools.ts"));
});
