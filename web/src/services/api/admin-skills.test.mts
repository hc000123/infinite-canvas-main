import assert from "node:assert/strict";
import test from "node:test";

import { buildSkillFolderFormData } from "./skill-folder-form.ts";

test("folder import preserves complete relative paths and parallel file entries", () => {
    const skill = new File(["# Skill"], "SKILL.md", { type: "text/markdown" });
    const rule = new File(["preserve"], "dialogue.md", { type: "text/markdown" });
    Object.defineProperty(skill, "webkitRelativePath", { value: "Seedance/SKILL.md" });
    Object.defineProperty(rule, "webkitRelativePath", { value: "Seedance/rules/dialogue.md" });
    const form = buildSkillFolderFormData([skill, rule], { ownerType: "system", stageKey: "script", name: "\u5267\u672c Skill", summary: "\u6574\u7406\u5267\u672c", version: "2.0.0" });
    assert.deepEqual(form.getAll("paths"), ["Seedance/SKILL.md", "Seedance/rules/dialogue.md"]);
    assert.equal(form.getAll("files").length, 2);
    assert.equal(form.get("folderName"), "Seedance");
    assert.equal(form.get("stageKey"), "script");
    assert.equal(form.get("name"), "\u5267\u672c Skill");
    assert.equal(form.get("summary"), "\u6574\u7406\u5267\u672c");
    assert.equal(form.get("version"), "2.0.0");
});

test("folder import rejects a selection without root SKILL.md", () => {
    const file = new File(["rule"], "rule.md", { type: "text/markdown" });
    assert.throws(() => buildSkillFolderFormData([file], { ownerType: "system", stageKey: "script" }), /SKILL\.md/);
});

test("folder import preserves explicitly empty confirmation fields", () => {
    const skill = new File(["# Skill"], "SKILL.md");
    const form = buildSkillFolderFormData([skill], { ownerType: "system", stageKey: "script", name: "Skill", summary: "", version: "" });
    assert.equal(form.has("summary"), true);
    assert.equal(form.get("summary"), "");
    assert.equal(form.has("version"), true);
    assert.equal(form.get("version"), "");
    const omitted = buildSkillFolderFormData([skill], { ownerType: "system", stageKey: "script" });
    assert.equal(omitted.has("summary"), false);
    assert.equal(omitted.has("version"), false);
});
