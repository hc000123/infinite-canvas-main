import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveSkillTrialTextPreview } from "./skill-trial-result-preview.ts";

test("shows productionScript as readable text with real line breaks", () => {
    const preview = resolveSkillTrialTextPreview({ productionScript: "第九集\n\n场9-1 街道 外 夜\n△叶清语停下脚步。" });

    assert.deepEqual(preview, {
        label: "剧本正文",
        text: "第九集\n\n场9-1 街道 外 夜\n△叶清语停下脚步。",
    });
    assert.equal(preview?.text.includes("\\n"), false);
});

test("shows a direct text artifact without JSON quoting", () => {
    assert.deepEqual(resolveSkillTrialTextPreview("第一行\n第二行"), { label: "文本内容", text: "第一行\n第二行" });
});

test("keeps structured non-text artifacts in JSON view", () => {
    assert.equal(resolveSkillTrialTextPreview({ items: [{ id: "shot-1" }] }), undefined);
    assert.equal(resolveSkillTrialTextPreview({ productionScript: "" }), undefined);
});

test("trial result uses readable standard preview and keeps a technical JSON tab", () => {
    const panel = readFileSync(new URL("./skill-trial-panel.tsx", import.meta.url), "utf8");

    assert.match(panel, /StandardArtifactPreview value=\{result\.standard\}/);
    assert.match(panel, /key: "standard-json", label: "技术 JSON"/);
    assert.match(panel, /\{preview\.text\}/);
});
