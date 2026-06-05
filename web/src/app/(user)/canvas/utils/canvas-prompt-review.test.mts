import assert from "node:assert/strict";
import test from "node:test";

import { reviewVideoPromptBeforeGeneration, shouldRunVideoPromptReview } from "./canvas-prompt-review.ts";

test("passes a complete video prompt", () => {
    const result = reviewVideoPromptBeforeGeneration({
        prompt: "人物魏梁在大学操场毕业典礼现场走上主席台，镜头中景侧向跟拍，白天自然光，台下观众安静注视。",
        seconds: "8",
    });

    assert.equal(result.level, "pass");
    assert.equal(result.issues.length, 0);
});

test("reports risk for missing subject and action", () => {
    const result = reviewVideoPromptBeforeGeneration({ prompt: "好看一点", seconds: "5" });

    assert.equal(result.level, "risk");
    assert.equal(result.issues[0].type, "positive");
});

test("warns when negative wording is overused", () => {
    const result = reviewVideoPromptBeforeGeneration({
        prompt: "人物在室外场景里走动，镜头固定，不要模糊，不要变形，不能多人，没有杂物，避免夸张，不出现文字。",
        seconds: "6",
    });

    assert.equal(result.level, "warning");
    assert.ok(result.issues.some((issue) => issue.type === "negative"));
});

test("warns when references are not explained", () => {
    const result = reviewVideoPromptBeforeGeneration({
        prompt: "人物魏梁在毕业典礼场景里走向主席台，镜头中景侧向跟拍，白天自然光。",
        imageReferenceCount: 2,
        videoReferenceCount: 1,
    });

    assert.equal(result.level, "warning");
    assert.ok(result.issues.some((issue) => issue.type === "reference"));
});

test("warns when edit and extend modes do not match prompt wording", () => {
    const edit = reviewVideoPromptBeforeGeneration({
        prompt: "人物魏梁在毕业典礼场景里走向主席台，镜头中景侧向跟拍。",
        taskMode: "edit",
    });
    const extend = reviewVideoPromptBeforeGeneration({
        prompt: "人物魏梁在毕业典礼场景里走向主席台，镜头中景侧向跟拍。",
        taskMode: "extend",
    });

    assert.ok(edit.issues.some((issue) => issue.type === "seedance"));
    assert.ok(extend.issues.some((issue) => issue.type === "seedance"));
});

test("review switch defaults to enabled", () => {
    assert.equal(shouldRunVideoPromptReview({ videoPromptReviewEnabled: "true" }), true);
    assert.equal(shouldRunVideoPromptReview({ videoPromptReviewEnabled: "" }), true);
    assert.equal(shouldRunVideoPromptReview({ videoPromptReviewEnabled: "false" }), false);
});
