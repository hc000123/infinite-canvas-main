import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("project card keeps one explicit project entry", () => {
    assert.match(source, /href=\{projectHref\}/);
    assert.doesNotMatch(source, /aria-label=\{openable \? `打开项目/);
    assert.doesNotMatch(source, /onClick=\{handleCardClick\}/);
});
