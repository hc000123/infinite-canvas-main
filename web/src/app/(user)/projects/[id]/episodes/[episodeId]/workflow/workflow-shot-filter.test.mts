import assert from "node:assert/strict";
import test from "node:test";

import { filterWorkflowShots, selectNextWorkflowShot, workflowVirtualWindow } from "./workflow-shot-filter.ts";

const shot = (id: string, status: "blocked" | "review" | "running" | "ready" | "completed") => ({ id, prompt: `${id} prompt`, sceneKey: `scene-${id}`, segment: `${id} 剧情`, status });

test("prioritizes blocker then review then running", () => {
    const shots = [shot("P01", "completed"), shot("P02", "review"), shot("P03", "blocked")];
    assert.equal(selectNextWorkflowShot(shots)?.id, "P03");
});

test("filters 1000 shots without changing their stable order", () => {
    const shots = Array.from({ length: 1000 }, (_, index) => shot(`P${String(index + 1).padStart(4, "0")}`, index % 2 ? "ready" : "review"));
    const filtered = filterWorkflowShots(shots, { keyword: "P099", status: "review" });
    assert.deepEqual(filtered.map((item) => item.id), ["P0991", "P0993", "P0995", "P0997", "P0999"]);
});

test("virtual window renders at most 40 rows for a desktop queue", () => {
    const window = workflowVirtualWindow(1000, 8000, 900, 76, 6);
    assert.ok(window.end - window.start <= 40);
    assert.ok(window.topSpacer > 0);
    assert.ok(window.bottomSpacer > 0);
});
