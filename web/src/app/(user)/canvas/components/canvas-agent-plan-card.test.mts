import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canvasAgentPlanActions } from "../utils/canvas-agent-plan-model.ts";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("exposes only valid Agent Plan lifecycle actions", () => {
    assert.deepEqual(canvasAgentPlanActions("draft", { hasFinalOutputs: false, applied: false }), { canEdit: true, canPreflight: true, canConfirm: false, canContinue: false, canReview: false, canCancel: true, canApply: false });
    assert.equal(canvasAgentPlanActions("awaiting_confirmation", { hasFinalOutputs: false, applied: false }).canConfirm, true);
    assert.equal(canvasAgentPlanActions("running", { hasFinalOutputs: false, applied: false }).canContinue, true);
    assert.equal(canvasAgentPlanActions("needs_review", { hasFinalOutputs: true, applied: false }).canReview, true);
    assert.equal(canvasAgentPlanActions("completed", { hasFinalOutputs: true, applied: false }).canApply, true);
    assert.equal(canvasAgentPlanActions("completed", { hasFinalOutputs: true, applied: true }).canApply, false);
    for (const status of ["blocked", "failed", "cancelled"] as const) {
        const actions = canvasAgentPlanActions(status, { hasFinalOutputs: true, applied: false });
        assert.deepEqual(actions, { canEdit: false, canPreflight: false, canConfirm: false, canContinue: false, canReview: false, canCancel: false, canApply: false });
    }
});

test("Agent Plan hook delegates lifecycle to shared backend APIs", async () => {
    const hook = await read("../hooks/use-canvas-agent-plan.ts");
    for (const api of ["fetchAgentPlan", "createAgentPlanRevision", "preflightAgentPlan", "confirmAgentPlan", "continueAgentPlan", "cancelAgentPlan", "getInvocation", "reviewInvocation", "getArtifact"]) {
        assert.match(hook, new RegExp(api));
    }
    assert.match(hook, /confirmationRequirementCodes/);
    assert.match(hook, /artifactSetHash/);
    assert.match(hook, /comment: "画布对话 Agent 人工批准"/);
});

test("assistant messages render an editable Temporary Plan card", async () => {
    const [card, messages] = await Promise.all([read("./canvas-agent-plan-card.tsx"), read("./canvas-assistant-messages.tsx")]);
    assert.match(card, /保存计划修订/);
    assert.match(card, /预检并冻结/);
    assert.match(card, /确认版本与额度/);
    assert.match(card, /批准当前产物/);
    assert.match(card, /推进 \/ 同步/);
    assert.match(messages, /message\.agentPlanRun/);
    assert.match(messages, /<CanvasAgentPlanCard/);
});
