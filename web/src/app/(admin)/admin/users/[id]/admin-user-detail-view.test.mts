import assert from "node:assert/strict";
import test from "node:test";

import { adminUserDetailStats, adminUserDetailTabs } from "./admin-user-detail-view.ts";

const detail = { user: { credits: 80, lastLoginAt: "2026-07-24T10:00:00Z" }, aiTaskCount: 2, aiCreditsConsumed: 10, creditLogCount: 3 };

test("builds the four overview stats", () => {
    assert.deepEqual(
        adminUserDetailStats(detail).map((item) => [item.key, item.value]),
        [
            ["credits", 80],
            ["consumed", 10],
            ["tasks", 2],
            ["lastLogin", "2026-07-24T10:00:00Z"],
        ],
    );
});

test("builds usage tab labels with server counts", () => {
    assert.deepEqual(adminUserDetailTabs(detail), ["操作记录", "AI 任务 2", "算力点流水 3"]);
});
