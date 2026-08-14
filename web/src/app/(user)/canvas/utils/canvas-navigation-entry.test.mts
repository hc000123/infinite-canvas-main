import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const topBar = readFileSync(new URL("../components/canvas-top-bar.tsx", import.meta.url), "utf8");

test("canvas top bar exposes one return action", () => {
    assert.match(topBar, /onClick=\{onReturnParent\}/);
    assert.doesNotMatch(topBar, /key: "parent"/);
    assert.doesNotMatch(topBar, /key: "projects"/);
    assert.doesNotMatch(topBar, /onHome/);
});
