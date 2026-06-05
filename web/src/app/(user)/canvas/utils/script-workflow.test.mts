import assert from "node:assert/strict";
import test from "node:test";

import { buildScriptWorkflowSteps, scriptWorkflowNextAction } from "./script-workflow.ts";

test("script workflow starts from outline when nothing exists", () => {
    const steps = buildScriptWorkflowSteps({ hasOutline: false, episodeCount: 0, activeSceneCount: 0 });

    assert.equal(steps[0].status, "current");
    assert.equal(steps[1].status, "pending");
    assert.equal(scriptWorkflowNextAction({ hasOutline: false, episodeCount: 0, activeSceneCount: 0 }), "先补一段故事大纲");
});

test("script workflow advances to storyboard after scenes exist", () => {
    const steps = buildScriptWorkflowSteps({ hasOutline: true, episodeCount: 1, activeSceneCount: 3 });

    assert.deepEqual(
        steps.map((step) => step.status),
        ["done", "done", "done", "current"],
    );
    assert.equal(scriptWorkflowNextAction({ hasOutline: true, episodeCount: 1, activeSceneCount: 3 }), "生成场次或整集的分镜草案");
});
