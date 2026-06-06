import assert from "node:assert/strict";
import test from "node:test";

import { canInvokeAgentConfig, defaultAgentConfig, defaultAgentConfigs, formatInputVariablesText, mergeAgentConfigs, normalizeAgentConfig, parseInputVariablesText, validateAgentConfig } from "./agent-settings.ts";

test("builds default templates for all first-batch agent kinds", () => {
    const configs = defaultAgentConfigs("2026-01-01T00:00:00.000Z");
    assert.deepEqual(
        configs.map((config) => config.kind),
        ["asset_extractor", "storyboard_director", "image_brief_builder", "video_prompt_builder", "prompt_reviewer"],
    );
    assert.ok(configs.every((config) => config.enabled));
    assert.ok(configs.every((config) => config.writePolicy === "confirm_before_write"));
});

test("merges global and project overrides by agent kind", () => {
    const defaults = defaultAgentConfigs("2026-01-01T00:00:00.000Z");
    const merged = mergeAgentConfigs(
        defaults,
        [
            { ...defaultAgentConfig("video_prompt_builder"), temperature: 0.8, systemPrompt: "全局视频提示词" },
            { ...defaultAgentConfig("image_brief_builder"), systemPrompt: "全局 Brief 提示词" },
        ],
        [{ ...defaultAgentConfig("video_prompt_builder"), projectId: "project-1", enabled: false, systemPrompt: "项目视频提示词" }],
    );
    const video = merged.find((config) => config.kind === "video_prompt_builder");
    const brief = merged.find((config) => config.kind === "image_brief_builder");
    assert.equal(video?.systemPrompt, "项目视频提示词");
    assert.equal(video?.enabled, false);
    assert.equal(video?.projectId, "project-1");
    assert.equal(brief?.systemPrompt, "全局 Brief 提示词");
});

test("validates required fields and reasoning level", () => {
    const invalid = normalizeAgentConfig({ ...defaultAgentConfig("asset_extractor"), name: "", systemPrompt: "", reasoningLevel: "低" as never });
    const result = validateAgentConfig({ ...invalid, reasoningLevel: "低" as never });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("Agent 名称")));
    assert.ok(result.errors.some((error) => error.includes("系统提示词")));
    assert.ok(result.errors.some((error) => error.includes("推理程度")));
});

test("disabled agent configs are not callable", () => {
    const config = { ...defaultAgentConfig("storyboard_director"), enabled: false };
    const result = canInvokeAgentConfig(config);
    assert.equal(result.callable, false);
    assert.equal(result.reason, "Agent 已禁用");
});

test("write policy defaults to confirm before write", () => {
    const config = normalizeAgentConfig({ ...defaultAgentConfig("prompt_reviewer"), writePolicy: "unexpected" as never });
    assert.equal(config.writePolicy, "confirm_before_write");
});

test("input variable text round trips to structured variables", () => {
    const variables = parseInputVariablesText("角色：角色名\n场景: 场景描述");
    assert.deepEqual(variables, [
        { name: "角色", description: "角色名" },
        { name: "场景", description: "场景描述" },
    ]);
    assert.equal(formatInputVariablesText(variables), "角色：角色名\n场景：场景描述");
});
