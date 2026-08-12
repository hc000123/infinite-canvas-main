import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./components/workflow-asset-slot-editor.tsx", import.meta.url), "utf8");
const assetPanel = readFileSync(new URL("./components/workflow-asset-panel.tsx", import.meta.url), "utf8");
const assetCard = readFileSync(new URL("./components/workflow-asset-card.tsx", import.meta.url), "utf8");
const generationHook = readFileSync(new URL("./use-workflow-asset-image-actions.ts", import.meta.url), "utf8");

test("edits versioned slots without materializing placeholders", () => {
    assert.match(source, /getWorkflowAssetSlots/);
    assert.match(source, /saveWorkflowAssetSlots/);
    assert.match(source, /新增槽位/);
    assert.match(source, /忽略/);
    assert.match(source, /绑定正式资产/);
    assert.doesNotMatch(source, /addAssetOnce|ensureSubject/);
});

test("keeps manual slot approval available as a fallback", () => {
    assert.match(source, /state\.approve\(\)/);
    assert.match(source, /批准资产解析/);
});

test("materializes approved prompt cards automatically and only shows a retry after failure", () => {
    assert.match(assetPanel, /materializationForArtifact/);
    assert.match(assetPanel, /void materialize\(\)/);
    assert.match(assetPanel, /重新建立资产卡片/);
    assert.doesNotMatch(assetPanel, /批准资产提示词|建立正式资产卡片<\/Button>/);
});

test("keeps workflow cards and asset-library variants on the same record", () => {
    assert.match(assetPanel, /const ensureVariant = useAssetStore/);
    assert.match(assetPanel, /const updateVariant = useAssetStore/);
    assert.match(assetPanel, /const setVariantCurrentAsset = useAssetStore/);
    assert.match(assetPanel, /variantId,/);
    assert.doesNotMatch(assetPanel, /!needsMaterialization/);
    assert.match(assetPanel, /updateVariant\(variantId, \{ prompt: imagePrompt \}\)/);
    assert.match(assetPanel, /setVariantCurrentAsset\(variantId, asset\.id\)/);
    assert.match(generationHook, /setVariantCurrentAsset\(variantId, asset\.id\)/);
});

test("keeps production cards compact with binding controls and prompt editing in the modal", () => {
    assert.match(assetPanel, /xl:grid-cols-3/);
    assert.match(assetCard, /aspect-\[5\/2\]/);
    assert.match(assetCard, /选择已有资产卡片/);
    assert.doesNotMatch(assetCard, /<TextBlock label="生图提示词"/);
    assert.match(assetCard, /<Input\.TextArea[^>]+value=\{imagePrompt\}/);
    assert.match(assetCard, />资产生图<\/Button>/);
    assert.doesNotMatch(assetCard, />图片工作台<\/Button>/);
    assert.doesNotMatch(generationHook, /return `\/image\?/);
});
