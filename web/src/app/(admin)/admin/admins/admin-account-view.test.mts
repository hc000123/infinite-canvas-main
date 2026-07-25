import assert from "node:assert/strict";
import test from "node:test";

import { adminAccountProtection } from "./admin-account-view.ts";

test("protects the current superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "self", role: "superadmin", status: "active" }, "self", 2), { mutable: false, reason: "不能修改自己的管理员状态" });
});

test("protects the last active superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "last", role: "superadmin", status: "active" }, "other", 1), { mutable: false, reason: "必须保留至少一个有效超级管理员" });
});

test("allows another administrator to be managed", () => {
    assert.deepEqual(adminAccountProtection({ id: "admin", role: "admin", status: "active" }, "self", 1), { mutable: true, reason: "" });
});
