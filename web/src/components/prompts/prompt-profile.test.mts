import assert from "node:assert/strict";
import test from "node:test";

import { composePromptRecipe, normalizePromptProfile, type PromptProfile } from "./prompt-profile.ts";
import { normalizePromptMetadata } from "./prompt-template.ts";

test("legacy prompt metadata stays optional template", () => {
    assert.deepEqual(normalizePromptMetadata({}), {
        nodeGroup: "",
        type: "",
        scenario: "",
        provider: "",
        model: "",
        inputKind: "",
        outputKind: "",
        variables: [],
        favorite: false,
        kind: "template",
        policy: "optional",
        slot: "",
        enabled: true,
    });
});

test("profile normalization removes empty and duplicate blocks", () => {
    const profile = sampleProfile("project", "project-one", ["统一风格", "  ", "统一风格"]);
    assert.deepEqual(normalizePromptProfile(profile).blocks.map((item) => item.content), ["统一风格"]);
});

test("recipe preserves layer order and locks required company rules", () => {
    const result = composePromptRecipe({
        task: "雨夜街道",
        projectProfile: sampleProfile("project", "project-one", ["低饱和青灰"]),
        personalProfile: sampleProfile("personal", undefined, ["克制景深"]),
        companyStandards: [{ id: "company", title: "交付标准", prompt: "无水印", coverUrl: "", tags: [], metadata: { kind: "standard", policy: "required", enabled: true }, category: "system", githubUrl: "", preview: "", createdAt: "now", updatedAt: "now" }],
    });
    assert.deepEqual(result.sections.map((item) => item.source), ["task", "project", "personal", "company"]);
    assert.equal(result.sections.at(-1)?.locked, true);
});

test("recipe removes duplicate exact blocks and warns about unresolved variables", () => {
    const result = composePromptRecipe({ task: "生成 {角色}", template: "统一风格", personalProfile: sampleProfile("personal", undefined, ["统一风格"]), companyAvailable: true });
    assert.equal(result.sections.filter((item) => item.content === "统一风格").length, 1);
    assert.match(result.warnings.join(" "), /变量/);
});

function sampleProfile(scope: PromptProfile["scope"], projectId: string | undefined, contents: string[]): PromptProfile {
    return {
        id: `${scope}-profile`,
        name: "示例",
        scope,
        projectId,
        nodeGroup: "image",
        blocks: contents.map((content, index) => ({ id: String(index), title: "风格", slot: "style", content, enabled: true })),
        createdAt: "now",
        updatedAt: "now",
    };
}
