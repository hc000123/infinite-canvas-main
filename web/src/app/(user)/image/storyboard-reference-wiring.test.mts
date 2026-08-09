import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("supports asset, clipboard and upload references per shot", () => {
    const page = readFileSync(new URL("./storyboard-image-workbench.tsx", import.meta.url), "utf8");
    const editor = readFileSync(new URL("./components/storyboard-shot-editor.tsx", import.meta.url), "utf8");
    assert.match(page, /<AssetPickerModal/);
    assert.match(page, /navigator\.clipboard\.read/);
    assert.match(page, /appendReference/);
    assert.match(editor, /referenceToken\(index\)/);
    assert.match(editor, /onUpload/);
});

test("reuses prompt, references and parameters without candidates", () => {
    const page = readFileSync(new URL("./storyboard-image-workbench.tsx", import.meta.url), "utf8");
    assert.match(page, /copyableShotConfig\(previous\)/);
    assert.match(page, /referenceImageIds:\s*clonedIds/);
    assert.doesNotMatch(page, /selectedCandidateId:\s*previous/);
});
