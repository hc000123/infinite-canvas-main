import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
test("resource index links to existing tools without reimplementing them", () => {
    assert.match(source, /href="\/prompts"/);
    assert.match(source, /href="\/cache"/);
    assert.doesNotMatch(source, /usePrompt|useCache|fetch\(/);
});
