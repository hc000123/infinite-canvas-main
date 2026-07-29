import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");

test("Docker copies Bun dependency patches before installing packages", () => {
    const patchCopy = dockerfile.indexOf("COPY web/patches ./patches");
    const install = dockerfile.indexOf("bun install --frozen-lockfile");

    assert.notEqual(patchCopy, -1);
    assert.ok(patchCopy < install);
});
