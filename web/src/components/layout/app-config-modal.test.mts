import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./app-config-modal.tsx", import.meta.url), "utf8");

test("App config exposes user-side Jimeng login without admin settings", () => {
    assert.match(source, /startUserJimengLogin/);
    assert.match(source, /checkUserJimengLogin/);
    assert.match(source, /videoProtocol === "jimeng-cli"/);
    assert.match(source, /后台仍会记录任务和用量/);
    assert.doesNotMatch(source, /\/api\/admin\/settings\/jimeng-login/);
});

test("Jimeng login opens the verification page from the same click", () => {
    const start = source.indexOf("const startJimengLogin");
    const request = source.indexOf("await startUserJimengLogin", start);
    const preopenedWindow = source.indexOf("window.open", start);

    assert.ok(start >= 0 && preopenedWindow > start && preopenedWindow < request, "the browser tab must be opened before the async request");
    assert.match(source, /verificationWindow\.location\.replace\(loginURL\)/);
    assert.match(source, />\s*登录即梦\s*</);
});
