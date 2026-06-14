import assert from "node:assert/strict";
import test from "node:test";

import { buildCharacterImagePrompt } from "./character-image-prompt.ts";

test("wraps short character sheet prompts in the full role template", () => {
    const prompt = buildCharacterImagePrompt({
        title: "林秀妹",
        description: "20岁左右，清秀但坚韧。",
        sourcePrompt: "Cinematic Character Design Sheet, FRONT VIEW / SIDE VIEW / BACK VIEW, COLOR PALETTE, ACCESSORIES.",
    });

    assert.match(prompt, /角色名称：林秀妹/);
    assert.match(prompt, /【画面版式】/);
    assert.match(prompt, /【身高与比例标注】/);
    assert.match(prompt, /Cinematic Character Design Sheet/);
});

test("does not wrap an already full character image prompt again", () => {
    const prompt = buildCharacterImagePrompt({ title: "林秀妹", description: "20岁左右，清秀但坚韧。" });

    assert.equal(buildCharacterImagePrompt({ sourcePrompt: prompt }), prompt);
});
