import assert from "node:assert/strict";
import test from "node:test";

import {
    canInvokeAgentConfig,
    defaultAgentConfig,
    defaultAgentConfigs,
    fillAgentPromptTemplate,
    formatInputVariablesText,
    mergeAgentConfigs,
    normalizeAgentConfig,
    parseInputVariablesText,
    projectAgentConfigOverrides,
    validateAgentConfig,
} from "./agent-settings.ts";

test("builds default templates for all first-batch agent kinds", () => {
    const configs = defaultAgentConfigs("2026-01-01T00:00:00.000Z");
    assert.deepEqual(
        configs.map((config) => config.kind),
        ["script_optimizer", "script_analyzer", "asset_extractor", "storyboard_director", "image_brief_builder", "video_prompt_builder", "prompt_reviewer"],
    );
    assert.ok(configs.every((config) => config.enabled));
    assert.ok(configs.every((config) => config.writePolicy === "confirm_before_write"));
    assert.ok(configs.every((config) => !config.kind.includes("seedance_workflow")));
    assert.ok(configs.slice(0, 4).every((config) => config.skillSummary?.includes("Skill")));
});

test("script optimizer embeds script-to-ai-script white paper production rules", () => {
    const config = defaultAgentConfig("script_optimizer");
    const content = [config.systemPrompt, config.skillSummary, config.userPromptTemplate].join("\n");

    for (const marker of ["AI 剧本母版", "每场生产备注", "视觉方向", "连续性", "风险提示", "禁止项"]) {
        assert.ok(content.includes(marker), `missing white paper marker: ${marker}`);
    }
    assert.match(content, /不是\s*Prompt|不是提示词|不要输出.*Prompt/);
    assert.match(content, /不是分镜脚本|不写分镜|不输出分镜/);
});

test("asset extractor preserves character gender and identity from script evidence", () => {
    const config = defaultAgentConfig("asset_extractor");
    const content = [config.systemPrompt, config.userPromptTemplate].join("\n");

    for (const marker of ["性别", "年龄", "身份", "代词", "称谓", "不得根据姓名", "待确认"]) {
        assert.ok(content.includes(marker), `missing asset identity guard: ${marker}`);
    }
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

test("returns stable project override references for component memo dependencies", () => {
    const existing = [{ ...defaultAgentConfig("asset_extractor"), projectId: "project-1", systemPrompt: "项目资产提取" }];
    const projectConfigs = { "project-1": existing };

    assert.equal(projectAgentConfigOverrides(projectConfigs, "project-1"), existing);
    assert.equal(projectAgentConfigOverrides(projectConfigs, "missing"), projectAgentConfigOverrides(projectConfigs, "missing"));
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

test("fills agent prompt variables without hiding missing inputs", () => {
    const rendered = fillAgentPromptTemplate("剧本：{scriptSnapshot}\n角色：{characters}\n缺失：{missing}", { scriptSnapshot: "第一幕", characters: ["魏梁", "周泽"] });
    assert.equal(rendered, "剧本：第一幕\n角色：魏梁、周泽\n缺失：{missing}");
});
