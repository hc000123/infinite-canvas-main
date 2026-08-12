import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controls = readFileSync(new URL("../components/canvas-floating-controls.tsx", import.meta.url), "utf8");

test("does not mount a persistent storyboard status panel over the canvas", () => {
    assert.doesNotMatch(controls, /CanvasStoryboardTimeline/);
    assert.doesNotMatch(controls, /activeTimelineShotId|shotGroups: ShotGroup\[\]|shots: StoryboardTableShot\[\]|onSelectShot:/);
});
