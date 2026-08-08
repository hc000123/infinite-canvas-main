import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./components/workflow-asset-slot-editor.tsx", import.meta.url), "utf8");
const assetPanel = readFileSync(new URL("./components/workflow-asset-panel.tsx", import.meta.url), "utf8");

test("edits versioned slots without materializing placeholders", () => {
    assert.match(source, /getWorkflowAssetSlots/);
    assert.match(source, /saveWorkflowAssetSlots/);
    assert.match(source, /新增槽位/);
    assert.match(source, /忽略/);
    assert.match(source, /绑定正式资产/);
    assert.doesNotMatch(source, /addAssetOnce|ensureSubject/);
});

test("keeps approval as an explicit stage-gate action", () => {
    assert.match(source, /state\.approve\(\)/);
    assert.match(source, /批准资产解析/);
});

test("requires explicit prompt approval and formal asset creation", () => {
    assert.match(assetPanel, /批准资产提示词/);
    assert.match(assetPanel, /建立正式资产卡片/);
    assert.doesNotMatch(assetPanel, /if \(\["approved", "applied"\][^\n]+void materialize\(\)/);
});
