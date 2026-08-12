import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("prompt page is a source-and-folder library instead of a project recipe switcher", () => {
    assert.match(source, /label="后台提示词"/);
    assert.match(source, /label="我的提示词"/);
    assert.match(source, /我的文件夹/);
    assert.match(source, /usePersonalPromptStore/);
    assert.doesNotMatch(source, /PromptProfileManager|workspaceMode|profileProjectId/);
});

test("prompt page queries backend prompts through the five business categories", () => {
    assert.match(source, /promptCategoryOptions\.map/);
    assert.match(source, /category: selectedBackendCategory \|\| ALL_PROMPTS_OPTION/);
    assert.match(source, /后台分类/);
    assert.match(source, /后台提示词/);
});
