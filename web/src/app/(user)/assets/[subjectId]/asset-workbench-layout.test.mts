import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses a 3:7 desktop split for asset controls and preview", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(source, /lg:grid-cols-\[minmax\(0,3fr\)_minmax\(0,7fr\)\]/);
    assert.doesNotMatch(source, /lg:grid-cols-\[320px_minmax\(0,1fr\)\]/);
});
