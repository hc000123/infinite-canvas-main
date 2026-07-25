import assert from "node:assert/strict";
import test from "node:test";

import { adminAccountProtection, adminCreditDelta, adminCreditView } from "./admin-account-view.ts";

test("protects the current superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "self", role: "superadmin", status: "active" }, "self", 2), { mutable: false, reason: "不能修改自己的管理员状态" });
});

test("protects the last active superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "last", role: "superadmin", status: "active" }, "other", 1), { mutable: false, reason: "必须保留至少一个有效超级管理员" });
});

test("allows another administrator to be managed", () => {
    assert.deepEqual(adminAccountProtection({ id: "admin", role: "admin", status: "active" }, "self", 1), { mutable: true, reason: "" });
});

test("shows unlimited balance only for superadmins", () => {
    assert.deepEqual(adminCreditView({ role: "superadmin", credits: 0 }), { label: "余额不限", adjustable: false });
    assert.deepEqual(adminCreditView({ role: "admin", credits: 80 }), { label: "80", adjustable: true });
});

test("summarizes administrator credit adjustments", () => {
    assert.deepEqual(adminCreditDelta(80, 120), { amount: 40, direction: "增加" });
    assert.deepEqual(adminCreditDelta(80, 50), { amount: 30, direction: "减少" });
    assert.deepEqual(adminCreditDelta(80, 80), { amount: 0, direction: "不变" });
});
