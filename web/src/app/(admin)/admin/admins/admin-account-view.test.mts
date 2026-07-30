import assert from "node:assert/strict";
import test from "node:test";

import { adminAccountProtection, adminCreditDelta, adminCreditView, adminRoleChangeCopy, adminRoleConversion } from "./admin-account-view.ts";

test("protects the current superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "self", role: "superadmin", status: "active" }, "self", 2), { mutable: false, reason: "不能修改自己的管理员状态" });
});

test("protects the last active superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "last", role: "superadmin", status: "active" }, "other", 1), { mutable: false, reason: "必须保留至少一个有效超级管理员" });
});

test("allows another administrator to be managed", () => {
    assert.deepEqual(adminAccountProtection({ id: "admin", role: "admin", status: "active" }, "self", 1), { mutable: true, reason: "" });
});

test("only ordinary administrators can be demoted to users", () => {
    assert.deepEqual(adminRoleConversion({ role: "admin" }), { visible: true, label: "降为普通用户", targetRole: "user" });
    assert.deepEqual(adminRoleConversion({ role: "superadmin" }), { visible: false, label: "", targetRole: null });
});

test("explains that role conversion preserves account data", () => {
    assert.deepEqual(adminRoleChangeCopy("admin"), { title: "提升现有用户", success: "用户已提升为管理员", warning: "账号 ID、资料、算力余额、用量及操作记录都会保留。" });
    assert.deepEqual(adminRoleChangeCopy("user"), { title: "降为普通用户", success: "管理员已降为普通用户", warning: "账号 ID、资料、算力余额、用量及操作记录都会保留。" });
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
