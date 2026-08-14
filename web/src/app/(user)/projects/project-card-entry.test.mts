import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./components/project-workstream-list.tsx", import.meta.url), "utf8");

test("project workstream keeps one explicit project entry", () => {
    assert.match(source, /href=\{projectHref\}/);
    assert.doesNotMatch(source, /aria-label=\{openable \? `打开项目/);
    assert.doesNotMatch(source, /onClick=\{handleCardClick\}/);
    assert.doesNotMatch(source, /rounded-lg border.*shadow/);
});
