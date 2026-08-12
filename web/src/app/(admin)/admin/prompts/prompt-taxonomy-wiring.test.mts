import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("admin prompt management uses fixed business categories and free-form tags", () => {
    assert.match(source, /promptCategoryOptions/);
    assert.match(source, /label="业务分类"/);
    assert.match(source, /label="自定义标签（逗号分隔）"/);
    assert.doesNotMatch(source, /label="分组"/);
});

test("admin prompt editor removes duplicate node-group and scenario fields", () => {
    assert.doesNotMatch(source, /name=\{\["metadata", "nodeGroup"\]\}/);
    assert.doesNotMatch(source, /name=\{\["metadata", "scenario"\]\}/);
});
