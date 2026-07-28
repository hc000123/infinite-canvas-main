import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./prompt-select-dialog.tsx", import.meta.url), "utf8");

test("closing nested prompt dialogs returns to the prompt list", () => {
    assert.match(source, /<PromptDetailDialog[\s\S]*?onClose=\{\(\) => setSelectedPrompt\(null\)\}/);
    assert.match(source, /<PromptCreateDialog[\s\S]*?onCancel=\{\(\) => \{\s*setCreateOpen\(false\);\s*createForm\.resetFields\(\);\s*\}\}/);
});

test("closing or completing the prompt library still clears the whole dialog", () => {
    assert.match(source, /<Modal[^>]*title="提示词库"[^>]*onCancel=\{closeDialog\}/);
    assert.match(source, /const selectPrompt = \(promptText: string\) => \{\s*onSelect\(promptText\);\s*closeDialog\(\);\s*\};/);
});
