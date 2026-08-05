import assert from "node:assert/strict";
import test from "node:test";

import { buildSkillFolderFormData } from "./skill-folder-form.ts";

test("folder import preserves complete relative paths and parallel file entries", () => {
    const skill = new File(["# Skill"], "SKILL.md", { type: "text/markdown" });
    const rule = new File(["preserve"], "dialogue.md", { type: "text/markdown" });
    Object.defineProperty(skill, "webkitRelativePath", { value: "Seedance/SKILL.md" });
    Object.defineProperty(rule, "webkitRelativePath", { value: "Seedance/rules/dialogue.md" });
    const form = buildSkillFolderFormData([skill, rule], { ownerType: "system", stageKey: "script" });
    assert.deepEqual(form.getAll("paths"), ["Seedance/SKILL.md", "Seedance/rules/dialogue.md"]);
    assert.equal(form.getAll("files").length, 2);
    assert.equal(form.get("folderName"), "Seedance");
    assert.equal(form.get("stageKey"), "script");
});

test("folder import rejects a selection without root SKILL.md", () => {
    const file = new File(["rule"], "rule.md", { type: "text/markdown" });
    assert.throws(() => buildSkillFolderFormData([file], { ownerType: "system", stageKey: "script" }), /SKILL\.md/);
});
