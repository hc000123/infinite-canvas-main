import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("subject cards expose upload, generation, and character voice actions", () => {
    const card = read("./components/asset-subject-card.tsx");
    const results = read("./components/asset-results-section.tsx");
    assert.match(card, />上传</);
    assert.match(card, />生成</);
    assert.match(card, />匹配声音</);
    assert.match(card, /subject\.category === "character"/);
    assert.match(card, /line-clamp-2[^>]*>\{summary\.prompt/);
    assert.match(results, /onUpload/);
    assert.match(results, /onMatchVoice/);
});
