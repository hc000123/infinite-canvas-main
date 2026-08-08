import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { buildCandidateImageInput, buildGenerationTrace, imageRequestMode } from "./asset-workbench-generation.ts";

test("chooses edit only when references are attached", () => {
    assert.equal(imageRequestMode(0), "generation");
    assert.equal(imageRequestMode(2), "edit");
});

test("builds project and subject-aware task trace metadata", () => {
    assert.deepEqual(buildGenerationTrace({ id: "subject-1", projectId: "project-1", name: "小也" }, { id: "variant-1", name: "战损" }, 2), {
        projectId: "project-1",
        sourceType: "image_generation",
        sourceId: "subject-1:variant-1",
        inputSummary: "小也 / 战损；参考图 2 张",
    });
});

test("converts uploaded generation output into a persistent candidate", () => {
    const result = buildCandidateImageInput({ id: "subject-1" }, { id: "variant-1", prompt: "角色正面" }, { url: "blob:result", storageKey: "image:1", width: 1024, height: 1024, bytes: 100, mimeType: "image/png" }, { model: "model-a", quality: "high", size: "1:1" }, "2026-08-08T00:00:00.000Z", 1);
    assert.equal(result.role, "candidate");
    assert.equal(result.source, "generated");
    assert.equal(result.generation?.prompt, "角色正面");
    assert.equal(result.generation?.model, "model-a");
    assert.equal(result.title, "生成候选 1");
});

test("wires the generation hook to generation, edit, retry and persistent candidate actions", () => {
    const hook = new URL("./[subjectId]/use-asset-workbench-generation.ts", import.meta.url);
    assert.equal(existsSync(hook), true);
    const source = readFileSync(hook, "utf8");
    assert.match(source, /requestGeneration/);
    assert.match(source, /requestEdit/);
    assert.match(source, /retrySlot/);
    assert.match(source, /addWorkbenchImage/);
    assert.match(source, /Promise\.allSettled/);
});
