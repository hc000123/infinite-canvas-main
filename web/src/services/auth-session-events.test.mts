import assert from "node:assert/strict";
import test from "node:test";
import { emitAuthSessionInvalid, resetAuthSessionInvalid, subscribeAuthSessionInvalid } from "./auth-session-events.ts";

test("deduplicates concurrent session invalidation events", () => {
    let count = 0;
    const unsubscribe = subscribeAuthSessionInvalid(() => count++);
    emitAuthSessionInvalid({ code: 1002, message: "账号已在其他设备登录" });
    emitAuthSessionInvalid({ code: 1002, message: "账号已在其他设备登录" });
    assert.equal(count, 1);
    resetAuthSessionInvalid();
    emitAuthSessionInvalid({ code: 1004, message: "登录状态已过期" });
    assert.equal(count, 2);
    unsubscribe();
    resetAuthSessionInvalid();
});
