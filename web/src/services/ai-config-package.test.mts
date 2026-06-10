import assert from "node:assert/strict";
import test from "node:test";

import { createAiConfigPackageTemplate, parseAiConfigPackage } from "./ai-config-package.ts";

test("parses nested AI config packages with only supported fields", () => {
    const result = parseAiConfigPackage(
        JSON.stringify({
            schema: "blink-workbench.ai-config.v1",
            aiConfig: {
                channelMode: "local",
                baseUrl: "https://api.example.com",
                apiKey: "sk-test",
                imageModel: "gpt-image-2",
                videoGenerateAudio: false,
                thinkingMode: true,
                reasoningEffort: "high",
                models: ["gpt-image-2", "gpt-image-2", "gpt-5.5"],
                unsafeField: "ignored",
            },
        }),
    );

    assert.equal(result.patch.channelMode, "remote");
    assert.equal(result.patch.baseUrl, "https://api.example.com");
    assert.equal(result.patch.apiKey, "sk-test");
    assert.equal(result.patch.videoGenerateAudio, "false");
    assert.equal(result.patch.thinkingMode, "true");
    assert.equal(result.patch.reasoningEffort, "high");
    assert.deepEqual(result.patch.models, ["gpt-image-2", "gpt-5.5"]);
    assert.equal("unsafeField" in result.patch, false);
});

test("template is importable", () => {
    const result = parseAiConfigPackage(createAiConfigPackageTemplate());

    assert.equal(result.patch.channelMode, "remote");
    assert.equal(result.patch.baseUrl, "https://api.openai.com");
    assert.ok(result.importedKeys.includes("apiKey"));
});
