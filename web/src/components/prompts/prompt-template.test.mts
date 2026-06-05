import assert from "node:assert/strict";
import test from "node:test";

import { formatPromptVariablesText, parsePromptVariablesText, productionBibleValueForVariable, promptTypeLabel, promptVariablesFromTemplate, renderPromptTemplate } from "./prompt-template.ts";

test("extracts variables from template and metadata", () => {
    const variables = promptVariablesFromTemplate("让 {角色} 在 {场景} 完成 {镜头}", {
        variables: [
            { name: "角色", description: "主角" },
            { name: "时长", defaultValue: "8 秒" },
        ],
    });

    assert.deepEqual(
        variables.map((item) => item.name),
        ["角色", "时长", "场景", "镜头"],
    );
    assert.equal(variables[0].description, "主角");
    assert.equal(variables[1].defaultValue, "8 秒");
});

test("renders prompt templates with provided values", () => {
    assert.equal(renderPromptTemplate("{角色} 走进 {场景}，镜头 {镜头}", { 角色: "魏梁", 场景: "毕业典礼", 镜头: "侧向跟拍" }), "魏梁 走进 毕业典礼，镜头 侧向跟拍");
    assert.equal(renderPromptTemplate("{角色} 走进 {场景}", { 角色: "魏梁" }), "魏梁 走进 {场景}");
});

test("parses and formats variable description text", () => {
    const variables = parsePromptVariablesText("角色 | 主角设定 | 魏梁\n场景 | 发生地点");
    assert.deepEqual(variables, [
        { name: "角色", description: "主角设定", defaultValue: "魏梁" },
        { name: "场景", description: "发生地点", defaultValue: "" },
    ]);
    assert.equal(formatPromptVariablesText(variables), "角色 | 主角设定 | 魏梁\n场景 | 发生地点");
});

test("labels prompt types and fills variables from production bible items", () => {
    assert.equal(promptTypeLabel("video"), "视频");
    assert.equal(
        productionBibleValueForVariable("角色", {
            id: "pb-1",
            projectId: "project-1",
            kind: "character",
            name: "魏梁",
            description: "穿学士袍，克制坚定",
            tags: [],
            assetRefs: [],
            promptSnippets: { positive: "真实自然", consistency: "服装和短发保持一致" },
            createdAt: "",
            updatedAt: "",
        }),
        "魏梁，穿学士袍，克制坚定，真实自然，服装和短发保持一致",
    );
});
