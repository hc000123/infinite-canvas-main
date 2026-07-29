import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./jimeng-login.ts", import.meta.url), "utf8");

test("uses authenticated user Jimeng login routes", () => {
    assert.match(source, /useUserStore\.getState\(\)\.token/);
    assert.ok(source.includes('apiPost<JimengLoginStartResult>("/api/v1/jimeng-login/start"'));
    assert.ok(source.includes('apiPost<JimengLoginCheckResult>("/api/v1/jimeng-login/check"'));
    assert.doesNotMatch(source, /\/api\/admin\/settings\/jimeng-login/);
});
