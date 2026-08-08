import assert from "node:assert/strict";
import test from "node:test";

import { shouldAutoLoadStoryboard } from "./workflow-shot-automation.ts";

test("loads a storyboard only after the human approval gate", () => {
    assert.equal(shouldAutoLoadStoryboard({ stageStatus: "approved", gatePassed: true, shotCount: 4 }), true);
    assert.equal(shouldAutoLoadStoryboard({ stageStatus: "needs_review", gatePassed: true, shotCount: 4 }), false);
    assert.equal(shouldAutoLoadStoryboard({ stageStatus: "needs_review", gatePassed: false, shotCount: 4 }), false);
    assert.equal(shouldAutoLoadStoryboard({ stageStatus: "approved", gatePassed: true, shotCount: 0 }), false);
});
