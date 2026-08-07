import assert from "node:assert/strict";
import test from "node:test";

import { adminTaskOperationTabs } from "./admin-ai-task-page-view.ts";

test("administrator page contains operations but no analytics", () => {
    assert.deepEqual(adminTaskOperationTabs, ["任务明细", "算力流水"]);
});
