import assert from "node:assert/strict";
import test from "node:test";

import { adminUserCreditConfirm } from "./admin-user-credit-view.ts";

test("explains an ordinary administrator credit allocation", () => {
    assert.equal(adminUserCreditConfirm("admin", 20, 50), "将向用户转移 30 算力点，并从你的余额中扣除。确认继续？");
});

test("explains an ordinary administrator credit reclaim", () => {
    assert.equal(adminUserCreditConfirm("admin", 50, 20), "将从用户收回 30 算力点，并返还到你的余额。确认继续？");
});

test("explains a superadmin direct adjustment", () => {
    assert.equal(adminUserCreditConfirm("superadmin", 20, 50), "将用户算力点调整为 50，并记录后台调整流水。确认继续？");
});
