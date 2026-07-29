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
