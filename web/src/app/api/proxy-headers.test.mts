import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("API proxy strips the unsupported Expect request header", async () => {
    const source = await readFile(new URL("./[...path]/route.ts", import.meta.url), "utf8");

    assert.match(source, /headers\.delete\("expect"\)/);
});
