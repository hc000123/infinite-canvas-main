import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("edits the same workflow prompt from the asset subject workbench", () => {
    assert.match(source, /workflowAssetEditPatch/);
    assert.match(source, /workflowAssetInfo/);
    assert.match(source, /workflowAssetPrompt/);
    assert.match(source, /workflowAssetVariantId/);
    assert.match(source, /const workflowAsset =/);
    assert.match(source, /workflowAssetPrompt\(workflowAsset\) \|\| activeVariant\.prompt/);
    assert.match(source, /updateAsset\(workflowAsset\.id, workflowAssetEditPatch/);
    assert.match(source, /updateVariant\(activeVariant\.id, \{ prompt: value \}\)/);
});

test("opens the requested asset variant and preserves an internal return path", () => {
    assert.match(source, /useSearchParams/);
    assert.match(source, /searchParams\.get\("variantId"\)/);
    assert.match(source, /subjectVariants\.find\(\(variant\) => variant\.id === requestedVariantId\)/);
    assert.match(source, /searchParams\.get\("returnTo"\)/);
    assert.match(source, /!requestedReturnTo\.startsWith\("\/\/"\)/);
    assert.match(source, /href=\{backHref\}/);
});
