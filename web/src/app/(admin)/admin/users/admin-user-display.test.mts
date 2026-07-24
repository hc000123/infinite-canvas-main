import assert from "node:assert/strict";
import test from "node:test";

import { adminUsageUserDisplay } from "./admin-user-display.ts";

test("uses current display name and keeps the stable user id", () => {
    assert.deepEqual(adminUsageUserDisplay({ userId: "user-1", user: { id: "user-1", username: "current-name", displayName: "当前昵称" } }), { primary: "当前昵称", secondary: "current-name · user-1", deleted: false });
});

test("falls back to a deleted-user label without losing the id", () => {
    assert.deepEqual(adminUsageUserDisplay({ userId: "user-deleted" }), { primary: "用户已删除", secondary: "user-deleted", deleted: true });
});
